from __future__ import annotations

from typing import Any
from uuid import UUID


async def list_datasets(connection) -> list[dict[str, Any]]:
    async with connection.cursor() as cursor:
        await cursor.execute(
            """
            SELECT
                d.id AS dataset_id,
                d.name AS dataset_name,
                d.status AS dataset_status,
                d.updated_at,
                s.id AS session_id,
                s.workflow_stage,
                s.current_mode,
                s.fine_tune_enabled,
                s.fine_tune_resolved,
                s.current_dataset_version_id,
                COALESCE(v.version_index, 1) AS version_index,
                COALESCE((v.summary ->> 'assetCount')::int, 0) AS asset_count
            FROM datasets d
            JOIN sessions s ON s.dataset_id = d.id
            LEFT JOIN dataset_versions v ON v.id = s.current_dataset_version_id
            ORDER BY d.updated_at DESC, d.created_at DESC
            """
        )
        return await cursor.fetchall()


async def list_recent_tasks_for_session(connection, session_id: UUID, limit: int) -> list[dict[str, Any]]:
    async with connection.cursor() as cursor:
        await cursor.execute(
            """
            SELECT id, task_type, status, progress, message, error, created_at, finished_at
            FROM tasks
            WHERE session_id = %s
            ORDER BY created_at DESC
            LIMIT %s
            """,
            (session_id, limit),
        )
        return await cursor.fetchall()


async def list_dataset_preview_paths(connection, dataset_id: UUID, limit: int) -> list[str]:
    async with connection.cursor() as cursor:
        await cursor.execute(
            """
            SELECT a.preview_path
            FROM dataset_assets a
            JOIN sessions s ON s.dataset_id = a.dataset_id
            WHERE a.dataset_id = %s
              AND s.current_dataset_version_id IS NOT NULL
              AND a.approved_in_version_id = s.current_dataset_version_id
              AND a.deleted_at IS NULL
            ORDER BY random()
            LIMIT %s
            """,
            (dataset_id, limit),
        )
        rows = await cursor.fetchall()
    return [str(row["preview_path"]) for row in rows]


async def get_latest_session_for_dataset(connection, dataset_id: UUID) -> dict[str, Any] | None:
    async with connection.cursor() as cursor:
        await cursor.execute(
            """
            SELECT id AS session_id
            FROM sessions
            WHERE dataset_id = %s
            ORDER BY updated_at DESC, created_at DESC
            LIMIT 1
            """,
            (dataset_id,),
        )
        return await cursor.fetchone()


async def get_dataset_details(connection, dataset_id: UUID) -> dict[str, Any] | None:
    async with connection.cursor() as cursor:
        await cursor.execute(
            """
            SELECT id, session_id, source_archive_path
            FROM datasets
            WHERE id = %s
            """,
            (dataset_id,),
        )
        return await cursor.fetchone()


async def get_dataset_export_context(connection, dataset_id: UUID) -> dict[str, Any] | None:
    async with connection.cursor() as cursor:
        await cursor.execute(
            """
            SELECT
                d.id AS dataset_id,
                d.name AS dataset_name,
                s.id AS session_id,
                s.current_dataset_version_id,
                COALESCE(v.version_index, 1) AS version_index
            FROM datasets d
            JOIN sessions s ON s.dataset_id = d.id
            LEFT JOIN dataset_versions v ON v.id = s.current_dataset_version_id
            WHERE d.id = %s
            ORDER BY s.updated_at DESC, s.created_at DESC
            LIMIT 1
            """,
            (dataset_id,),
        )
        return await cursor.fetchone()


async def list_session_ids_for_dataset(connection, dataset_id: UUID) -> list[UUID]:
    async with connection.cursor() as cursor:
        await cursor.execute(
            """
            SELECT id
            FROM sessions
            WHERE dataset_id = %s
            """,
            (dataset_id,),
        )
        rows = await cursor.fetchall()
    return [row["id"] for row in rows]
