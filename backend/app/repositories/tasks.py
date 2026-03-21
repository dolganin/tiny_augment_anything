from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from psycopg.types.json import Jsonb

from backend.app.domain.enums import TaskStatus, TaskType


async def create_task(
    connection,
    session_id: UUID,
    task_type: TaskType,
    payload: dict[str, Any],
    dataset_version_id: UUID | None,
) -> dict[str, str]:
    task_id = uuid4()
    now = datetime.now(timezone.utc)
    await connection.execute(
        """
        INSERT INTO tasks (
            id,
            session_id,
            task_type,
            status,
            dataset_version_id,
            payload,
            created_at
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        """,
        (
            task_id,
            session_id,
            task_type.value,
            TaskStatus.PENDING.value,
            dataset_version_id,
            Jsonb(payload),
            now,
        ),
    )
    return {"jobId": str(task_id), "status": TaskStatus.PENDING.value}


async def get_task(connection, task_id: UUID) -> dict[str, Any] | None:
    async with connection.cursor() as cursor:
        await cursor.execute("SELECT * FROM tasks WHERE id = %s", (task_id,))
        return await cursor.fetchone()


async def get_task_status(connection, session_id: UUID, task_id: UUID) -> dict[str, Any] | None:
    async with connection.cursor() as cursor:
        await cursor.execute(
            """
            SELECT id, status, progress, message, error, task_type, created_at, started_at, finished_at
            FROM tasks
            WHERE id = %s AND session_id = %s
            """,
            (task_id, session_id),
        )
        return await cursor.fetchone()


async def cancel_task(connection, session_id: UUID, task_id: UUID) -> dict[str, Any] | None:
    now = datetime.now(timezone.utc)
    async with connection.cursor() as cursor:
        await cursor.execute(
            """
            UPDATE tasks
            SET status = %s,
                heartbeat_at = %s,
                finished_at = %s
            WHERE id = %s
              AND session_id = %s
              AND status IN (%s, %s)
            RETURNING id, status
            """,
            (
                TaskStatus.CANCELLED.value,
                now,
                now,
                task_id,
                session_id,
                TaskStatus.PENDING.value,
                TaskStatus.RUNNING.value,
            ),
        )
        return await cursor.fetchone()


async def update_task_state(
    connection,
    task_id: UUID,
    status: TaskStatus,
    *,
    progress: float | None = None,
    message: str | None = None,
    error: dict[str, Any] | None = None,
) -> None:
    now = datetime.now(timezone.utc)
    payload = Jsonb(error) if error is not None else None
    await connection.execute(
        """
        UPDATE tasks
        SET status = %s,
            progress = COALESCE(%s, progress),
            message = COALESCE(%s, message),
            error = COALESCE(%s, error),
            heartbeat_at = %s,
            started_at = CASE WHEN started_at IS NULL AND %s = 'running' THEN %s ELSE started_at END,
            finished_at = CASE WHEN %s IN ('success', 'error', 'cancelled') THEN %s ELSE finished_at END
        WHERE id = %s
        """,
        (status.value, progress, message, payload, now, status.value, now, status.value, now, task_id),
    )


async def save_task_event(
    connection,
    session_id: UUID,
    task_id: UUID,
    event_type: str,
    payload: dict[str, Any],
) -> None:
    now = datetime.now(timezone.utc)
    await connection.execute(
        """
        INSERT INTO task_events (task_id, session_id, event_type, payload, created_at)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (task_id, session_id, event_type, Jsonb(payload), now),
    )
