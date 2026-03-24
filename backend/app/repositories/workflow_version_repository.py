from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from psycopg.types.json import Jsonb

from backend.app.domain.enums import VersionKind, WorkflowStage
from backend.app.repositories.workflow_session import get_session_context


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
        """,
        (version_id, context["dataset_id"], context["current_dataset_version_id"]),
    )
    await connection.execute(
        "UPDATE dataset_assets SET approved_in_version_id = %s WHERE id = %s",
        (version_id, approved_asset_id),
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
