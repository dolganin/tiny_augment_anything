from __future__ import annotations

import asyncio
import json
import os
import re
from pathlib import Path
from typing import Any

from backend.app.runtime.logging import get_logger, log_event
from backend.app.services.classifier_runtime import (
    build_classifier_bundle_from_dir,
    is_cancellation_requested,
    read_metrics,
    write_state,
)


logger = get_logger(__name__)
EPOCH_RE = re.compile(r"Epoch\s+(?P<epoch>\d+)\s+\|\s+Val Loss:\s+(?P<loss>[0-9.]+)\s+\|\s+Val F1 Macro:\s+(?P<f1>[0-9.]+)")


async def execute_classifier_training(runtime_state, task_payload: dict[str, Any]) -> None:
    run_dir_value = task_payload.get("runDir")
    if not isinstance(run_dir_value, str) or not run_dir_value:
        log_event(logger, 30, "ml_worker.classifier.invalid_payload", task_payload=task_payload)
        return

    bundle = build_classifier_bundle_from_dir(Path(run_dir_value))
    config = _load_json_dict(bundle.config_path)
    if not config:
        write_state(
            bundle,
            {
                "status": "error",
                "phase": "failed",
                "progress": 1.0,
                "message": "Classifier config is missing.",
            },
        )
        return

    if is_cancellation_requested(bundle):
        write_state(
            bundle,
            {
                "status": "cancelled",
                "phase": "cancelled",
                "progress": 1.0,
                "message": "cancelled",
            },
        )
        return

    command = _build_command(runtime_state.settings, config, bundle)
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    env["MLFLOW_TRACKING_URI"] = f"file:{(bundle.run_dir / 'mlruns').resolve()}"

    total_epochs = int(config.get("hparams", {}).get("epochs", 10))
    write_state(
        bundle,
        {
            "status": "running",
            "phase": "starting",
            "progress": 0.15,
            "message": "Запускаю uv run do-finetune из корня проекта.",
            "epoch": 0,
            "totalEpochs": total_epochs,
        },
    )

    log_event(
        logger,
        20,
        "ml_worker.classifier.begin",
        run_dir=bundle.run_dir,
        command=command,
        cwd=runtime_state.settings.classifier_pipeline_root,
    )

    with bundle.stdout_log_path.open("w", encoding="utf-8") as stdout_file, bundle.stderr_log_path.open(
        "w", encoding="utf-8"
    ) as stderr_file:
        process = await asyncio.create_subprocess_exec(
            *command,
            cwd=str(runtime_state.settings.classifier_pipeline_root),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )
        stdout_task = asyncio.create_task(
            _consume_stdout(process, bundle, stdout_file, total_epochs)
        )
        stderr_task = asyncio.create_task(_consume_stderr(process, stderr_file))
        try:
            while True:
                if is_cancellation_requested(bundle):
                    process.terminate()
                    await process.wait()
                    write_state(
                        bundle,
                        {
                            "status": "cancelled",
                            "phase": "cancelled",
                            "progress": 1.0,
                            "message": "cancelled",
                        },
                    )
                    return
                if process.returncode is not None:
                    break
                try:
                    await asyncio.wait_for(process.wait(), timeout=0.5)
                except TimeoutError:
                    continue
            await stdout_task
            await stderr_task
        finally:
            if not stdout_task.done():
                stdout_task.cancel()
            if not stderr_task.done():
                stderr_task.cancel()

    if process.returncode != 0:
        stderr_tail = _read_log_tail(bundle.stderr_log_path)
        stdout_tail = _read_log_tail(bundle.stdout_log_path)
        log_event(
            logger,
            40,
            "ml_worker.classifier.failed",
            run_dir=bundle.run_dir,
            return_code=process.returncode,
            stderr=stderr_tail,
            stdout=stdout_tail,
        )
        write_state(
            bundle,
            {
                "status": "error",
                "phase": "failed",
                "progress": 1.0,
                "message": stderr_tail or stdout_tail or f"Classifier subprocess exited with code {process.returncode}.",
            },
        )
        return

    metrics = read_metrics(bundle)
    if not metrics:
        write_state(
            bundle,
            {
                "status": "error",
                "phase": "failed",
                "progress": 1.0,
                "message": "После обучения не найден metrics.json.",
            },
        )
        return

    write_state(
        bundle,
        {
            "status": "success",
            "phase": "completed",
            "progress": 1.0,
            "message": "Обучение классификатора завершено.",
            "epoch": total_epochs,
            "totalEpochs": total_epochs,
            "metrics": metrics,
        },
    )


async def _consume_stdout(process, bundle, stdout_file, total_epochs: int) -> None:
    assert process.stdout is not None
    while True:
        line = await process.stdout.readline()
        if not line:
            return
        text = line.decode("utf-8", errors="ignore")
        stdout_file.write(text)
        stdout_file.flush()
        stripped = text.strip()
        match = EPOCH_RE.search(stripped)
        if match:
            epoch = int(match.group("epoch"))
            progress = min(0.95, 0.15 + 0.8 * (epoch / max(total_epochs, 1)))
            write_state(
                bundle,
                {
                    "status": "running",
                    "phase": "training",
                    "progress": progress,
                    "message": stripped,
                    "epoch": epoch,
                    "totalEpochs": total_epochs,
                    "valLoss": float(match.group("loss")),
                    "valF1Macro": float(match.group("f1")),
                },
            )


async def _consume_stderr(process, stderr_file) -> None:
    assert process.stderr is not None
    while True:
        line = await process.stderr.readline()
        if not line:
            return
        stderr_file.write(line.decode("utf-8", errors="ignore"))
        stderr_file.flush()


def _build_command(settings, config: dict[str, Any], bundle) -> list[str]:
    hparams = config.get("hparams", {})
    class_names = [str(item) for item in config.get("classNames", []) if isinstance(item, str)]
    hydra_run_dir = bundle.run_dir / "hydra_output"
    command = [
        settings.classifier_uv_bin,
        "run",
        "do-finetune",
        f"model={config['modelKey']}",
        f"model.object.num_classes={len(class_names)}",
        f"dataloader.train_root={config['trainRoot']}",
        f"dataloader.val_root={config['valRoot']}",
        f"dataloader.train_batch_size={int(hparams.get('train_batch_size', 32))}",
        f"dataloader.val_batch_size={int(hparams.get('val_batch_size', 64))}",
        "dataloader.sampler_type=balanced",
        "dataloader.weights_root=null",
        f"dataloader.num_workers={0}",
        f"optimizer.lr={float(hparams.get('learning_rate', 3e-4))}",
        f"optimizer.weight_decay={float(hparams.get('weight_decay', 1e-6))}",
        f"train.epochs={int(hparams.get('epochs', 10))}",
        f"train.checkpoint_path={bundle.checkpoints_dir}",
        f"hydra.run.dir={hydra_run_dir}",
    ]
    pretrained_weights_path = config.get("pretrainedWeightsPath")
    if isinstance(pretrained_weights_path, str) and pretrained_weights_path:
        command.append("model.object.pretrained=false")
        command.append(f"model.model_path.local_checkpoint_path={pretrained_weights_path}")
    return command


def _load_json_dict(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    return payload if isinstance(payload, dict) else {}


def _read_log_tail(path: Path, limit: int = 3000) -> str:
    if not path.exists():
        return ""
    content = path.read_text(encoding="utf-8", errors="ignore")
    return content[-limit:].strip()
