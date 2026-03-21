from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from psycopg.types.json import Jsonb

from backend.app.domain.enums import TaskStatus, TaskType, WorkflowStage


async def create_session(
    connection,
    session_id: UUID,
    dataset_id: UUID,
    dataset_version_id: UUID,
) -> None:
    now = datetime.now(timezone.utc)
    await connection.execute(
        """
        INSERT INTO sessions (
            id,
            workflow_stage,
            dataset_id,
            current_dataset_version_id,
            selected_classes,
            fine_tune_enabled,
            fine_tune_resolved,
            revision,
            created_at,
            updated_at,
            last_seen_at
        )
        VALUES (%s, %s, %s, %s, '[]'::jsonb, false, false, 1, %s, %s, %s)
        """,
        (session_id, WorkflowStage.DATASET_STATS.value, dataset_id, dataset_version_id, now, now, now),
    )


async def create_pending_session(
    connection,
    session_id: UUID,
    dataset_id: UUID,
) -> None:
    now = datetime.now(timezone.utc)
    await connection.execute(
        """
        INSERT INTO sessions (
            id,
            workflow_stage,
            dataset_id,
            current_dataset_version_id,
            selected_classes,
            fine_tune_enabled,
            fine_tune_resolved,
            revision,
            created_at,
            updated_at,
            last_seen_at
        )
        VALUES (%s, %s, %s, NULL, '[]'::jsonb, false, false, 1, %s, %s, %s)
        """,
        (session_id, WorkflowStage.UPLOAD.value, dataset_id, now, now, now),
    )


async def finalize_import_session(
    connection,
    session_id: UUID,
    dataset_version_id: UUID,
) -> None:
    now = datetime.now(timezone.utc)
    await connection.execute(
        """
        UPDATE sessions
        SET current_dataset_version_id = %s,
            workflow_stage = %s,
            revision = revision + 1,
            updated_at = %s,
            last_seen_at = %s
        WHERE id = %s
        """,
        (dataset_version_id, WorkflowStage.DATASET_STATS.value, now, now, session_id),
    )


async def get_snapshot(connection, session_id: UUID) -> dict[str, Any] | None:
    async with connection.cursor() as cursor:
        await cursor.execute(
            """
            SELECT
                s.id AS session_id,
                s.dataset_id,
                d.name AS dataset_name,
                s.selected_classes,
                s.current_mode,
                s.fine_tune_enabled,
                s.fine_tune_resolved,
                s.workflow_stage,
                s.current_dataset_version_id,
                s.last_download_path,
                s.revision
            FROM sessions s
            LEFT JOIN datasets d ON d.id = s.dataset_id
            WHERE s.id = %s
            """,
            (session_id,),
        )
        row = await cursor.fetchone()
    return row


async def touch_session(connection, session_id: UUID) -> None:
    now = datetime.now(timezone.utc)
    await connection.execute(
        """
        UPDATE sessions
        SET updated_at = %s, last_seen_at = %s
        WHERE id = %s
        """,
        (now, now, session_id),
    )


async def save_selected_classes(
    connection,
    session_id: UUID,
    class_names: Sequence[str],
) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    task_id = uuid4()
    await connection.execute(
        """
        UPDATE sessions
        SET selected_classes = %s::jsonb,
            workflow_stage = %s,
            revision = revision + 1,
            updated_at = %s,
            last_seen_at = %s
        WHERE id = %s
        """,
        (Jsonb(list(class_names)), WorkflowStage.FINE_TUNE.value, now, now, session_id),
    )
    await connection.execute(
        """
        INSERT INTO tasks (
            id,
            session_id,
            task_type,
            status,
            payload,
            created_at,
            started_at,
            finished_at
        )
        VALUES (%s, %s, %s, %s, %s::jsonb, %s, %s, %s)
        """,
        (
            task_id,
            session_id,
            TaskType.SELECT_CLASSES.value,
            TaskStatus.SUCCESS.value,
            Jsonb({"classNames": list(class_names)}),
            now,
            now,
            now,
        ),
    )
    return {"jobId": str(task_id), "status": TaskStatus.SUCCESS.value}
