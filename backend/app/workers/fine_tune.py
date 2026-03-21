from __future__ import annotations

import asyncio
from uuid import UUID

from backend.app.domain.enums import TaskStatus, WorkflowStage
from backend.app.repositories.workflow_session import update_session_stage
from backend.app.workers.shared import emit_completion, emit_event, emit_failure, ensure_not_cancelled


async def run_fine_tune(runtime_state, session_id: UUID, task_id: UUID) -> None:
    async with runtime_state.database.connection() as connection:
        await update_session_stage(
            connection,
            session_id,
            WorkflowStage.FINE_TUNE,
            fine_tune_enabled=True,
            fine_tune_resolved=False,
        )
        for epoch in range(1, 4):
            if await ensure_not_cancelled(connection, task_id):
                await emit_failure(runtime_state, connection, session_id, task_id, "Fine-tune был остановлен пользователем.")
                return
            await asyncio.sleep(0.2)
            progress = epoch / 3
            await emit_event(
                runtime_state,
                connection,
                session_id,
                task_id,
                "fine_tune.progress",
                {
                    "epoch": epoch,
                    "totalEpochs": 3,
                    "loss": round(0.9 / epoch, 4),
                    "etaSeconds": int((3 - epoch) * 2),
                    "message": "Stub fine-tune progress",
                    "progress": progress,
                },
                status=TaskStatus.RUNNING,
                progress=progress,
                message=f"epoch {epoch}/3",
            )
        await update_session_stage(
            connection,
            session_id,
            WorkflowStage.MODE_SELECT,
            fine_tune_enabled=True,
            fine_tune_resolved=True,
        )
        await emit_completion(runtime_state, connection, session_id, task_id, WorkflowStage.MODE_SELECT)
