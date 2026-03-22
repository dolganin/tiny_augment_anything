from __future__ import annotations

import asyncio
from pathlib import Path
from uuid import UUID

from backend.app.domain.enums import AssetOrigin, TaskStatus, WorkflowStage
from backend.app.repositories.tasks import get_task
from backend.app.repositories.workflow_assets import (
    create_asset_link,
    create_candidate_asset,
    find_asset_by_storage_path,
    get_random_approved_asset,
)
from backend.app.repositories.workflow_runs import complete_augmentation_run, create_augmentation_run
from backend.app.repositories.workflow_session import get_session_context, update_session_stage
from backend.app.services.filesystem import dataset_generated_dir, dataset_modified_dir, make_relative_path
from backend.app.services.zimage import build_command, build_records, build_run_bundle, load_results, prepare_run_bundle, run_command
from backend.app.workers.shared import checksum_bytes, emit_cancelled, emit_completion, emit_event, emit_failure, ensure_not_cancelled, load_binary


async def run_generation(runtime_state, session_id: UUID, task_id: UUID, mode: str) -> None:
    async with runtime_state.database.connection() as connection:
        task = await get_task(connection, task_id)
        context = await get_session_context(connection, session_id)
        if task is None or context is None or context["dataset_id"] is None or context["current_dataset_version_id"] is None:
            await emit_failure(runtime_state, connection, session_id, task_id, "Сессия не готова к запуску модификации.")
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
        if template_asset is None:
            await emit_failure(runtime_state, connection, session_id, task_id, "Не найдено подходящее изображение для запуска модификации.")
            return

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

        if runtime_state.settings.executor_mode == "stub":
            await _run_stub_generation(
                runtime_state,
                connection,
                session_id,
                task_id,
                run_id,
                mode,
                context["dataset_id"],
                sample_count,
                runtime_state.settings.runtime_dir / Path(template_asset["storage_path"]),
                template_asset["id"],
                _build_class_pool(context, template_asset["class_name"]),
            )
            return

        await _run_zimage_generation(
            runtime_state,
            connection,
            session_id,
            task_id,
            run_id,
            mode,
            context["dataset_id"],
            sample_count,
            runtime_state.settings.runtime_dir / Path(template_asset["storage_path"]),
            template_asset["id"],
            str(payload.get("prompt", "")),
            dict(payload.get("config", {})),
            _build_class_pool(context, template_asset["class_name"]),
        )


