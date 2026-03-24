from __future__ import annotations

from pathlib import Path
from uuid import UUID

from backend.app.domain.enums import WorkflowStage
from backend.app.repositories.tasks import get_task
from backend.app.repositories.workflow_assets import (
    find_asset_by_id,
    get_random_approved_asset,
)
from backend.app.repositories.workflow_runs import (
    complete_augmentation_run,
    complete_augmentation_run_source,
    create_augmentation_run,
    create_augmentation_run_source,
    fail_augmentation_run_source,
    mark_augmentation_run_cancelled,
    mark_augmentation_run_failed,
    mark_augmentation_run_source_processing,
)
from backend.app.repositories.workflow_session import get_session_context, update_session_stage
from backend.app.workers.generation_dispatch import dispatch_ml_generation
from backend.app.workers.generation_payloads import build_class_pool, parse_area_points, parse_asset_id, parse_class_targets
from backend.app.workers.shared import emit_completion, emit_failure


async def run_generation(runtime_state, session_id: UUID, task_id: UUID, mode: str) -> None:
    async with runtime_state.database.connection() as connection:
        task = await get_task(connection, task_id)
        context = await get_session_context(connection, session_id)
        if task is None or context is None or context["dataset_id"] is None or context["current_dataset_version_id"] is None:
            await emit_failure(runtime_state, connection, session_id, task_id, "Сессия не готова к запуску модификации.")
            return
        payload = task["payload"]
        class_targets = parse_class_targets(payload.get("classTargets"))
        class_pool = build_class_pool(context, template_class_name=None, class_targets=class_targets)
        batch_sources = _parse_batch_sources(payload.get("sources")) if mode == WorkflowStage.MODIFY.value else []
        sample_count = sum(class_targets.values()) if class_targets else int(payload.get("sampleCount") or 0)
        source_asset = None
        if mode == WorkflowStage.MODIFY.value and not batch_sources:
            source_asset_id = parse_asset_id(payload.get("sourceAssetId"))
            if source_asset_id is None:
                await emit_failure(runtime_state, connection, session_id, task_id, "Некорректный источник для модификации.")
                return
            source_asset = await find_asset_by_id(connection, session_id, source_asset_id)
            if source_asset is None:
                await emit_failure(runtime_state, connection, session_id, task_id, "Источник для модификации не найден.")
                return
        template_asset = source_asset or await get_random_approved_asset(connection, session_id)
        if template_asset is None:
            await emit_failure(runtime_state, connection, session_id, task_id, "Не найдено подходящее изображение для запуска модификации.")
            return
        if not class_pool:
            class_pool = build_class_pool(context, template_class_name=template_asset["class_name"], class_targets=class_targets)
        run_target_count = sample_count if not batch_sources else max(sample_count, len(class_pool) if class_pool else 1) * len(batch_sources)
        primary_batch_asset_id = parse_asset_id(batch_sources[0].get("assetId")) if batch_sources else None
        run_id = await create_augmentation_run(
            connection,
            session_id=session_id,
            task_id=task_id,
            mode=mode,
            dataset_version_id=context["current_dataset_version_id"],
            prompt=payload.get("prompt"),
            source_asset_id=source_asset["id"] if source_asset else primary_batch_asset_id or template_asset["id"],
            config=dict(payload.get("config", {})),
            target_count=run_target_count,
            is_batch=bool(batch_sources),
            batch_mode=str(payload.get("batchMode")) if batch_sources and isinstance(payload.get("batchMode"), str) else None,
        )
        stage = WorkflowStage.GENERATE if mode == WorkflowStage.GENERATE.value else WorkflowStage.MODIFY
        await update_session_stage(connection, session_id, stage, mode=mode)
        if batch_sources:
            await _run_batch_modification(
                runtime_state=runtime_state,
                connection=connection,
                session_id=session_id,
                task_id=task_id,
                run_id=run_id,
                context=context,
                payload=payload,
                class_pool=class_pool,
                sample_count=sample_count,
                batch_sources=batch_sources,
            )
            return
        await dispatch_ml_generation(
            runtime_state=runtime_state,
            connection=connection,
            session_id=session_id,
            task_id=task_id,
            run_id=run_id,
            mode=mode,
            dataset_id=context["dataset_id"],
            source_path=runtime_state.settings.runtime_dir / Path(template_asset["storage_path"]),
            parent_asset_id=template_asset["id"],
            prompt=str(payload.get("prompt", "")),
            sample_count=sample_count,
            config=dict(payload.get("config", {})),
            area_points=parse_area_points(payload.get("areaPoints")),
            class_pool=class_pool,
        )


