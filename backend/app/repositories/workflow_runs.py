from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from psycopg.types.json import Jsonb

from backend.app.domain.enums import TaskStatus


async def create_augmentation_run(
    connection,
    session_id: UUID,
    task_id: UUID,
    mode: str,
    dataset_version_id: UUID,
    prompt: str | None,
    source_asset_id: UUID | None,
    config: dict[str, Any],
    target_count: int,
) -> UUID:
    run_id = uuid4()
    now = datetime.now(timezone.utc)
    await connection.execute(
        """
        INSERT INTO augmentation_runs (
            id,
            session_id,
            task_id,
            mode,
            dataset_version_id,
            prompt,
            source_asset_id,
            config,
            target_count,
            status,
            created_at,
            updated_at
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            run_id,
            session_id,
            task_id,
            mode,
            dataset_version_id,
            prompt,
            source_asset_id,
            Jsonb(config),
            target_count,
            TaskStatus.RUNNING.value,
            now,
            now,
        ),
    )
    return run_id


async def complete_augmentation_run(connection, run_id: UUID, generated_count: int) -> None:
    now = datetime.now(timezone.utc)
    await connection.execute(
        """
        UPDATE augmentation_runs
        SET generated_count = %s,
            status = %s,
            updated_at = %s
        WHERE id = %s
        """,
        (generated_count, TaskStatus.SUCCESS.value, now, run_id),
    )


async def get_latest_augmentation_run(connection, session_id: UUID) -> dict[str, Any] | None:
    async with connection.cursor() as cursor:
        await cursor.execute(
            """
            SELECT *
            FROM augmentation_runs
            WHERE session_id = %s
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (session_id,),
        )
        return await cursor.fetchone()


async def list_pending_results(connection, run_id: UUID) -> list[dict[str, Any]]:
    async with connection.cursor() as cursor:
        await cursor.execute(
            """
            SELECT id, storage_path, preview_path, class_name
            FROM dataset_assets
            WHERE source_run_id = %s
              AND approved_in_version_id IS NULL
              AND approved_at IS NULL
              AND rejected_at IS NULL
              AND deleted_at IS NULL
            ORDER BY created_at ASC
            """,
            (run_id,),
        )
        return await cursor.fetchall()


async def create_classifier_run(connection, session_id: UUID, task_id: UUID, dataset_version_id: UUID) -> UUID:
    run_id = uuid4()
    now = datetime.now(timezone.utc)
    await connection.execute(
        """
        INSERT INTO classifier_runs (id, session_id, task_id, dataset_version_id, status, created_at)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (run_id, session_id, task_id, dataset_version_id, TaskStatus.RUNNING.value, now),
    )
    return run_id


async def finish_classifier_run(connection, run_id: UUID, metrics: dict[str, Any]) -> None:
    now = datetime.now(timezone.utc)
    await connection.execute(
        """
        UPDATE classifier_runs
        SET status = %s, metrics = %s, finished_at = %s
        WHERE id = %s
        """,
        (TaskStatus.SUCCESS.value, Jsonb(metrics), now, run_id),
    )


async def get_latest_metrics(connection, session_id: UUID) -> dict[str, Any] | None:
    async with connection.cursor() as cursor:
        await cursor.execute(
            """
            SELECT metrics
            FROM classifier_runs
            WHERE session_id = %s
              AND status = %s
            ORDER BY finished_at DESC NULLS LAST, created_at DESC
            LIMIT 1
            """,
            (session_id, TaskStatus.SUCCESS.value),
        )
        row = await cursor.fetchone()
    return None if row is None else row["metrics"]
