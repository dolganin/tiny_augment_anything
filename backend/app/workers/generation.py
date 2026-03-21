from __future__ import annotations

import asyncio
from pathlib import Path
from uuid import UUID

from backend.app.domain.enums import AssetOrigin, TaskStatus, WorkflowStage
from backend.app.repositories.tasks import get_task
from backend.app.repositories.workflow_assets import create_asset_link, create_candidate_asset, find_asset_by_storage_path, get_random_approved_asset
from backend.app.repositories.workflow_runs import complete_augmentation_run, create_augmentation_run
from backend.app.repositories.workflow_session import get_session_context, update_session_stage
from backend.app.services.filesystem import (
    dataset_generated_dir,
    dataset_modified_dir,
    make_relative_path,
)
from backend.app.workers.shared import checksum_bytes, emit_completion, emit_event, emit_failure, ensure_not_cancelled, load_binary


async def run_generation(runtime_state, session_id: UUID, task_id: UUID, mode: str) -> None:
    async with runtime_state.database.connection() as connection:
        task = await get_task(connection, task_id)
        context = await get_session_context(connection, session_id)
        if task is None or context is None or context["dataset_id"] is None or context["current_dataset_version_id"] is None:
            await emit_failure(runtime_state, connection, session_id, task_id, "Сессия не готова к запуску генерации.")
            return
        payload = task["payload"]
        sample_count = int(payload["sampleCount"])
        source_asset = None
        if mode == WorkflowStage.MODIFY.value:
            source_asset = await find_asset_by_storage_path(connection, session_id, str(payload["sourcePath"]))
            if source_asset is None:
                await emit_failure(runtime_state, connection, session_id, task_id, "Источник для модификации не найден.")
                return
        template_asset = source_asset or await get_random_approved_asset(connection, session_id)
        run_id = await create_augmentation_run(
            connection,
            session_id=session_id,
            task_id=task_id,
            mode=mode,
            dataset_version_id=context["current_dataset_version_id"],
            prompt=payload.get("prompt"),
            source_asset_id=source_asset["id"] if source_asset else None,
            config=dict(payload.get("config", {})),
            target_count=sample_count,
        )
        stage = WorkflowStage.GENERATE if mode == WorkflowStage.GENERATE.value else WorkflowStage.MODIFY
        await update_session_stage(connection, session_id, stage, mode=mode)
        source_path = None if template_asset is None else runtime_state.settings.runtime_dir / Path(template_asset["storage_path"])
        payload_bytes = load_binary(source_path)
        suffix = source_path.suffix if source_path else ".png"
        output_dir = (
            dataset_generated_dir(runtime_state.runtime_paths, context["dataset_id"])
            if mode == WorkflowStage.GENERATE.value
            else dataset_modified_dir(runtime_state.runtime_paths, context["dataset_id"])
        )
        output_dir.mkdir(parents=True, exist_ok=True)
        selected_classes = context["selected_classes"] if isinstance(context["selected_classes"], list) else []
        class_pool = [str(item) for item in selected_classes if isinstance(item, str)] or [template_asset["class_name"] if template_asset else "generated"]
        for index in range(sample_count):
            if await ensure_not_cancelled(connection, task_id):
                await emit_failure(runtime_state, connection, session_id, task_id, "Задача генерации была остановлена пользователем.")
                return
            class_name = class_pool[index % len(class_pool)]
            target_dir = output_dir / class_name
            target_dir.mkdir(parents=True, exist_ok=True)
            target_path = target_dir / f"{task_id}-{index + 1}{suffix}"
            target_path.write_bytes(payload_bytes)
            relative_path = make_relative_path(runtime_state.settings.runtime_dir, target_path)
            asset_id = await create_candidate_asset(
                connection,
                dataset_id=context["dataset_id"],
                class_name=class_name,
                origin_type=AssetOrigin.GENERATED if mode == WorkflowStage.GENERATE.value else AssetOrigin.MODIFIED,
                storage_path=relative_path,
                preview_path=relative_path,
                checksum=checksum_bytes(payload_bytes),
                source_run_id=run_id,
            )
            if source_asset is not None:
                await create_asset_link(connection, asset_id, source_asset["id"])
            progress = (index + 1) / sample_count
            event_name = "generation.progress" if mode == WorkflowStage.GENERATE.value else "modification.progress"
            await emit_event(
                runtime_state,
                connection,
                session_id,
                task_id,
                event_name,
                {"progress": progress, "message": f"Сформирован кандидат {index + 1} из {sample_count}"},
                status=TaskStatus.RUNNING,
                progress=progress,
                message=f"generated {index + 1}/{sample_count}",
            )
            await asyncio.sleep(0.1)
        await complete_augmentation_run(connection, run_id, sample_count)
        await emit_completion(runtime_state, connection, session_id, task_id, WorkflowStage.REVIEW)
