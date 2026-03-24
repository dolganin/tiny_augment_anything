from __future__ import annotations

from pathlib import Path
from uuid import UUID

from backend.app.domain.enums import WorkflowStage
from backend.app.repositories.tasks import get_task
from backend.app.repositories.workflow_assets import (
    find_asset_by_id,
    get_random_approved_asset,
)
from backend.app.repositories.workflow_runs import create_augmentation_run
from backend.app.repositories.workflow_session import get_session_context, update_session_stage
from backend.app.workers.generation_dispatch import dispatch_ml_generation
from backend.app.workers.generation_payloads import build_class_pool, parse_area_points, parse_asset_id, parse_class_targets
from backend.app.workers.shared import emit_failure


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
        sample_count = sum(class_targets.values()) if class_targets else int(payload["sampleCount"])
        source_asset = None
        if mode == WorkflowStage.MODIFY.value:
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
        run_id = await create_augmentation_run(
            connection,
            session_id=session_id,
            task_id=task_id,
            mode=mode,
            dataset_version_id=context["current_dataset_version_id"],
            prompt=payload.get("prompt"),
            source_asset_id=source_asset["id"] if source_asset else template_asset["id"],
            config=dict(payload.get("config", {})),
            target_count=sample_count,
        )
        stage = WorkflowStage.GENERATE if mode == WorkflowStage.GENERATE.value else WorkflowStage.MODIFY
        await update_session_stage(connection, session_id, stage, mode=mode)
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
