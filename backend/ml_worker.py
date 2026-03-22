from __future__ import annotations

import asyncio

from backend.app.config.settings import load_settings
from backend.app.runtime.logging import configure_logging, get_logger, log_event
from backend.app.services.bootstrap import bootstrap_ml_runtime, shutdown_ml_runtime
from backend.app.services.queue import dequeue_ml_task
from backend.app.workers.ml_classifier import execute_classifier_training
from backend.app.workers.ml_generation import execute_ml_generation


logger = get_logger(__name__)


async def main() -> None:
    settings = load_settings()
    configure_logging(settings.app_log_level)
    log_event(logger, 20, "ml_worker.startup.begin", runtime_dir=settings.runtime_dir, log_level=settings.app_log_level)
    runtime_state = await bootstrap_ml_runtime(settings)
    log_event(logger, 20, "ml_worker.startup.ready", runtime_dir=runtime_state.settings.runtime_dir)
    try:
        while True:
            task_payload = await dequeue_ml_task(runtime_state.redis, runtime_state.settings)
            if task_payload is None:
                continue
            task_type = task_payload.get("taskType")
            log_event(logger, 20, "ml_worker.task.received", task_type=task_type, task_payload=task_payload)
            if task_type not in {
                "diffusion.prepare_weights",
                "diffusion.modify",
                "diffusion.generate",
                "classifier.train",
            }:
                log_event(logger, 30, "ml_worker.task.unsupported", task_type=task_type, task_payload=task_payload)
                continue
            if task_type == "classifier.train":
                await execute_classifier_training(runtime_state, task_payload)
                continue
            await execute_ml_generation(runtime_state, task_payload)
    finally:
        log_event(logger, 20, "ml_worker.shutdown.begin")
        await shutdown_ml_runtime(runtime_state)
        log_event(logger, 20, "ml_worker.shutdown.complete")


if __name__ == "__main__":
    asyncio.run(main())
