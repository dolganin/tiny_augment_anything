from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from psycopg.types.json import Jsonb

from backend.app.domain.enums import VersionKind, WorkflowStage
from backend.app.repositories.workflow_session import get_session_context


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
              AND a.approved_at IS NULL
              AND a.rejected_at IS NULL
              AND a.deleted_at IS NULL
            LIMIT 1
            """,
            (session_id, asset_id),
        )
        return await cursor.fetchone()


async def mark_asset_approved(connection, session_id: UUID, asset_id: UUID) -> dict[str, Any] | None:
    now = datetime.now(timezone.utc)
    async with connection.cursor() as cursor:
        await cursor.execute(
            """
            UPDATE dataset_assets AS a
            SET approved_at = %s
            FROM sessions s
            WHERE s.id = %s
              AND a.dataset_id = s.dataset_id
              AND a.id = %s
              AND a.approved_in_version_id IS NULL
              AND a.approved_at IS NULL
              AND a.rejected_at IS NULL
              AND a.deleted_at IS NULL
            RETURNING a.id, a.dataset_id, a.storage_path
            """,
            (now, session_id, asset_id),
        )
        return await cursor.fetchone()


async def finalize_review_decisions(
    connection,
    session_id: UUID,
    *,
    next_stage: WorkflowStage,
) -> dict[str, Any]:
    context = await get_session_context(connection, session_id)
    if context is None or context["dataset_id"] is None or context["current_dataset_version_id"] is None:
        raise RuntimeError("Session context is not initialized")

    dataset_id = context["dataset_id"]
    current_version_id = context["current_dataset_version_id"]
    now = datetime.now(timezone.utc)

    async with connection.cursor() as cursor:
        await cursor.execute(
            """
            SELECT COUNT(*)::int AS count
            FROM dataset_assets
            WHERE dataset_id = %s
              AND approved_in_version_id IS NULL
              AND approved_at IS NOT NULL
              AND rejected_at IS NULL
              AND deleted_at IS NULL
            """,
            (dataset_id,),
        )
        approved_row = await cursor.fetchone()
        await cursor.execute(
            """
            SELECT COUNT(*)::int AS count
            FROM dataset_assets
            WHERE dataset_id = %s
              AND approved_in_version_id IS NULL
              AND approved_at IS NULL
              AND rejected_at IS NOT NULL
              AND deleted_at IS NULL
            """,
            (dataset_id,),
        )
        rejected_row = await cursor.fetchone()
        await cursor.execute(
            "SELECT version_index FROM dataset_versions WHERE id = %s",
            (current_version_id,),
        )
        current_version = await cursor.fetchone()

    approved_count = int(approved_row["count"]) if approved_row else 0
    rejected_count = int(rejected_row["count"]) if rejected_row else 0
    version_id: UUID | None = None

    if approved_count > 0:
        version_id = uuid4()
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
                dataset_id,
                int(current_version["version_index"]) + 1 if current_version else 2,
                current_version_id,
                VersionKind.REVIEW_SAVE.value,
                "ready",
                "",
                Jsonb({"assetCount": 0, "classes": []}),
                now,
            ),
        )
        await connection.execute(
            """
            UPDATE dataset_assets
            SET approved_in_version_id = %s
            WHERE dataset_id = %s
              AND approved_in_version_id = %s
              AND deleted_at IS NULL
            """,
            (version_id, dataset_id, current_version_id),
        )
        await connection.execute(
            """
            UPDATE dataset_assets
            SET approved_in_version_id = %s
            WHERE dataset_id = %s
              AND approved_in_version_id IS NULL
              AND approved_at IS NOT NULL
              AND rejected_at IS NULL
              AND deleted_at IS NULL
            """,
            (version_id, dataset_id),
        )

    await connection.execute(
        """
        UPDATE dataset_assets
        SET deleted_at = %s
        WHERE dataset_id = %s
          AND approved_in_version_id IS NULL
          AND approved_at IS NULL
          AND rejected_at IS NOT NULL
          AND deleted_at IS NULL
        """,
        (now, dataset_id),
    )

    await connection.execute(
        """
        UPDATE sessions
        SET current_dataset_version_id = COALESCE(%s, current_dataset_version_id),
            workflow_stage = %s,
            revision = revision + 1,
            updated_at = %s,
            last_seen_at = %s
        WHERE id = %s
        """,
        (version_id, next_stage.value, now, now, session_id),
    )

    return {
        "datasetId": dataset_id,
        "versionId": version_id,
        "approvedCount": approved_count,
        "rejectedCount": rejected_count,
    }
