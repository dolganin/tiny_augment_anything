from __future__ import annotations

import asyncio
from pathlib import Path
from uuid import UUID
from uuid import UUID as UUIDType

from backend.app.domain.enums import AssetOrigin, TaskStatus, WorkflowStage
from backend.app.repositories.tasks import get_task
from backend.app.repositories.workflow_assets import (
    create_asset_link,
    create_candidate_asset,
    find_asset_by_id,
    get_random_approved_asset,
)
from backend.app.repositories.workflow_runs import complete_augmentation_run, create_augmentation_run
from backend.app.repositories.workflow_session import get_session_context, update_session_stage
from backend.app.services.filesystem import dataset_generated_dir, dataset_modified_dir, make_relative_path
from backend.app.services.queue import enqueue_ml_task
from backend.app.services.zimage import (
    build_records,
    build_run_bundle,
    load_results,
    load_state,
    prepare_run_bundle,
    request_cancellation,
)
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
            source_asset_id = _parse_asset_id(payload.get("sourceAssetId"))
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
        await _dispatch_ml_generation(
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
            area_points=_parse_area_points(payload.get("areaPoints")),
            class_pool=_build_class_pool(context, template_asset["class_name"]),
        )


async def _dispatch_ml_generation(
    *,
    runtime_state,
    connection,
    session_id: UUID,
    task_id: UUID,
    run_id: UUID,
    mode: str,
    dataset_id: UUID,
    source_path: Path,
    parent_asset_id: UUID,
    prompt: str,
    sample_count: int,
    config: dict[str, object],
    area_points: list[list[float]] | None,
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
        {"progress": 0.05, "message": "Подготавливаю ML-задачу."},
        status=TaskStatus.RUNNING,
        progress=0.05,
        message="bundle prepared",
    )
    bundle = build_run_bundle(runtime_state.runtime_paths, task_id)
    records = build_records(
        source_path=source_path,
        class_names=class_pool,
        prompt=prompt,
        sample_count=sample_count,
        config=config,
        area_points=area_points,
    )
    prepare_run_bundle(
        bundle,
        records,
        {
            "taskId": str(task_id),
            "sessionId": str(session_id),
            "mode": mode,
            "datasetId": str(dataset_id),
            "runId": str(run_id),
            "parentAssetId": str(parent_asset_id),
            "sampleCount": sample_count,
            "prompt": prompt,
            "sourcePath": str(source_path),
            "classPool": class_pool,
            "areaPoints": area_points,
        },
        config,
    )
    await enqueue_ml_task(
        runtime_state.redis,
        runtime_state.settings,
        {
            "taskId": str(task_id),
            "sessionId": str(session_id),
            "taskType": f"diffusion.{mode}",
            "runDir": str(bundle.run_dir),
        },
    )
    state = await _wait_for_ml_result(runtime_state, connection, session_id, task_id, event_name, bundle)
    status = state.get("status")
    if status == "cancelled":
        await emit_cancelled(runtime_state, connection, session_id, task_id, "Задача модификации была остановлена пользователем.")
        return
    if status != "success":
        await emit_failure(runtime_state, connection, session_id, task_id, str(state.get("message") or "ML-задача завершилась с ошибкой."))
        return
    produced_count = await _index_generated_results(
        connection=connection,
        runtime_state=runtime_state,
        run_id=run_id,
        task_id=task_id,
        mode=mode,
        dataset_id=dataset_id,
        parent_asset_id=parent_asset_id,
        class_pool=class_pool,
        bundle=bundle,
    )
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


async def _wait_for_ml_result(runtime_state, connection, session_id: UUID, task_id: UUID, event_name: str, bundle) -> dict[str, object]:
    last_snapshot: tuple[object, object, object, object] | None = None
    while True:
        if await ensure_not_cancelled(connection, task_id):
            request_cancellation(bundle)
        state = load_state(bundle)
        snapshot = (
            state.get("status"),
            state.get("phase"),
            state.get("progress"),
            state.get("message"),
        )
        if snapshot != last_snapshot:
            last_snapshot = snapshot
            status = state.get("status")
            if status == "running":
                progress = float(state.get("progress") or 0.0)
                message = str(state.get("message") or "running")
                await emit_event(
                    runtime_state,
                    connection,
                    session_id,
                    task_id,
                    event_name,
                    {
                        "progress": progress,
                        "message": message,
                        "phase": state.get("phase"),
                        "generatedCount": state.get("generatedCount"),
                    },
                    status=TaskStatus.RUNNING,
                    progress=progress,
                    message=message,
                )
            if status in {"success", "error", "cancelled"}:
                return state
        await asyncio.sleep(0.5)


async def _index_generated_results(
    *,
    connection,
    runtime_state,
    run_id: UUID,
    task_id: UUID,
    mode: str,
    dataset_id: UUID,
    parent_asset_id: UUID,
    class_pool: list[str],
    bundle,
) -> int:
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
    return produced_count


def _build_class_pool(context: dict, fallback_class_name: str) -> list[str]:
    selected_classes = context["selected_classes"] if isinstance(context["selected_classes"], list) else []
    return [str(item) for item in selected_classes if isinstance(item, str)] or [fallback_class_name]


def _parse_asset_id(value: object) -> UUIDType | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        return UUID(value)
    except ValueError:
        return None


def _parse_area_points(value: object) -> list[list[float]] | None:
    if value is None:
        return None
    if not isinstance(value, list) or len(value) < 3:
        return None
    parsed: list[list[float]] = []
    for point in value:
        if not isinstance(point, list) or len(point) != 2:
            return None
        x, y = point
        if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
            return None
        parsed.append([float(x), float(y)])
    return parsed
