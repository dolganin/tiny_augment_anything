from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from backend.app.domain.enums import WorkflowStage


async def get_session_context(connection, session_id: UUID) -> dict[str, Any] | None:
    async with connection.cursor() as cursor:
        await cursor.execute(
            """
            SELECT
                id,
                dataset_id,
                current_dataset_version_id,
                selected_classes,
                current_mode,
                workflow_stage,
                fine_tune_enabled,
                fine_tune_resolved,
                last_download_path
            FROM sessions
            WHERE id = %s
            """,
            (session_id,),
        )
        return await cursor.fetchone()


async def update_session_stage(
    connection,
    session_id: UUID,
    stage: WorkflowStage,
    *,
    mode: str | None = None,
    fine_tune_enabled: bool | None = None,
    fine_tune_resolved: bool | None = None,
    download_path: str | None = None,
) -> None:
    now = datetime.now(timezone.utc)
    await connection.execute(
        """
        UPDATE sessions
        SET workflow_stage = %s,
            current_mode = COALESCE(%s, current_mode),
            fine_tune_enabled = COALESCE(%s, fine_tune_enabled),
            fine_tune_resolved = COALESCE(%s, fine_tune_resolved),
            last_download_path = COALESCE(%s, last_download_path),
            revision = revision + 1,
            updated_at = %s,
            last_seen_at = %s
        WHERE id = %s
        """,
        (stage.value, mode, fine_tune_enabled, fine_tune_resolved, download_path, now, now, session_id),
    )


async def update_session_download_path(connection, session_id: UUID, download_path: str) -> None:
    now = datetime.now(timezone.utc)
    await connection.execute(
        """
        UPDATE sessions
        SET last_download_path = %s,
            revision = revision + 1,
            updated_at = %s,
            last_seen_at = %s
        WHERE id = %s
        """,
        (download_path, now, now, session_id),
    )


async def sync_session_state(
    connection,
    session_id: UUID,
    *,
    stage: WorkflowStage,
    mode: str | None,
    fine_tune_enabled: bool | None,
    fine_tune_resolved: bool | None,
) -> None:
    await update_session_stage(
        connection,
        session_id,
        stage,
        mode=mode,
        fine_tune_enabled=fine_tune_enabled,
        fine_tune_resolved=fine_tune_resolved,
    )