async def _run_zimage_generation(
    runtime_state,
    connection,
    session_id: UUID,
    task_id: UUID,
    run_id: UUID,
    mode: str,
    dataset_id: UUID,
    sample_count: int,
    source_path: Path,
    parent_asset_id: UUID,
    prompt: str,
    config: dict[str, object],
    class_pool: list[str],
) -> None:
    if not source_path.exists():
        await emit_failure(runtime_state, connection, session_id, task_id, "Исходное изображение для модификации отсутствует на диске.")
        return

    event_name = "generation.progress" if mode == WorkflowStage.GENERATE.value else "modification.progress"
    await emit_event(
        runtime_state,
        connection,
        session_id,
        task_id,
        event_name,
        {"progress": 0.05, "message": "Подготавливаю входной пакет модификации."},
        status=TaskStatus.RUNNING,
        progress=0.05,
        message="bundle prepared",
    )

    records = build_records(
        source_path=source_path,
        class_names=class_pool,
        prompt=prompt,
        sample_count=sample_count,
        config=config,
    )
    bundle = build_run_bundle(runtime_state.runtime_paths, task_id)
    prepare_run_bundle(bundle, records)
    command = build_command(runtime_state.settings, bundle, config, None)

    async def is_cancelled() -> bool:
        return await ensure_not_cancelled(connection, task_id)

    async def on_progress(current_count: int, expected_count: int) -> None:
        progress = min(0.9, current_count / max(expected_count, 1))
        await emit_event(
            runtime_state,
            connection,
            session_id,
            task_id,
            event_name,
            {"progress": progress, "message": f"Сформировано кандидатов: {current_count} из {expected_count}"},
            status=TaskStatus.RUNNING,
            progress=progress,
            message=f"generated {current_count}/{expected_count}",
        )

    try:
        await run_command(
            command,
            bundle,
            expected_outputs=sample_count,
            is_cancelled=is_cancelled,
            on_progress=on_progress,
        )
    except Exception as error:
        if str(error) == "cancelled":
            await emit_cancelled(runtime_state, connection, session_id, task_id, "Задача модификации была остановлена пользователем.")
            return
        await emit_failure(runtime_state, connection, session_id, task_id, str(error))
        return

    results = load_results(bundle)
    output_root = dataset_generated_dir(runtime_state.runtime_paths, dataset_id) if mode == WorkflowStage.GENERATE.value else dataset_modified_dir(runtime_state.runtime_paths, dataset_id)
    output_root.mkdir(parents=True, exist_ok=True)
    produced_count = 0
    for item in results:
        class_name = str(item.get("class_name") or class_pool[0])
        result_paths = item.get("result_paths")
        if not isinstance(result_paths, list):
            continue
        target_dir = output_root / class_name
        target_dir.mkdir(parents=True, exist_ok=True)
        for raw_path in result_paths:
            result_path = Path(str(raw_path))
            if not result_path.exists():
                continue
            produced_count += 1
            target_path = target_dir / f"{task_id}-{produced_count}{result_path.suffix or '.png'}"
            target_path.write_bytes(result_path.read_bytes())
            target_bytes = load_binary(target_path)
            relative_path = make_relative_path(runtime_state.settings.runtime_dir, target_path)
            asset_id = await create_candidate_asset(
                connection,
                dataset_id=dataset_id,
                class_name=class_name,
                origin_type=AssetOrigin.GENERATED if mode == WorkflowStage.GENERATE.value else AssetOrigin.MODIFIED,
                storage_path=relative_path,
                preview_path=relative_path,
                checksum=checksum_bytes(target_bytes),
                source_run_id=run_id,
            )
            await create_asset_link(connection, asset_id, parent_asset_id)

    await emit_event(
        runtime_state,
        connection,
        session_id,
        task_id,
        event_name,
        {"progress": 0.95, "message": f"Индексирую результаты: {produced_count} файлов."},
        status=TaskStatus.RUNNING,
        progress=0.95,
        message="indexing",
    )
    await complete_augmentation_run(connection, run_id, produced_count)
    await emit_completion(runtime_state, connection, session_id, task_id, WorkflowStage.REVIEW)


async def _run_stub_generation(
    runtime_state,
    connection,
    session_id: UUID,
    task_id: UUID,
    run_id: UUID,
    mode: str,
    dataset_id: UUID,
    sample_count: int,
    source_path: Path,
    parent_asset_id: UUID,
    class_pool: list[str],
) -> None:
    payload_bytes = load_binary(source_path)
    suffix = source_path.suffix or ".png"
    output_dir = dataset_generated_dir(runtime_state.runtime_paths, dataset_id) if mode == WorkflowStage.GENERATE.value else dataset_modified_dir(runtime_state.runtime_paths, dataset_id)
    output_dir.mkdir(parents=True, exist_ok=True)
    event_name = "generation.progress" if mode == WorkflowStage.GENERATE.value else "modification.progress"
    for index in range(sample_count):
        if await ensure_not_cancelled(connection, task_id):
            await emit_cancelled(runtime_state, connection, session_id, task_id, "Задача модификации была остановлена пользователем.")
            return
        class_name = class_pool[index % len(class_pool)]
        target_dir = output_dir / class_name
        target_dir.mkdir(parents=True, exist_ok=True)
        target_path = target_dir / f"{task_id}-{index + 1}{suffix}"
        target_path.write_bytes(payload_bytes)
        relative_path = make_relative_path(runtime_state.settings.runtime_dir, target_path)
        asset_id = await create_candidate_asset(
            connection,
            dataset_id=dataset_id,
            class_name=class_name,
            origin_type=AssetOrigin.GENERATED if mode == WorkflowStage.GENERATE.value else AssetOrigin.MODIFIED,
            storage_path=relative_path,
            preview_path=relative_path,
            checksum=checksum_bytes(payload_bytes),
            source_run_id=run_id,
        )
        await create_asset_link(connection, asset_id, parent_asset_id)
        progress = (index + 1) / sample_count
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


def _build_class_pool(context: dict, fallback_class_name: str) -> list[str]:
    selected_classes = context["selected_classes"] if isinstance(context["selected_classes"], list) else []
    return [str(item) for item in selected_classes if isinstance(item, str)] or [fallback_class_name]
