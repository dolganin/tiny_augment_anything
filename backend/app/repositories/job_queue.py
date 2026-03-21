from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from backend.app.domain.enums import TaskStatus


async def list_jobs(connection, limit: int = 30) -> list[dict[str, Any]]:
    async with connection.cursor() as cursor:
        await cursor.execute(
            """
            SELECT
                t.id,
                t.session_id,
                s.dataset_id,
                d.name AS dataset_name,
                t.task_type,
                t.status,
                COALESCE(t.progress, 0) AS progress,
                t.message,
                t.error,
                t.created_at,
                t.started_at,
                t.finished_at,
                t.heartbeat_at
            FROM tasks t
            JOIN sessions s ON s.id = t.session_id
            LEFT JOIN datasets d ON d.id = s.dataset_id
            ORDER BY t.created_at DESC
            LIMIT %s
            """,
            (limit,),
        )
        return await cursor.fetchall()


async def cancel_task_by_id(connection, task_id: UUID) -> dict[str, Any] | None:
    now = datetime.now(timezone.utc)
    async with connection.cursor() as cursor:
        await cursor.execute(
            """
            UPDATE tasks
            SET status = %s,
                heartbeat_at = %s,
                finished_at = %s
            WHERE id = %s
              AND status IN (%s, %s)
            RETURNING id, session_id, status
            """,
            (
                TaskStatus.CANCELLED.value,
                now,
                now,
                task_id,
                TaskStatus.PENDING.value,
                TaskStatus.RUNNING.value,
            ),
        )
        return await cursor.fetchone()
