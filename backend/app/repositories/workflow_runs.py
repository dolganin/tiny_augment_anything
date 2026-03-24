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
    *,
    target_count: int,
    is_batch: bool = False,
    batch_mode: str | None = None,
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
            is_batch,
            batch_mode,
            target_count,
            status,
            created_at,
            updated_at
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
            is_batch,
            batch_mode,
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


async def mark_augmentation_run_failed(connection, run_id: UUID) -> None:
    now = datetime.now(timezone.utc)
    await connection.execute(
        """
        UPDATE augmentation_runs
        SET status = %s,
            updated_at = %s
        WHERE id = %s
        """,
        (TaskStatus.ERROR.value, now, run_id),
    )


async def mark_augmentation_run_cancelled(connection, run_id: UUID) -> None:
    now = datetime.now(timezone.utc)
    await connection.execute(
        """
        UPDATE augmentation_runs
        SET status = %s,
            updated_at = %s
        WHERE id = %s
        """,
        (TaskStatus.CANCELLED.value, now, run_id),
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


async def get_augmentation_run(connection, session_id: UUID, run_id: UUID) -> dict[str, Any] | None:
    async with connection.cursor() as cursor:
        await cursor.execute(
            """
            SELECT *
            FROM augmentation_runs
            WHERE session_id = %s
              AND id = %s
            """,
            (session_id, run_id),
        )
        return await cursor.fetchone()


async def create_augmentation_run_source(
    connection,
    *,
    run_id: UUID,
    source_asset_id: UUID,
    area_points: list[list[float]] | None,
    custom_prompt: str | None,
    position: int,
) -> UUID:
    source_id = uuid4()
    now = datetime.now(timezone.utc)
    await connection.execute(
        """
        INSERT INTO augmentation_run_sources (
            id,
            run_id,
            source_asset_id,
            area_points,
            custom_prompt,
            position,
            status,
            created_at
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            source_id,
            run_id,
            source_asset_id,
            Jsonb(area_points) if area_points is not None else None,
            custom_prompt,
            position,
            "pending",
            now,
        ),
    )
    return source_id


async def list_augmentation_run_sources(connection, run_id: UUID) -> list[dict[str, Any]]:
    async with connection.cursor() as cursor:
        await cursor.execute(
            """
            SELECT *
            FROM augmentation_run_sources
            WHERE run_id = %s
            ORDER BY position ASC, created_at ASC
            """,
            (run_id,),
        )
        return await cursor.fetchall()


async def mark_augmentation_run_source_processing(connection, source_id: UUID) -> None:
    now = datetime.now(timezone.utc)
    await connection.execute(
        """
        UPDATE augmentation_run_sources
        SET status = %s,
            error_message = NULL,
            started_at = COALESCE(started_at, %s)
        WHERE id = %s
        """,
        ("processing", now, source_id),
    )


async def complete_augmentation_run_source(connection, source_id: UUID, generated_count: int) -> None:
    now = datetime.now(timezone.utc)
    await connection.execute(
        """
        UPDATE augmentation_run_sources
        SET status = %s,
            generated_count = %s,
            finished_at = %s
        WHERE id = %s
        """,
        ("completed", generated_count, now, source_id),
    )


async def fail_augmentation_run_source(connection, source_id: UUID, error_message: str) -> None:
    now = datetime.now(timezone.utc)
    await connection.execute(
        """
        UPDATE augmentation_run_sources
        SET status = %s,
            error_message = %s,
            finished_at = %s
        WHERE id = %s
        """,
        ("failed", error_message, now, source_id),
    )


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


async def create_classifier_run(
    connection,
    session_id: UUID,
    task_id: UUID,
    dataset_version_id: UUID,
    *,
    model_key: str,
    class_names: list[str],
    hparams: dict[str, Any],
    pretrained_weights_path: str | None,
    checkpoints_dir: str,
) -> UUID:
    run_id = uuid4()
    now = datetime.now(timezone.utc)
    await connection.execute(
        """
        INSERT INTO classifier_runs (
            id,
            session_id,
            task_id,
            dataset_version_id,
            status,
            model_key,
            class_names,
            hparams,
            pretrained_weights_path,
            checkpoints_dir,
            created_at
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            run_id,
            session_id,
            task_id,
            dataset_version_id,
            TaskStatus.RUNNING.value,
            model_key,
            Jsonb(class_names),
            Jsonb(hparams),
            pretrained_weights_path,
            checkpoints_dir,
            now,
        ),
    )
    return run_id


async def finish_classifier_run(
    connection,
    run_id: UUID,
    metrics: dict[str, Any],
    *,
    checkpoint_path: str | None,
) -> None:
    now = datetime.now(timezone.utc)
    await connection.execute(
        """
        UPDATE classifier_runs
        SET status = %s, metrics = %s, checkpoint_path = %s, finished_at = %s
        WHERE id = %s
        """,
        (TaskStatus.SUCCESS.value, Jsonb(metrics), checkpoint_path, now, run_id),
    )


async def update_classifier_run_status(connection, run_id: UUID, status: TaskStatus) -> None:
    now = datetime.now(timezone.utc)
    await connection.execute(
        """
        UPDATE classifier_runs
        SET status = %s, finished_at = CASE WHEN %s IN (%s, %s) THEN %s ELSE finished_at END
        WHERE id = %s
        """,
        (
            status.value,
            status.value,
            TaskStatus.ERROR.value,
            TaskStatus.CANCELLED.value,
            now,
            run_id,
        ),
    )


async def get_latest_metrics(connection, dataset_version_id: UUID) -> dict[str, Any] | None:
    async with connection.cursor() as cursor:
        await cursor.execute(
            """
            SELECT metrics
            FROM classifier_runs
            WHERE dataset_version_id = %s
              AND status = %s
            ORDER BY finished_at DESC NULLS LAST, created_at DESC
            LIMIT 1
            """,
            (dataset_version_id, TaskStatus.SUCCESS.value),
        )
        row = await cursor.fetchone()
    return None if row is None else row["metrics"]


async def list_metric_versions(
    connection,
    dataset_id: UUID,
    active_version_id: UUID | None,
) -> list[dict[str, Any]]:
    async with connection.cursor() as cursor:
        await cursor.execute(
            """
            SELECT
                v.id,
                v.version_index,
                v.kind,
                v.created_at,
                (v.id = %s) AS is_active,
                EXISTS(
                    SELECT 1
                    FROM classifier_runs cr
                    WHERE cr.dataset_version_id = v.id
                      AND cr.status = %s
                      AND cr.metrics IS NOT NULL
                ) AS has_metrics
            FROM dataset_versions v
            WHERE v.dataset_id = %s
            ORDER BY v.version_index DESC, v.created_at DESC
            """,
            (active_version_id, TaskStatus.SUCCESS.value, dataset_id),
        )
        return await cursor.fetchall()


async def resolve_dataset_version(
    connection,
    dataset_id: UUID,
    requested_version_id: UUID,
) -> UUID | None:
    async with connection.cursor() as cursor:
        await cursor.execute(
            """
            SELECT id
            FROM dataset_versions
            WHERE id = %s
              AND dataset_id = %s
            """,
            (requested_version_id, dataset_id),
        )
        row = await cursor.fetchone()
    return None if row is None else row["id"]


async def list_classifier_runs(connection, dataset_version_id: UUID) -> list[dict[str, Any]]:
    async with connection.cursor() as cursor:
        await cursor.execute(
            """
            WITH ranked_runs AS (
                SELECT
                    id,
                    task_id,
                    dataset_version_id,
                    status,
                    model_key,
                    class_names,
                    hparams,
                    pretrained_weights_path,
                    checkpoints_dir,
                    checkpoint_path,
                    metrics,
                    created_at,
                    finished_at,
                    ROW_NUMBER() OVER (
                        PARTITION BY
                            dataset_version_id,
                            model_key,
                            class_names,
                            hparams,
                            COALESCE(pretrained_weights_path, '')
                        ORDER BY created_at DESC, finished_at DESC NULLS LAST, id DESC
                    ) AS row_number
                FROM classifier_runs
                WHERE dataset_version_id = %s
                  AND status = %s
            )
            SELECT
                id,
                task_id,
                dataset_version_id,
                status,
                model_key,
                class_names,
                hparams,
                pretrained_weights_path,
                checkpoints_dir,
                checkpoint_path,
                metrics,
                created_at,
                finished_at
            FROM ranked_runs
            WHERE row_number = 1
            ORDER BY created_at DESC, finished_at DESC NULLS LAST
            """,
            (dataset_version_id, TaskStatus.SUCCESS.value),
        )
        return await cursor.fetchall()
