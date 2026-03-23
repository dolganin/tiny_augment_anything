from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
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
EPOCH_PROGRESS_RE = re.compile(r"Epoch=(?P<epoch>\d+):\s+(?P<percent>\d+)%")
TORCH_WARNING_RE = re.compile(r"^[WE]\d{4}\s+\d{2}:\d{2}:\d{2}\.\d+")


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
    classifier_root = str(runtime_state.settings.classifier_pipeline_root)
    existing_pythonpath = env.get("PYTHONPATH", "").strip()
    env["PYTHONPATH"] = (
        classifier_root
        if not existing_pythonpath
        else f"{classifier_root}:{existing_pythonpath}"
    )
    env.setdefault("UV_PROJECT_ENVIRONMENT", str(Path(classifier_root) / ".venv"))
    env.setdefault("CC", shutil.which("gcc") or shutil.which("cc") or "/usr/bin/gcc")
    env.setdefault("CXX", shutil.which("g++") or "/usr/bin/g++")

    preflight_error = _validate_classifier_environment(runtime_state.settings, env)
    if preflight_error is not None:
        log_event(
            logger,
            40,
            "ml_worker.classifier.preflight_failed",
            run_dir=bundle.run_dir,
            error=preflight_error,
            compiler=env.get("CC"),
            uv=shutil.which(runtime_state.settings.classifier_uv_bin),
            project_env=env.get("UV_PROJECT_ENVIRONMENT"),
        )
        write_state(
            bundle,
            {
                "status": "error",
                "phase": "failed",
                "progress": 1.0,
                "message": preflight_error,
            },
        )
        return

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
        pythonpath=env["PYTHONPATH"],
        compiler=env.get("CC"),
        project_env=env.get("UV_PROJECT_ENVIRONMENT"),
    )

    with bundle.stdout_log_path.open("w", encoding="utf-8") as stdout_file, bundle.stderr_log_path.open(
        "w", encoding="utf-8"
    ) as stderr_file:
        try:
            process = await asyncio.create_subprocess_exec(
                *command,
                cwd=str(runtime_state.settings.classifier_pipeline_root),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
            )
        except FileNotFoundError as error:
            message = (
                f"Не удалось запустить classifier subprocess: {error}. "
                f"Команда: {' '.join(command)}"
            )
            log_event(
                logger,
                40,
                "ml_worker.classifier.spawn_failed",
                run_dir=bundle.run_dir,
                command=command,
                cwd=runtime_state.settings.classifier_pipeline_root,
                error=str(error),
            )
            write_state(
                bundle,
                {
                    "status": "error",
                    "phase": "failed",
                    "progress": 1.0,
                    "message": message,
                    "epoch": 0,
                    "totalEpochs": total_epochs,
                },
            )
            return
        log_event(
            logger,
            20,
            "ml_worker.classifier.spawned",
            run_dir=bundle.run_dir,
        )
        write_state(
            bundle,
            {
                "status": "running",
                "phase": "bootstrapping",
                "progress": 0.18,
                "message": "Classifier subprocess запущен. Жду первые логи.",
                "epoch": 0,
                "totalEpochs": total_epochs,
            },
        )
        stdout_task = asyncio.create_task(
            _consume_stdout(process, bundle, stdout_file, total_epochs)
        )
        stderr_task = asyncio.create_task(_consume_stderr(process, bundle, stderr_file, total_epochs))
        try:
            idle_polls = 0
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
                    idle_polls += 1
                    if idle_polls % 20 == 0:
                        current_state = _load_json_dict(bundle.state_path)
                        current_progress = float(current_state.get("progress") or 0.18)
                        current_message = current_state.get("message")
                        if not isinstance(current_message, str) or not current_message.strip():
                            current_message = "Classifier subprocess работает, ожидаю логов."
                        write_state(
                            bundle,
                            {
                                "status": "running",
                                "phase": str(current_state.get("phase") or "bootstrapping"),
                                "progress": current_progress,
                                "message": current_message,
                                "epoch": int(current_state.get("epoch") or 0),
                                "totalEpochs": total_epochs,
                            },
                        )
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
    progress_state: dict[int, int] = {}
    while True:
        line = await process.stdout.readline()
        if not line:
            return
        text = line.decode("utf-8", errors="ignore")
        stdout_file.write(text)
        stdout_file.flush()
        for stripped in _extract_log_chunks(text):
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
                continue

            progress_update = _build_epoch_progress_message(stripped, progress_state, total_epochs)
            if progress_update is not None:
                epoch, message = progress_update
                overall_progress = min(
                    0.94,
                    0.18 + 0.72 * ((epoch - 1) / max(total_epochs, 1)) + 0.04 * (progress_state[epoch] / 100),
                )
                _write_runtime_line(
                    bundle,
                    "training",
                    message,
                    total_epochs,
                    progress=overall_progress,
                    epoch=epoch,
                )
                continue

            cleaned = _clean_runtime_message(stripped)
            if cleaned:
                _write_runtime_line(bundle, "bootstrapping", cleaned, total_epochs, progress=0.2)


