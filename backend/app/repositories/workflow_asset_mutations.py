from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from backend.app.domain.enums import AssetOrigin


async def create_candidate_asset(
    connection,
    dataset_id: UUID,
    class_name: str,
    origin_type: AssetOrigin,
    storage_path: str,
    preview_path: str,
    checksum: str,
    source_run_id: UUID,
) -> UUID:
    asset_id = uuid4()
    now = datetime.now(timezone.utc)
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
            source_run_id,
            approved_in_version_id,
            created_at
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NULL, %s)
        """,
        (asset_id, dataset_id, class_name, origin_type.value, storage_path, preview_path, checksum, source_run_id, now),
    )
    return asset_id


async def create_asset_link(connection, child_asset_id: UUID, parent_asset_id: UUID) -> None:
    now = datetime.now(timezone.utc)
    await connection.execute(
        """
        INSERT INTO dataset_asset_links (id, child_asset_id, parent_asset_id, relation_type, position, created_at)
        VALUES (%s, %s, %s, %s, 0, %s)
        """,
        (uuid4(), child_asset_id, parent_asset_id, "derived-from", now),
    )


async def reject_asset(connection, session_id: UUID, asset_id: UUID) -> dict[str, Any] | None:
    now = datetime.now(timezone.utc)
    async with connection.cursor() as cursor:
        await cursor.execute(
            """
            UPDATE dataset_assets AS a
            SET rejected_at = %s
            FROM sessions s
            WHERE s.id = %s
              AND a.dataset_id = s.dataset_id
              AND a.id = %s
              AND approved_in_version_id IS NULL
              AND approved_at IS NULL
              AND rejected_at IS NULL
              AND a.deleted_at IS NULL
            RETURNING a.storage_path
            """,
            (now, session_id, asset_id),
        )
        return await cursor.fetchone()
