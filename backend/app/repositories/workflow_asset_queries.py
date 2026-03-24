from __future__ import annotations

from typing import Any
from uuid import UUID

from backend.app.domain.enums import AssetOrigin


async def get_random_approved_asset(connection, session_id: UUID) -> dict[str, Any] | None:
    async with connection.cursor() as cursor:
        await cursor.execute(
            """
            SELECT
                a.id,
                a.storage_path,
                a.preview_path,
                a.class_name,
                a.origin_type
            FROM dataset_assets a
            JOIN sessions s ON s.dataset_id = a.dataset_id
            WHERE s.id = %s
              AND a.approved_in_version_id = s.current_dataset_version_id
              AND a.origin_type = %s
              AND a.deleted_at IS NULL
              AND (
                jsonb_array_length(s.selected_classes) = 0
                OR a.class_name IN (
                  SELECT jsonb_array_elements_text(s.selected_classes)
                )
              )
            ORDER BY random()
            LIMIT 1
            """,
            (session_id, AssetOrigin.ORIGINAL.value),
        )
        return await cursor.fetchone()


async def list_modification_source_assets(
    connection,
    session_id: UUID,
    limit: int = 64,
) -> list[dict[str, Any]]:
    async with connection.cursor() as cursor:
        await cursor.execute(
            """
            SELECT
                a.id,
                a.preview_path,
                a.class_name
            FROM dataset_assets a
            JOIN sessions s ON s.dataset_id = a.dataset_id
            WHERE s.id = %s
              AND a.approved_in_version_id = s.current_dataset_version_id
              AND a.origin_type = %s
              AND a.deleted_at IS NULL
              AND (
                jsonb_array_length(s.selected_classes) = 0
                OR a.class_name IN (
                  SELECT jsonb_array_elements_text(s.selected_classes)
                )
              )
            ORDER BY a.class_name ASC, a.created_at DESC, a.id ASC
            LIMIT %s
            """,
            (session_id, AssetOrigin.ORIGINAL.value, limit),
        )
        return list(await cursor.fetchall())


async def find_asset_by_storage_path(connection, session_id: UUID, storage_path: str) -> dict[str, Any] | None:
    async with connection.cursor() as cursor:
        await cursor.execute(
            """
            SELECT a.*
            FROM dataset_assets a
            JOIN sessions s ON s.dataset_id = a.dataset_id
            WHERE s.id = %s
              AND a.storage_path = %s
              AND a.deleted_at IS NULL
            LIMIT 1
            """,
            (session_id, storage_path),
        )
        return await cursor.fetchone()


async def find_asset_by_id(connection, session_id: UUID, asset_id: UUID) -> dict[str, Any] | None:
    async with connection.cursor() as cursor:
        await cursor.execute(
            """
            SELECT a.*
            FROM dataset_assets a
            JOIN sessions s ON s.dataset_id = a.dataset_id
            WHERE s.id = %s
              AND a.id = %s
              AND a.deleted_at IS NULL
            LIMIT 1
            """,
            (session_id, asset_id),
        )
        return await cursor.fetchone()


async def list_class_reference_preview_paths(connection, session_id: UUID, class_name: str, limit: int) -> list[str]:
    async with connection.cursor() as cursor:
        await cursor.execute(
            """
            SELECT a.preview_path
            FROM dataset_assets a
            JOIN sessions s ON s.dataset_id = a.dataset_id
            WHERE s.id = %s
              AND a.approved_in_version_id = s.current_dataset_version_id
              AND a.class_name = %s
              AND a.deleted_at IS NULL
            ORDER BY a.created_at DESC
            LIMIT %s
            """,
            (session_id, class_name, limit),
        )
        rows = await cursor.fetchall()
    return [str(row["preview_path"]) for row in rows]


async def build_version_summary(connection, dataset_id: UUID, version_id: UUID) -> dict[str, Any]:
    async with connection.cursor() as cursor:
        await cursor.execute(
            """
            SELECT class_name, COUNT(*)::int AS count
            FROM dataset_assets
            WHERE dataset_id = %s
              AND approved_in_version_id = %s
              AND deleted_at IS NULL
            GROUP BY class_name
            ORDER BY count ASC, class_name ASC
            """,
            (dataset_id, version_id),
        )
        rows = await cursor.fetchall()
    return {
        "assetCount": sum(int(row["count"]) for row in rows),
        "classes": [{"name": row["class_name"], "count": int(row["count"])} for row in rows],
    }


async def list_active_assets(connection, dataset_id: UUID, version_id: UUID) -> list[dict[str, Any]]:
    async with connection.cursor() as cursor:
        await cursor.execute(
            """
            SELECT d.name, a.id, a.storage_path, a.class_name
            FROM dataset_assets a
            JOIN datasets d ON d.id = a.dataset_id
            WHERE a.dataset_id = %s
              AND a.approved_in_version_id = %s
              AND a.deleted_at IS NULL
            ORDER BY a.class_name, a.created_at
            """,
            (dataset_id, version_id),
        )
        return await cursor.fetchall()


async def list_active_assets_with_origin(
    connection,
    dataset_id: UUID,
    version_id: UUID,
) -> list[dict[str, Any]]:
    async with connection.cursor() as cursor:
        await cursor.execute(
            """
            SELECT
                a.id,
                a.storage_path,
                a.class_name,
                a.origin_type,
                a.created_at
            FROM dataset_assets a
            WHERE a.dataset_id = %s
              AND a.approved_in_version_id = %s
              AND a.deleted_at IS NULL
            ORDER BY a.class_name, a.created_at
            """,
            (dataset_id, version_id),
        )
        return await cursor.fetchall()
