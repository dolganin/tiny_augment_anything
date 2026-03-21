from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from psycopg.types.json import Jsonb

from backend.app.domain.enums import AssetOrigin, VersionKind


async def create_dataset(
    connection,
    dataset_id: UUID,
    session_id: UUID,
    name: str,
    source_archive_path: str,
    *,
    status: str = "ready",
) -> None:
    now = datetime.now(timezone.utc)
    await connection.execute(
        """
        INSERT INTO datasets (id, session_id, name, source_archive_path, status, created_at, updated_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        """,
        (dataset_id, session_id, name, source_archive_path, status, now, now),
    )


async def create_initial_version(
    connection,
    version_id: UUID,
    dataset_id: UUID,
    manifest_path: str,
    summary: dict[str, Any],
) -> None:
    now = datetime.now(timezone.utc)
    await connection.execute(
        """
        INSERT INTO dataset_versions (
            id,
            dataset_id,
            version_index,
            parent_version_id,
            kind,
            status,
            manifest_path,
            summary,
            created_at
        )
        VALUES (%s, %s, 1, NULL, %s, %s, %s, %s::jsonb, %s)
        """,
        (version_id, dataset_id, VersionKind.IMPORT.value, "ready", manifest_path, Jsonb(summary), now),
    )


async def create_assets(connection, assets: list[dict[str, Any]], version_id: UUID) -> None:
    now = datetime.now(timezone.utc)
    for asset in assets:
        await connection.execute(
            """
            INSERT INTO dataset_assets (
                id,
                dataset_id,
                class_name,
                origin_type,
                storage_path,
                preview_path,
                checksum,
                width,
                height,
                approved_in_version_id,
                created_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, NULL, NULL, %s, %s)
            """,
            (
                asset["id"],
                asset["dataset_id"],
                asset["class_name"],
                AssetOrigin.ORIGINAL.value,
                asset["storage_path"],
                asset["preview_path"],
                asset["checksum"],
                version_id,
                now,
            ),
        )


async def get_dataset_stats(connection, dataset_id: UUID, version_id: UUID) -> list[dict[str, Any]]:
    async with connection.cursor() as cursor:
        await cursor.execute(
            """
            SELECT class_name AS name, COUNT(*)::int AS count
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
    return rows


async def update_dataset_status(connection, dataset_id: UUID, status: str) -> None:
    now = datetime.now(timezone.utc)
    await connection.execute(
        """
        UPDATE datasets
        SET status = %s,
            updated_at = %s
        WHERE id = %s
        """,
        (status, now, dataset_id),
    )