async def _consume_stderr(process, bundle, stderr_file, total_epochs: int) -> None:
    assert process.stderr is not None
    progress_state: dict[int, int] = {}
    while True:
        line = await process.stderr.readline()
        if not line:
            return
        text = line.decode("utf-8", errors="ignore")
        stderr_file.write(text)
        stderr_file.flush()
        for stripped in _extract_log_chunks(text):
            progress_update = _build_epoch_progress_message(stripped, progress_state, total_epochs)
            if progress_update is not None:
                epoch, message = progress_update
                overall_progress = min(
                    0.94,
                    0.18 + 0.72 * ((epoch - 1) / max(total_epochs, 1)) + 0.04 * (progress_state[epoch] / 100),
                )
                _write_runtime_line(
                    bundle,
                    "training",
                    message,
                    total_epochs,
                    progress=overall_progress,
                    epoch=epoch,
                )
                continue
            cleaned = _clean_runtime_message(stripped)
            if cleaned:
                _write_runtime_line(bundle, "bootstrapping", cleaned, total_epochs, progress=0.2)


def _build_command(settings, config: dict[str, Any], bundle) -> list[str]:
    hparams = config.get("hparams", {})
    class_names = [str(item) for item in config.get("classNames", []) if isinstance(item, str)]
    hydra_run_dir = bundle.run_dir / "hydra_output"
    command = [
        settings.classifier_uv_bin,
        "run",
        "--frozen",
        "do-finetune",
        f"model={config['modelKey']}",
        "model.object._target_=backend.app.services.classifier_head_override.build_model",
        f"model.object.num_classes={len(class_names)}",
        f"dataloader.train_root={config['trainRoot']}",
        f"dataloader.val_root={config['valRoot']}",
        f"dataloader.train_batch_size={int(hparams.get('train_batch_size', 32))}",
        f"dataloader.val_batch_size={int(hparams.get('val_batch_size', 64))}",
        "dataloader.sampler_type=balanced",
        "dataloader.weights_root=null",
        f"dataloader.num_workers={1}",
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


def _validate_classifier_environment(settings, env: dict[str, str]) -> str | None:
    pipeline_root = Path(settings.classifier_pipeline_root)
    pyproject_path = pipeline_root / "pyproject.toml"
    src_root = pipeline_root / "src" / "tiny_augment"
    uv_path = shutil.which(settings.classifier_uv_bin)
    compiler_path = shutil.which(Path(env.get("CC", "")).name) or (
        env.get("CC") if env.get("CC") and Path(env["CC"]).exists() else None
    )
    project_env = Path(env.get("UV_PROJECT_ENVIRONMENT", "")).resolve() if env.get("UV_PROJECT_ENVIRONMENT") else None

    if uv_path is None:
        return "Classifier environment is incomplete: uv binary is not available in ml-worker."
    if not pyproject_path.exists():
        return f"Classifier environment is incomplete: {pyproject_path} is missing."
    if not src_root.exists():
        return f"Classifier environment is incomplete: {src_root} is missing."
    if compiler_path is None:
        return "Classifier environment is incomplete: C compiler is not available in ml-worker."
    if project_env is not None and not project_env.exists():
        return f"Classifier environment is incomplete: virtualenv {project_env} is missing. Rebuild ml-worker image."
    return None


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


def _write_runtime_line(
    bundle,
    phase: str,
    message: str,
    total_epochs: int,
    *,
    progress: float,
    epoch: int | None = None,
) -> None:
    current_state = _load_json_dict(bundle.state_path)
    current_epoch = epoch if epoch is not None else int(current_state.get("epoch") or 0)
    current_progress = max(progress, float(current_state.get("progress") or 0.0))
    write_state(
        bundle,
        {
            "status": "running",
            "phase": phase,
            "progress": current_progress,
            "message": message[:4000],
            "epoch": current_epoch,
            "totalEpochs": total_epochs,
        },
    )


def _extract_log_chunks(text: str) -> list[str]:
    chunks = []
    for raw_chunk in re.split(r"[\r\n]+", text):
        stripped = raw_chunk.strip()
        if stripped:
            chunks.append(stripped)
    return chunks


def _build_epoch_progress_message(
    stripped: str,
    progress_state: dict[int, int],
    total_epochs: int,
) -> tuple[int, str] | None:
    match = EPOCH_PROGRESS_RE.search(stripped)
    if match is None:
        return None
    epoch = int(match.group("epoch"))
    percent = int(match.group("percent"))
    previous = progress_state.get(epoch, -1)
    if percent < 0 or percent > 100:
        return None
    if percent < 1 and previous >= 0:
        return None
    if previous >= 0 and percent < previous:
        return None
    if previous >= 0 and percent < 100 and percent - previous < 10:
        return None
    progress_state[epoch] = percent
    return epoch, f"Эпоха {epoch}/{max(total_epochs, 1)}: обработано {percent}% батчей."


def _clean_runtime_message(stripped: str) -> str | None:
    lowered = stripped.lower()
    if stripped.startswith("export GIT_PYTHON_REFRESH=quiet"):
        return None
    if "it/s" in stripped and "Epoch=" in stripped:
        return None
    if TORCH_WARNING_RE.match(stripped):
        if "Not enough SMs to use max_autotune_gemm mode" in stripped:
            return "Torch предупреждение: max_autotune_gemm недоступен на текущем GPU, продолжаю со стандартным режимом."
        return f"Torch предупреждение: {stripped.split(']')[-1].strip()}"
    return stripped
