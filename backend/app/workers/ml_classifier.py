from __future__ import annotations

import asyncio
import os
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
from backend.app.workers.ml_classifier_logs import consume_stderr, consume_stdout
from backend.app.workers.ml_classifier_runtime import build_command, load_json_dict, read_log_tail, validate_classifier_environment


logger = get_logger(__name__)


async def execute_classifier_training(runtime_state, task_payload: dict[str, Any]) -> None:
    run_dir_value = task_payload.get("runDir")
    if not isinstance(run_dir_value, str) or not run_dir_value:
        log_event(logger, 30, "ml_worker.classifier.invalid_payload", task_payload=task_payload)
        return

    bundle = build_classifier_bundle_from_dir(Path(run_dir_value))
    config = load_json_dict(bundle.config_path)
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

    command = build_command(runtime_state.settings, config, bundle)
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

    preflight_error = validate_classifier_environment(runtime_state.settings, env)
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
        stdout_task = asyncio.create_task(consume_stdout(process, bundle, stdout_file, total_epochs))
        stderr_task = asyncio.create_task(consume_stderr(process, bundle, stderr_file, total_epochs))
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
                        current_state = load_json_dict(bundle.state_path)
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
        stderr_tail = read_log_tail(bundle.stderr_log_path)
        stdout_tail = read_log_tail(bundle.stdout_log_path)
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

