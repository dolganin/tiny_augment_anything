from __future__ import annotations

import asyncio
from time import monotonic
from uuid import UUID

from backend.app.domain.enums import TaskStatus, WorkflowStage
from backend.app.repositories.workflow_session import update_session_stage
from backend.app.services.configuration import generation_default_config
from backend.app.services.queue import enqueue_ml_task
from backend.app.services.zimage import build_run_bundle, load_state, prepare_run_bundle, request_cancellation
from backend.app.workers.shared import emit_cancelled, emit_completion, emit_event, emit_failure, ensure_not_cancelled


PENDING_TIMEOUT_SECONDS = 30.0
RUNNING_TIMEOUT_SECONDS = 300.0


async def run_fine_tune(runtime_state, session_id: UUID, task_id: UUID) -> None:
    async with runtime_state.database.connection() as connection:
        await update_session_stage(
            connection,
            session_id,
            WorkflowStage.FINE_TUNE,
            fine_tune_enabled=True,
            fine_tune_resolved=False,
        )
        bundle = build_run_bundle(runtime_state.runtime_paths, task_id)
        prepare_run_bundle(
            bundle,
            [],
            {
                "taskId": str(task_id),
                "sessionId": str(session_id),
                "mode": "prepare",
            },
            generation_default_config(runtime_state.settings),
        )
        await emit_event(
            runtime_state,
            connection,
            session_id,
            task_id,
            "fine_tune.progress",
            {
                "phase": "dispatching",
                "message": "Ставлю задачу инициализации диффузионной модели.",
                "progress": 0.1,
            },
            status=TaskStatus.RUNNING,
            progress=0.1,
            message="dispatching runtime initialization",
        )
        await enqueue_ml_task(
            runtime_state.redis,
            runtime_state.settings,
            {
                "taskId": str(task_id),
                "sessionId": str(session_id),
                "taskType": "diffusion.prepare_weights",
                "runDir": str(bundle.run_dir),
            },
        )
        last_snapshot: tuple[object, object, object] | None = None
        last_change_at = monotonic()
        while True:
            if await ensure_not_cancelled(connection, task_id):
                request_cancellation(bundle)
            state = load_state(bundle)
            snapshot = (state.get("status"), state.get("progress"), state.get("message"))
            if snapshot != last_snapshot:
                last_snapshot = snapshot
                last_change_at = monotonic()
                status = state.get("status")
                if status == "running":
                    progress = float(state.get("progress") or 0.0)
                    message = str(state.get("message") or "Инициализирую модель.")
                    await emit_event(
                        runtime_state,
                        connection,
                        session_id,
                        task_id,
                        "fine_tune.progress",
                        {
                            "phase": state.get("phase"),
                            "message": message,
                            "progress": progress,
                        },
                        status=TaskStatus.RUNNING,
                        progress=progress,
                        message=message,
                    )
                if status == "cancelled":
                    await update_session_stage(
                        connection,
                        session_id,
                        WorkflowStage.FINE_TUNE,
                        fine_tune_enabled=False,
                        fine_tune_resolved=False,
                    )
                    await emit_cancelled(runtime_state, connection, session_id, task_id, "Инициализация модели была остановлена пользователем.")
                    return
                if status == "error":
                    await update_session_stage(
                        connection,
                        session_id,
                        WorkflowStage.FINE_TUNE,
                        fine_tune_enabled=False,
                        fine_tune_resolved=False,
                    )
                    await emit_failure(
                        runtime_state,
                        connection,
                        session_id,
                        task_id,
                        str(state.get("message") or "Инициализация модели завершилась с ошибкой."),
                    )
                    return
                if status == "success":
                    break
            status = state.get("status")
            idle_seconds = monotonic() - last_change_at
            if status in {None, "pending"} and idle_seconds >= PENDING_TIMEOUT_SECONDS:
                await update_session_stage(
                    connection,
                    session_id,
                    WorkflowStage.FINE_TUNE,
                    fine_tune_enabled=False,
                    fine_tune_resolved=False,
                )
                await emit_failure(
                    runtime_state,
                    connection,
                    session_id,
                    task_id,
                    "ml-worker не подхватил задачу инициализации модели вовремя.",
                )
                return
            if status == "running" and idle_seconds >= RUNNING_TIMEOUT_SECONDS:
                await update_session_stage(
                    connection,
                    session_id,
                    WorkflowStage.FINE_TUNE,
                    fine_tune_enabled=False,
                    fine_tune_resolved=False,
                )
                await emit_failure(
                    runtime_state,
                    connection,
                    session_id,
                    task_id,
                    str(state.get("message") or "Инициализация модели зависла или оборвалась без финального статуса."),
                )
                return
            await asyncio.sleep(0.5)
        await emit_event(
            runtime_state,
            connection,
            session_id,
            task_id,
            "fine_tune.progress",
            {
                "phase": "runtime_ready",
                "message": str(
                    load_state(bundle).get("message")
                    or "Модель загружена и готова к модификации."
                ),
                "progress": 1.0,
            },
            status=TaskStatus.RUNNING,
            progress=1.0,
            message="diffusion runtime ready",
        )
        await update_session_stage(
            connection,
            session_id,
            WorkflowStage.MODIFY,
            fine_tune_enabled=True,
            fine_tune_resolved=True,
        )
        await emit_completion(runtime_state, connection, session_id, task_id, WorkflowStage.MODIFY)