async def _run_batch_modification(
    *,
    runtime_state,
    connection,
    session_id: UUID,
    task_id: UUID,
    run_id: UUID,
    context: dict,
    payload: dict,
    class_pool: list[str],
    sample_count: int,
    batch_sources: list[dict[str, object]],
) -> None:
    common_area_points = parse_area_points(payload.get("areaPoints"))
    config = dict(payload.get("config", {}))
    prompt = str(payload.get("prompt") or "")
    source_rows: list[tuple[dict, dict[str, object]]] = []

    for index, source in enumerate(batch_sources):
        source_asset_id = parse_asset_id(source.get("assetId"))
        if source_asset_id is None:
            await mark_augmentation_run_failed(connection, run_id)
            await emit_failure(runtime_state, connection, session_id, task_id, f"Некорректный assetId в sources[{index}].")
            return
        asset = await find_asset_by_id(connection, session_id, source_asset_id)
        if asset is None:
            await mark_augmentation_run_failed(connection, run_id)
            await emit_failure(runtime_state, connection, session_id, task_id, f"Источник sources[{index}] не найден.")
            return
        run_source_id = await create_augmentation_run_source(
            connection,
            run_id=run_id,
            source_asset_id=asset["id"],
            area_points=parse_area_points(source.get("areaPoints")),
            custom_prompt=_normalize_prompt_override(source.get("customPrompt")),
            position=index,
        )
        source_rows.append(
            (
                {
                    "id": run_source_id,
                    "asset": asset,
                },
                source,
            )
        )

    if sample_count <= 0:
        sample_count = len(class_pool) if class_pool else 1
    total_generated_count = 0
    processed_sources = 0

    for row, source in source_rows:
        progress_start = processed_sources / max(len(source_rows), 1)
        progress_end = (processed_sources + 1) / max(len(source_rows), 1)
        await mark_augmentation_run_source_processing(connection, row["id"])
        result = await dispatch_ml_generation(
            runtime_state=runtime_state,
            connection=connection,
            session_id=session_id,
            task_id=task_id,
            run_id=run_id,
            mode=WorkflowStage.MODIFY.value,
            dataset_id=context["dataset_id"],
            source_path=runtime_state.settings.runtime_dir / Path(row["asset"]["storage_path"]),
            parent_asset_id=row["asset"]["id"],
            prompt=_normalize_prompt_override(source.get("customPrompt")) or prompt,
            sample_count=sample_count,
            config=config,
            area_points=parse_area_points(source.get("areaPoints")) or common_area_points,
            class_pool=class_pool,
            progress_range=(progress_start, progress_end),
            complete_run_on_success=False,
            complete_stage_on_success=None,
            fail_task_on_error=False,
        )
        if result.status == "success":
            total_generated_count += result.generated_count
            await complete_augmentation_run_source(connection, row["id"], result.generated_count)
            processed_sources += 1
            continue
        if result.status == "cancelled":
            await fail_augmentation_run_source(connection, row["id"], result.message or "cancelled")
            await mark_augmentation_run_cancelled(connection, run_id)
            return
        await fail_augmentation_run_source(connection, row["id"], result.message or "ML-задача завершилась с ошибкой.")
        processed_sources += 1

    if total_generated_count <= 0:
        await mark_augmentation_run_failed(connection, run_id)
        await emit_failure(runtime_state, connection, session_id, task_id, "Batch-модификация не сгенерировала ни одного результата.")
        return
    await complete_augmentation_run(connection, run_id, total_generated_count)
    await emit_completion(runtime_state, connection, session_id, task_id, WorkflowStage.REVIEW)


def _parse_batch_sources(value: object) -> list[dict[str, object]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _normalize_prompt_override(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    prompt = value.strip()
    return prompt or None
