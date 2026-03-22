from __future__ import annotations

from uuid import UUID

from backend.app.domain.enums import TaskType, WorkflowStage
from backend.app.repositories.tasks import cancel_task, create_task, get_task_status
from backend.app.repositories.workflow_assets import get_random_approved_asset, list_class_reference_preview_paths
from backend.app.repositories.workflow_runs import get_latest_augmentation_run, get_latest_metrics, list_pending_results
from backend.app.repositories.workflow_session import get_session_context, sync_session_state
from backend.app.runtime.errors import AppError
from backend.app.runtime.request import Request
from backend.app.runtime.response import json_response
from backend.app.services.bootstrap import RuntimeState
from backend.app.services.configuration import generation_defaults
from backend.app.services.queue import enqueue_task, remove_queued_task
from backend.app.services.sessions import parse_session_id


async def start_fine_tune(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    session_id = parse_session_id(params["session_id"])
    async with runtime_state.database.connection() as connection:
        context = await get_session_context(connection, session_id)
        if context is None or context["current_dataset_version_id"] is None:
            raise AppError(404, "Сессия не готова к fine-tune.")
        task = await create_task(
            connection,
            session_id=session_id,
            task_type=TaskType.FINE_TUNE,
            payload={},
            dataset_version_id=context["current_dataset_version_id"],
        )
    await enqueue_task(
        runtime_state.redis,
        runtime_state.settings,
        {"taskId": task["jobId"], "sessionId": str(session_id), "taskType": TaskType.FINE_TUNE.value},
    )
    return json_response(200, task)


async def generation_config(request: Request, params: dict[str, str], state: object):
    return json_response(200, generation_defaults())


async def start_generation(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    session_id = parse_session_id(params["session_id"])
    payload = request.json()
    if not isinstance(payload, dict):
        raise AppError(400, "Некорректное тело генерации.")
    prompt = payload.get("prompt")
    sample_count = payload.get("sampleCount")
    config = payload.get("config")
    if not isinstance(prompt, str) or not prompt.strip():
        raise AppError(400, "Для генерации нужен prompt.")
    if not isinstance(sample_count, int) or sample_count <= 0:
        raise AppError(400, "sampleCount должен быть положительным числом.")
    if not isinstance(config, dict):
        raise AppError(400, "Нужен объект config.")
    async with runtime_state.database.connection() as connection:
        context = await get_session_context(connection, session_id)
        if context is None or context["current_dataset_version_id"] is None:
            raise AppError(404, "Сессия не готова к генерации.")
        task = await create_task(
            connection,
            session_id=session_id,
            task_type=TaskType.GENERATION,
            payload={"prompt": prompt, "sampleCount": sample_count, "config": config},
            dataset_version_id=context["current_dataset_version_id"],
        )
    await enqueue_task(
        runtime_state.redis,
        runtime_state.settings,
        {"taskId": task["jobId"], "sessionId": str(session_id), "taskType": TaskType.GENERATION.value},
    )
    return json_response(200, task)


async def modification_source(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    session_id = parse_session_id(params["session_id"])
    async with runtime_state.database.connection() as connection:
        asset = await get_random_approved_asset(connection, session_id)
    if asset is None:
        raise AppError(404, "Для модификации не найдено подходящее изображение.")
    return json_response(200, {"assetPath": asset["storage_path"], "className": asset["class_name"]})


async def start_modification(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    session_id = parse_session_id(params["session_id"])
    payload = request.json()
    if not isinstance(payload, dict):
        raise AppError(400, "Некорректное тело модификации.")
    source_path = payload.get("sourcePath")
    sample_count = payload.get("sampleCount")
    config = payload.get("config")
    if not isinstance(source_path, str) or not source_path:
        raise AppError(400, "Для модификации нужен sourcePath.")
    if not isinstance(sample_count, int) or sample_count <= 0:
        raise AppError(400, "sampleCount должен быть положительным числом.")
    if not isinstance(config, dict):
        raise AppError(400, "Нужен объект config.")
    async with runtime_state.database.connection() as connection:
        context = await get_session_context(connection, session_id)
        if context is None or context["current_dataset_version_id"] is None:
            raise AppError(404, "Сессия не готова к модификации.")
        task = await create_task(
            connection,
            session_id=session_id,
            task_type=TaskType.MODIFICATION,
            payload={"sourcePath": source_path, "sampleCount": sample_count, "config": config},
            dataset_version_id=context["current_dataset_version_id"],
        )
    await enqueue_task(
        runtime_state.redis,
        runtime_state.settings,
        {"taskId": task["jobId"], "sessionId": str(session_id), "taskType": TaskType.MODIFICATION.value},
    )
    return json_response(200, task)


async def generation_results(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    session_id = parse_session_id(params["session_id"])
    async with runtime_state.database.connection() as connection:
        run = await get_latest_augmentation_run(connection, session_id)
        if run is None:
            return json_response(200, {"remainingCount": 0, "targetCount": 1, "items": []})
        items = await list_pending_results(connection, run["id"])
        reference_paths_by_class: dict[str, list[str]] = {}
        for item in items:
            class_name = str(item["class_name"])
            if class_name not in reference_paths_by_class:
                reference_paths_by_class[class_name] = await list_class_reference_preview_paths(
                    connection,
                    session_id,
                    class_name,
                    6,
                )
    return json_response(
        200,
        {
            "remainingCount": len(items),
            "targetCount": int(run["target_count"]),
            "items": [
                {
                    "id": str(item["id"]),
                    "previewPath": item["preview_path"],
                    "sourcePath": None,
                    "className": item["class_name"],
                    "referencePreviewPaths": reference_paths_by_class.get(str(item["class_name"]), []),
                }
                for item in items
            ],
        },
    )


async def task_status(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    session_id = parse_session_id(params["session_id"])
    try:
        task_id = UUID(params["task_id"])
    except ValueError as error:
        raise AppError(400, "Некорректный taskId.") from error
    async with runtime_state.database.connection() as connection:
        row = await get_task_status(connection, session_id, task_id)
    if row is None:
        raise AppError(404, "Задача не найдена.")
    return json_response(
        200,
        {
            "jobId": str(row["id"]),
            "status": row["status"],
            "progress": float(row["progress"]) if row["progress"] is not None else None,
            "message": row["message"],
            "error": row["error"],
            "taskType": row["task_type"],
        },
    )


async def cancel_running_task(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    session_id = parse_session_id(params["session_id"])
    try:
        task_id = UUID(params["task_id"])
    except ValueError as error:
        raise AppError(400, "Некорректный taskId.") from error
    async with runtime_state.database.connection() as connection:
        row = await cancel_task(connection, session_id, task_id)
    if row is None:
        raise AppError(404, "Активная задача для отмены не найдена.")
    await remove_queued_task(
        runtime_state.redis,
        runtime_state.settings,
        {"taskId": str(row["id"]), "sessionId": str(session_id), "taskType": row["task_type"]},
    )
    return json_response(200, {"jobId": str(row["id"]), "status": row["status"]})


async def start_classifier_training(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    session_id = parse_session_id(params["session_id"])
    async with runtime_state.database.connection() as connection:
        context = await get_session_context(connection, session_id)
        if context is None or context["current_dataset_version_id"] is None:
            raise AppError(404, "Сессия не готова к обучению классификатора.")
        task = await create_task(
            connection,
            session_id=session_id,
            task_type=TaskType.CLASSIFIER,
            payload={},
            dataset_version_id=context["current_dataset_version_id"],
        )
    await enqueue_task(
        runtime_state.redis,
        runtime_state.settings,
        {"taskId": task["jobId"], "sessionId": str(session_id), "taskType": TaskType.CLASSIFIER.value},
    )
    return json_response(200, task)


async def sync_workflow_state(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    session_id = parse_session_id(params["session_id"])
    payload = request.json()
    if not isinstance(payload, dict):
        raise AppError(400, "Некорректное тело workflow state.")
    raw_stage = payload.get("workflowStage")
    if not isinstance(raw_stage, str):
        raise AppError(400, "Нужно поле workflowStage.")
    try:
        stage = WorkflowStage(raw_stage)
    except ValueError as error:
        raise AppError(400, "Некорректный workflowStage.") from error
    mode = payload.get("currentMode")
    fine_tune_enabled = payload.get("fineTuneEnabled")
    fine_tune_resolved = payload.get("fineTuneResolved")
    async with runtime_state.database.connection() as connection:
        await sync_session_state(
            connection,
            session_id,
            stage=stage,
            mode=mode if isinstance(mode, str) else None,
            fine_tune_enabled=fine_tune_enabled if isinstance(fine_tune_enabled, bool) else None,
            fine_tune_resolved=fine_tune_resolved if isinstance(fine_tune_resolved, bool) else None,
        )
    return json_response(200, {"status": "success"})


async def metrics(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    session_id = parse_session_id(params["session_id"])
    async with runtime_state.database.connection() as connection:
        result = await get_latest_metrics(connection, session_id)
    if result is None:
        raise AppError(404, "Метрики ещё не готовы.")
    return json_response(200, result)


def _require_state(state: object) -> RuntimeState:
    if not isinstance(state, RuntimeState):
        raise RuntimeError("Runtime state is not available")
    return state
