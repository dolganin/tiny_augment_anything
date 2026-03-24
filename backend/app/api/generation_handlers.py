from __future__ import annotations

from uuid import UUID

from backend.app.domain.enums import TaskType
from backend.app.repositories.tasks import create_task
from backend.app.repositories.workflow_assets import list_class_reference_preview_paths, list_modification_source_assets
from backend.app.repositories.workflow_runs import get_augmentation_run, get_latest_augmentation_run, list_augmentation_run_sources, list_pending_results
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


async def start_batch_modification(request: Request, params: dict[str, str], state: object):
    runtime_state = require_runtime_state(state)
    session_id = parse_session_id(params["session_id"])
    payload = request.json()
    if not isinstance(payload, dict):
        raise AppError(400, "Некорректное тело batch-модификации.")

    prompt = payload.get("commonPrompt")
    config = payload.get("config")
    batch_mode = payload.get("batchMode")
    sources = payload.get("sources")
    class_targets = payload.get("classTargets")
    common_area_points = payload.get("areaPoints")
    negative_prompt = payload.get("negativePrompt")
    has_sam_prompt = isinstance(config, dict) and isinstance(config.get("sam_prompt"), str) and bool(config.get("sam_prompt").strip())

    if not isinstance(prompt, str) or not prompt.strip():
        raise AppError(400, "Для batch-модификации нужен commonPrompt.")
    if batch_mode not in {"common_mask", "custom_masks"}:
        raise AppError(400, "batchMode должен быть common_mask или custom_masks.")
    if class_targets is not None and not is_valid_class_targets(class_targets):
        raise AppError(400, "classTargets должен быть объектом с положительными целыми значениями.")
    if not isinstance(config, dict):
        raise AppError(400, "Нужен объект config.")
    if isinstance(negative_prompt, str) and negative_prompt.strip() and "negative_prompt" not in config:
        config = {**config, "negative_prompt": negative_prompt.strip()}

    normalized_sources = _normalize_batch_sources(sources, batch_mode, allow_missing_area_points=has_sam_prompt)
    normalized_common_area_points = _normalize_area_points(common_area_points)
    if batch_mode == "common_mask" and not has_sam_prompt and normalized_common_area_points is None and not all(
        item["areaPoints"] is not None for item in normalized_sources
    ):
        raise AppError(400, "Для режима common_mask нужна общая маска areaPoints или маска у каждого source.")

    async with runtime_state.database.connection() as connection:
        context = await get_session_context(connection, session_id)
        if context is None or context["current_dataset_version_id"] is None:
            raise AppError(404, "Сессия не готова к batch-модификации.")
        task = await create_task(
            connection,
            session_id=session_id,
            task_type=TaskType.MODIFICATION,
            payload={
                "prompt": prompt,
                "config": config,
                "classTargets": class_targets,
                "batchMode": batch_mode,
                "areaPoints": normalized_common_area_points,
                "sources": normalized_sources,
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


async def batch_modification_sources(request: Request, params: dict[str, str], state: object):
    runtime_state = require_runtime_state(state)
    session_id = parse_session_id(params["session_id"])
    run_id = _parse_uuid(params["run_id"], "runId")
    async with runtime_state.database.connection() as connection:
        run = await get_augmentation_run(connection, session_id, run_id)
        if run is None:
            raise AppError(404, "Batch run не найден.")
        items = await list_augmentation_run_sources(connection, run_id)
    return json_response(
        200,
        {
            "runId": str(run_id),
            "isBatch": bool(run["is_batch"]),
            "batchMode": run["batch_mode"],
            "items": [
                {
                    "id": str(item["id"]),
                    "sourceAssetId": str(item["source_asset_id"]),
                    "status": item["status"],
                    "generatedCount": int(item["generated_count"]),
                    "errorMessage": item["error_message"],
                    "position": int(item["position"]),
                }
                for item in items
            ],
        },
    )


async def latest_augmentation_run(request: Request, params: dict[str, str], state: object):
    runtime_state = require_runtime_state(state)
    session_id = parse_session_id(params["session_id"])
    async with runtime_state.database.connection() as connection:
        run = await get_latest_augmentation_run(connection, session_id)
    if run is None:
        return json_response(200, {"runId": None, "status": None, "isBatch": False, "batchMode": None, "generatedCount": 0, "targetCount": 0})
    return json_response(
        200,
        {
            "runId": str(run["id"]),
            "status": run["status"],
            "isBatch": bool(run["is_batch"]),
            "batchMode": run["batch_mode"],
            "generatedCount": int(run["generated_count"]),
            "targetCount": int(run["target_count"]),
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


def _normalize_batch_sources(
    sources: object,
    batch_mode: object,
    *,
    allow_missing_area_points: bool = False,
) -> list[dict[str, object]]:
    if not isinstance(sources, list) or not sources:
        raise AppError(400, "sources должен содержать хотя бы один элемент.")
    normalized_sources: list[dict[str, object]] = []
    for index, source in enumerate(sources):
        if not isinstance(source, dict):
            raise AppError(400, f"sources[{index}] должен быть объектом.")
        asset_id = source.get("assetId")
        if not isinstance(asset_id, str) or not asset_id:
            raise AppError(400, f"sources[{index}].assetId обязателен.")
        custom_prompt = source.get("customPrompt")
        if custom_prompt is not None and not isinstance(custom_prompt, str):
            raise AppError(400, f"sources[{index}].customPrompt должен быть строкой.")
        area_points = _normalize_area_points(source.get("areaPoints"))
        if batch_mode == "custom_masks" and area_points is None and not allow_missing_area_points:
            raise AppError(400, f"Для custom_masks нужна маска в sources[{index}].areaPoints.")
        normalized_sources.append(
            {
                "assetId": asset_id,
                "areaPoints": area_points,
                "customPrompt": custom_prompt.strip() if isinstance(custom_prompt, str) and custom_prompt.strip() else None,
            }
        )
    return normalized_sources


def _parse_uuid(value: str, field_name: str) -> UUID:
    try:
        return UUID(value)
    except ValueError as error:
        raise AppError(400, f"Некорректный {field_name}.") from error
