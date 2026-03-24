from __future__ import annotations

from backend.app.domain.enums import TaskType
from backend.app.repositories.tasks import create_task
from backend.app.repositories.workflow_assets import list_class_reference_preview_paths, list_modification_source_assets
from backend.app.repositories.workflow_runs import get_latest_augmentation_run, list_pending_results
from backend.app.runtime.errors import AppError
from backend.app.runtime.request import Request
from backend.app.runtime.response import json_response
from backend.app.services.configuration import generation_defaults
from backend.app.services.queue import enqueue_core_task
from backend.app.services.sessions import parse_session_id

from backend.app.api.workflow_handler_utils import is_valid_class_targets, require_runtime_state
from backend.app.repositories.workflow_session import get_session_context


async def generation_config(request: Request, params: dict[str, str], state: object):
    runtime_state = require_runtime_state(state)
    return json_response(200, generation_defaults(runtime_state.settings))


async def start_generation(request: Request, params: dict[str, str], state: object):
    runtime_state = require_runtime_state(state)
    session_id = parse_session_id(params["session_id"])
    payload = request.json()
    if not isinstance(payload, dict):
        raise AppError(400, "Некорректное тело генерации.")
    prompt = payload.get("prompt")
    sample_count = payload.get("sampleCount")
    class_targets = payload.get("classTargets")
    config = payload.get("config")
    if not isinstance(prompt, str) or not prompt.strip():
        raise AppError(400, "Для генерации нужен prompt.")
    if not isinstance(sample_count, int) or sample_count <= 0:
        raise AppError(400, "sampleCount должен быть положительным числом.")
    if class_targets is not None and not is_valid_class_targets(class_targets):
        raise AppError(400, "classTargets должен быть объектом с положительными целыми значениями.")
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
            payload={"prompt": prompt, "sampleCount": sample_count, "classTargets": class_targets, "config": config},
            dataset_version_id=context["current_dataset_version_id"],
        )
    await enqueue_core_task(
        runtime_state.redis,
        runtime_state.settings,
        {"taskId": task["jobId"], "sessionId": str(session_id), "taskType": TaskType.GENERATION.value},
    )
    return json_response(200, task)


async def modification_source(request: Request, params: dict[str, str], state: object):
    runtime_state = require_runtime_state(state)
    session_id = parse_session_id(params["session_id"])
    async with runtime_state.database.connection() as connection:
        assets = await list_modification_source_assets(connection, session_id)
    if not assets:
        raise AppError(404, "Для модификации не найдено подходящее изображение.")
    asset = assets[0]
    return json_response(
        200,
        {
            "assetId": str(asset["id"]),
            "previewPath": asset["preview_path"],
            "className": asset["class_name"],
            "items": [
                {
                    "assetId": str(item["id"]),
                    "previewPath": item["preview_path"],
                    "className": item["class_name"],
                }
                for item in assets
            ],
        },
    )


async def start_modification(request: Request, params: dict[str, str], state: object):
    runtime_state = require_runtime_state(state)
    session_id = parse_session_id(params["session_id"])
    payload = request.json()
    if not isinstance(payload, dict):
        raise AppError(400, "Некорректное тело модификации.")
    prompt = payload.get("prompt")
    source_asset_id = payload.get("sourceAssetId")
    sample_count = payload.get("sampleCount")
    class_targets = payload.get("classTargets")
    config = payload.get("config")
    area_points = payload.get("areaPoints")
    if not isinstance(prompt, str) or not prompt.strip():
        raise AppError(400, "Для модификации нужен prompt.")
    if not isinstance(source_asset_id, str) or not source_asset_id:
        raise AppError(400, "Для модификации нужен sourceAssetId.")
    if not isinstance(sample_count, int) or sample_count <= 0:
        raise AppError(400, "sampleCount должен быть положительным числом.")
    if class_targets is not None and not is_valid_class_targets(class_targets):
        raise AppError(400, "classTargets должен быть объектом с положительными целыми значениями.")
    if not isinstance(config, dict):
        raise AppError(400, "Нужен объект config.")
    normalized_area_points = _normalize_area_points(area_points)
    async with runtime_state.database.connection() as connection:
        context = await get_session_context(connection, session_id)
        if context is None or context["current_dataset_version_id"] is None:
            raise AppError(404, "Сессия не готова к модификации.")
        task = await create_task(
            connection,
            session_id=session_id,
            task_type=TaskType.MODIFICATION,
            payload={
                "prompt": prompt,
                "sourceAssetId": source_asset_id,
                "sampleCount": sample_count,
                "classTargets": class_targets,
                "config": config,
                "areaPoints": normalized_area_points,
            },
            dataset_version_id=context["current_dataset_version_id"],
        )
    await enqueue_core_task(
        runtime_state.redis,
        runtime_state.settings,
        {"taskId": task["jobId"], "sessionId": str(session_id), "taskType": TaskType.MODIFICATION.value},
    )
    return json_response(200, task)


async def generation_results(request: Request, params: dict[str, str], state: object):
    runtime_state = require_runtime_state(state)
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
                    "className": item["class_name"],
                    "referencePreviewPaths": reference_paths_by_class.get(str(item["class_name"]), []),
                }
                for item in items
            ],
        },
    )


def _normalize_area_points(area_points: object) -> list[list[float]] | None:
    if area_points is None:
        return None
    if not isinstance(area_points, list) or len(area_points) < 3:
        raise AppError(400, "areaPoints должен содержать минимум три точки.")
    normalized_points: list[list[float]] = []
    for point in area_points:
        if not isinstance(point, list) or len(point) != 2:
            raise AppError(400, "Каждая точка areaPoints должна содержать две координаты.")
        if not all(isinstance(value, (int, float)) for value in point):
            raise AppError(400, "Координаты areaPoints должны быть числами.")
        normalized_points.append([float(value) for value in point])
    return normalized_points
