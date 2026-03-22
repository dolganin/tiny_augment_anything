from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from psycopg.types.json import Jsonb

from backend.app.domain.enums import AssetOrigin, VersionKind, WorkflowStage
from backend.app.repositories.workflow_session import get_session_context


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
            (session_id,),
        )
        return await cursor.fetchone()


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


async def get_asset_for_review(connection, session_id: UUID, asset_id: UUID) -> dict[str, Any] | None:
    async with connection.cursor() as cursor:
        await cursor.execute(
            """
            SELECT a.*, s.current_dataset_version_id, s.dataset_id
            FROM dataset_assets a
            JOIN sessions s ON s.dataset_id = a.dataset_id
            WHERE s.id = %s
              AND a.id = %s
              AND a.approved_in_version_id IS NULL
              AND a.rejected_at IS NULL
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


async def create_version_from_current_state(connection, session_id: UUID, approved_asset_id: UUID) -> UUID:
    context = await get_session_context(connection, session_id)
    if context is None or context["dataset_id"] is None or context["current_dataset_version_id"] is None:
        raise RuntimeError("Session context is not initialized")
    async with connection.cursor() as cursor:
        await cursor.execute(
            "SELECT version_index FROM dataset_versions WHERE id = %s",
            (context["current_dataset_version_id"],),
        )
        current_version = await cursor.fetchone()
    version_id = uuid4()
    now = datetime.now(timezone.utc)
    await connection.execute(
        """
        UPDATE dataset_assets
        SET approved_in_version_id = %s
        WHERE dataset_id = %s
          AND approved_in_version_id = %s
        """,
        (version_id, context["dataset_id"], context["current_dataset_version_id"]),
    )
    await connection.execute(
        "UPDATE dataset_assets SET approved_in_version_id = %s WHERE id = %s",
        (version_id, approved_asset_id),
    )
    summary = await build_version_summary(connection, context["dataset_id"], version_id)
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
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            version_id,
            context["dataset_id"],
            int(current_version["version_index"]) + 1 if current_version else 2,
            context["current_dataset_version_id"],
            VersionKind.REVIEW_SAVE.value,
            "ready",
            "",
            Jsonb(summary),
            now,
        ),
    )
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
        (version_id, WorkflowStage.REVIEW.value, now, now, session_id),
    )
    return version_id


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


async def update_version_manifest_path(connection, version_id: UUID, manifest_path: str, summary: dict[str, Any]) -> None:
    await connection.execute(
        """
        UPDATE dataset_versions
        SET manifest_path = %s,
            summary = %s
        WHERE id = %s
        """,
        (manifest_path, Jsonb(summary), version_id),
    )


async def reject_asset(connection, asset_id: UUID) -> dict[str, Any] | None:
    now = datetime.now(timezone.utc)
    async with connection.cursor() as cursor:
        await cursor.execute(
            """
            UPDATE dataset_assets
            SET rejected_at = %s, deleted_at = %s
            WHERE id = %s
              AND approved_in_version_id IS NULL
              AND rejected_at IS NULL
              AND deleted_at IS NULL
            RETURNING storage_path
            """,
            (now, now, asset_id),
        )
        return await cursor.fetchone()
