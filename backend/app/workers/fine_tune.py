from __future__ import annotations

import asyncio
from uuid import UUID

from backend.app.domain.enums import TaskStatus, WorkflowStage
from backend.app.repositories.workflow_session import update_session_stage
from backend.app.workers.shared import emit_cancelled, emit_completion, emit_event, emit_failure, ensure_not_cancelled


async def run_fine_tune(runtime_state, session_id: UUID, task_id: UUID) -> None:
    async with runtime_state.database.connection() as connection:
        await update_session_stage(
            connection,
            session_id,
            WorkflowStage.FINE_TUNE,
            fine_tune_enabled=True,
            fine_tune_resolved=False,
        )
        phases = [
            ("Проверяю рантайм модификации.", 0.25),
            ("Подготавливаю окружение модели.", 0.6),
            ("Переход к модификации готов.", 1.0),
        ]
        for epoch, (message, progress) in enumerate(phases, start=1):
            if await ensure_not_cancelled(connection, task_id):
                await emit_cancelled(runtime_state, connection, session_id, task_id, "Подготовка модели была остановлена пользователем.")
                return
            await asyncio.sleep(0.2)
            await emit_event(
                runtime_state,
                connection,
                session_id,
                task_id,
                "fine_tune.progress",
                {
                    "epoch": epoch,
                    "totalEpochs": len(phases),
                    "etaSeconds": int((len(phases) - epoch) * 2),
                    "message": message,
                    "progress": progress,
                },
                status=TaskStatus.RUNNING,
                progress=progress,
                message=message,
            )
        await update_session_stage(
            connection,
            session_id,
            WorkflowStage.MODIFY,
            fine_tune_enabled=True,
            fine_tune_resolved=True,
        )
        await emit_completion(runtime_state, connection, session_id, task_id, WorkflowStage.MODIFY)
