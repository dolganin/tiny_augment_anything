from __future__ import annotations

import asyncio
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID

from backend.app.domain.enums import TaskStatus, WorkflowStage
from backend.app.repositories.workflow_runs import complete_augmentation_run
from backend.app.services.queue import enqueue_ml_task
from backend.app.services.zimage import (
    build_records,
    build_run_bundle,
    load_state,
    prepare_run_bundle,
    request_cancellation,
    resolve_modification_mode,
)
from backend.app.workers.generation_indexing import index_generated_results
from backend.app.workers.shared import emit_cancelled, emit_completion, emit_event, emit_failure, ensure_not_cancelled


@dataclass(frozen=True, slots=True)
class GenerationDispatchResult:
    status: str
    generated_count: int = 0
    message: str | None = None


async def dispatch_ml_generation(
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
    progress_range: tuple[float, float] = (0.05, 0.95),
    complete_run_on_success: bool = True,
    complete_stage_on_success: WorkflowStage | None = WorkflowStage.REVIEW,
    fail_task_on_error: bool = True,
) -> GenerationDispatchResult:
    progress_start, progress_end = progress_range

    def map_progress(local_progress: float) -> float:
        bounded = max(0.0, min(1.0, local_progress))
        return progress_start + (progress_end - progress_start) * bounded

    if not source_path.exists():
        message = "Исходное изображение для модификации отсутствует на диске."
        if fail_task_on_error:
            await emit_failure(runtime_state, connection, session_id, task_id, message)
        return GenerationDispatchResult(status="error", message=message)
    event_name = "generation.progress" if mode == WorkflowStage.GENERATE.value else "modification.progress"
    await emit_event(
        runtime_state,
        connection,
        session_id,
        task_id,
        event_name,
        {"progress": map_progress(0.05), "message": "Подготавливаю ML-задачу."},
        status=TaskStatus.RUNNING,
        progress=map_progress(0.05),
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
            "modificationMode": resolve_modification_mode(config),
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
    state = await wait_for_ml_result(
        runtime_state,
        connection,
        session_id,
        task_id,
        event_name,
        bundle,
        progress_range=progress_range,
    )
    status = state.get("status")
    if status == "cancelled":
        message = "Задача модификации была остановлена пользователем."
        await emit_cancelled(runtime_state, connection, session_id, task_id, message)
        return GenerationDispatchResult(status="cancelled", message=message)
    if status != "success":
        message = str(state.get("message") or "ML-задача завершилась с ошибкой.")
        if fail_task_on_error:
            await emit_failure(runtime_state, connection, session_id, task_id, message)
        return GenerationDispatchResult(status="error", message=message)
    produced_count = await index_generated_results(
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
        {"progress": map_progress(0.95), "message": f"Индексирую результаты: {produced_count} файлов."},
        status=TaskStatus.RUNNING,
        progress=map_progress(0.95),
        message="indexing",
    )
    if complete_run_on_success:
        await complete_augmentation_run(connection, run_id, produced_count)
        if complete_stage_on_success is not None:
            await emit_completion(runtime_state, connection, session_id, task_id, complete_stage_on_success)
    return GenerationDispatchResult(status="success", generated_count=produced_count)


async def wait_for_ml_result(
    runtime_state,
    connection,
    session_id: UUID,
    task_id: UUID,
    event_name: str,
    bundle,
    *,
    progress_range: tuple[float, float],
) -> dict[str, object]:
    last_snapshot: tuple[object, object, object, object] | None = None
    progress_start, progress_end = progress_range
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
                local_progress = float(state.get("progress") or 0.0)
                progress = progress_start + (progress_end - progress_start) * max(0.0, min(1.0, local_progress))
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
