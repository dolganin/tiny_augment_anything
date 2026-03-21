from __future__ import annotations

import asyncio
from uuid import UUID

from backend.app.config.settings import load_settings
from backend.app.domain.enums import TaskType
from backend.app.services.bootstrap import bootstrap_runtime, shutdown_runtime
from backend.app.services.queue import dequeue_task
from backend.app.workers.classifier import run_classifier
from backend.app.workers.fine_tune import run_fine_tune
from backend.app.workers.generation import run_generation


async def main() -> None:
    runtime_state = await bootstrap_runtime(load_settings())
    try:
        while True:
            task_payload = await dequeue_task(runtime_state.redis, runtime_state.settings)
            if task_payload is None:
                continue
            task_id = UUID(task_payload["taskId"])
            session_id = UUID(task_payload["sessionId"])
            task_type = task_payload["taskType"]
            if task_type == TaskType.FINE_TUNE.value:
                await run_fine_tune(runtime_state, session_id, task_id)
                continue
            if task_type == TaskType.GENERATION.value:
                await run_generation(runtime_state, session_id, task_id, "generate")
                continue
            if task_type == TaskType.MODIFICATION.value:
                await run_generation(runtime_state, session_id, task_id, "modify")
                continue
            if task_type == TaskType.CLASSIFIER.value:
                await run_classifier(runtime_state, session_id, task_id)
                continue
    finally:
        await shutdown_runtime(runtime_state)


if __name__ == "__main__":
    asyncio.run(main())
