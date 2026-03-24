from __future__ import annotations

from pathlib import Path
from typing import Any

from backend.app.runtime.logging import get_logger, log_event
from backend.app.services.zimage import (
    build_run_bundle_from_dir,
    is_cancellation_requested,
    write_state,
)
from backend.app.workers.ml_generation_runtime import run_generation


logger = get_logger(__name__)


async def execute_ml_generation(runtime_state, task_payload: dict[str, Any]) -> None:
    run_dir_value = task_payload.get("runDir")
    task_type = task_payload.get("taskType")
    if not isinstance(run_dir_value, str) or not run_dir_value or not isinstance(task_type, str):
        log_event(logger, 30, "ml_worker.task.invalid_payload", task_payload=task_payload)
        return

    bundle = build_run_bundle_from_dir(Path(run_dir_value))
    log_event(logger, 20, "ml_worker.task.begin", task_type=task_type, run_dir=bundle.run_dir)

    if is_cancellation_requested(bundle):
        log_event(
            logger,
            20,
            "ml_worker.task.cancelled_before_start",
            task_type=task_type,
            run_dir=bundle.run_dir,
        )
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

    await run_generation(runtime_state, bundle)
