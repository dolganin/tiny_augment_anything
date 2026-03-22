from __future__ import annotations

import asyncio

from backend.app.config.settings import load_settings
from backend.app.services.bootstrap import bootstrap_ml_runtime, shutdown_ml_runtime
from backend.app.services.queue import dequeue_ml_task
from backend.app.workers.ml_generation import execute_ml_generation


async def main() -> None:
    runtime_state = await bootstrap_ml_runtime(load_settings())
    try:
        while True:
            task_payload = await dequeue_ml_task(runtime_state.redis, runtime_state.settings)
            if task_payload is None:
                continue
            task_type = task_payload.get("taskType")
            if task_type not in {"diffusion.modify", "diffusion.generate"}:
                continue
            await execute_ml_generation(runtime_state, task_payload)
    finally:
        await shutdown_ml_runtime(runtime_state)


if __name__ == "__main__":
    asyncio.run(main())
