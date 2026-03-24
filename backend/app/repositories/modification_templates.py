from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from psycopg.types.json import Jsonb


async def list_dataset_templates(connection, dataset_id: UUID) -> dict[str, list[dict[str, Any]]]:
    async with connection.cursor() as cursor:
        await cursor.execute(
            """
            SELECT
                id,
                template_type,
                name,
                prompt_text,
                negative_prompt_text,
                polygon_points
            FROM modification_templates
            WHERE dataset_id = %s
            ORDER BY created_at DESC, name ASC
            """,
            (dataset_id,),
        )
        rows = await cursor.fetchall()

    text_templates: list[dict[str, Any]] = []
    selection_templates: list[dict[str, Any]] = []
    polygon_templates: list[dict[str, Any]] = []

    for row in rows:
        template_type = row["template_type"]
        if template_type == "text":
            text_templates.append(
                {
                    "id": str(row["id"]),
                    "name": row["name"],
                    "prompt": row["prompt_text"] or "",
                    "negativePrompt": row["negative_prompt_text"],
                }
            )
            continue
        if template_type == "selection":
            selection_templates.append(
                {
                    "id": str(row["id"]),
                    "name": row["name"],
                    "text": row["prompt_text"] or "",
                }
            )
            continue
        polygon_templates.append(
            {
                "id": str(row["id"]),
                "name": row["name"],
                "points": row["polygon_points"] if isinstance(row["polygon_points"], list) else [],
            }
        )

    return {
        "textTemplates": text_templates,
        "selectionTemplates": selection_templates,
        "polygonTemplates": polygon_templates,
    }


async def create_text_template(
    connection,
    dataset_id: UUID,
    *,
    name: str,
    prompt: str,
    negative_prompt: str | None,
) -> UUID:
    template_id = uuid4()
    now = datetime.now(timezone.utc)
    await connection.execute(
        """
        INSERT INTO modification_templates (
            id,
            dataset_id,
            template_type,
            name,
            prompt_text,
            negative_prompt_text,
            created_at,
            updated_at
        )
        VALUES (%s, %s, 'text', %s, %s, %s, %s, %s)
        """,
        (template_id, dataset_id, name, prompt, negative_prompt, now, now),
    )
    return template_id


async def create_selection_template(connection, dataset_id: UUID, *, name: str, text: str) -> UUID:
    template_id = uuid4()
    now = datetime.now(timezone.utc)
    await connection.execute(
        """
        INSERT INTO modification_templates (
            id,
            dataset_id,
            template_type,
            name,
            prompt_text,
            created_at,
            updated_at
        )
        VALUES (%s, %s, 'selection', %s, %s, %s, %s)
        """,
        (template_id, dataset_id, name, text, now, now),
    )
    return template_id


async def create_polygon_template(connection, dataset_id: UUID, *, name: str, points: list[list[float]]) -> UUID:
    template_id = uuid4()
    now = datetime.now(timezone.utc)
    await connection.execute(
        """
        INSERT INTO modification_templates (
            id,
            dataset_id,
            template_type,
            name,
            polygon_points,
            created_at,
            updated_at
        )
        VALUES (%s, %s, 'polygon', %s, %s::jsonb, %s, %s)
        """,
        (template_id, dataset_id, name, Jsonb(points), now, now),
    )
    return template_id


async def delete_template(connection, template_id: UUID, dataset_id: UUID) -> bool:
    async with connection.cursor() as cursor:
        await cursor.execute(
            """
            DELETE FROM modification_templates
            WHERE id = %s
              AND dataset_id = %s
            RETURNING id
            """,
            (template_id, dataset_id),
        )
        row = await cursor.fetchone()
    return row is not None


async def update_template_name(connection, template_id: UUID, dataset_id: UUID, new_name: str) -> bool:
    now = datetime.now(timezone.utc)
    async with connection.cursor() as cursor:
        await cursor.execute(
            """
            UPDATE modification_templates
            SET name = %s,
                updated_at = %s
            WHERE id = %s
              AND dataset_id = %s
            RETURNING id
            """,
            (new_name, now, template_id, dataset_id),
        )
        row = await cursor.fetchone()
    return row is not None
