from __future__ import annotations

from backend.app.domain.enums import TaskType
from backend.app.repositories.tasks import create_task
from backend.app.repositories.workflow_assets import list_active_assets_with_origin
from backend.app.repositories.workflow_runs import get_latest_metrics, list_metric_versions, resolve_dataset_version
from backend.app.repositories.workflow_session import get_session_context
from backend.app.runtime.errors import AppError
from backend.app.runtime.request import Request
from backend.app.runtime.response import json_response
from backend.app.services.classifier_runtime import analyze_training_layout
from backend.app.services.classifier_weights import list_classifier_weights
from backend.app.services.queue import enqueue_core_task
from backend.app.services.sessions import parse_session_id

from backend.app.api.workflow_handler_utils import parse_classifier_payload, require_runtime_state


async def start_classifier_training(request: Request, params: dict[str, str], state: object):
    runtime_state = require_runtime_state(state)
    session_id = parse_session_id(params["session_id"])
    classifier_payload = parse_classifier_payload(request, runtime_state, session_id)
    async with runtime_state.database.connection() as connection:
        context = await get_session_context(connection, session_id)
        if context is None or context["current_dataset_version_id"] is None:
            raise AppError(404, "Сессия не готова к обучению классификатора.")
        task = await create_task(
            connection,
            session_id=session_id,
            task_type=TaskType.CLASSIFIER,
            payload=classifier_payload,
            dataset_version_id=context["current_dataset_version_id"],
        )
    await enqueue_core_task(
        runtime_state.redis,
        runtime_state.settings,
        {"taskId": task["jobId"], "sessionId": str(session_id), "taskType": TaskType.CLASSIFIER.value},
    )
    return json_response(200, task)


async def metrics(request: Request, params: dict[str, str], state: object):
    runtime_state = require_runtime_state(state)
    session_id = parse_session_id(params["session_id"])
    requested_version_id = request.query_params.get("versionId")
    async with runtime_state.database.connection() as connection:
        context = await get_session_context(connection, session_id)
        if context is None or context["dataset_id"] is None or context["current_dataset_version_id"] is None:
            raise AppError(404, "Сессия не привязана к версии датасета.")
        dataset_version_id = context["current_dataset_version_id"]
        if requested_version_id:
            dataset_version_id = _parse_version_id(requested_version_id)
            resolved_version_id = await resolve_dataset_version(connection, context["dataset_id"], dataset_version_id)
            if resolved_version_id is None:
                raise AppError(404, "Версия датасета не найдена.")
            dataset_version_id = resolved_version_id
        result = await get_latest_metrics(connection, dataset_version_id)
    if result is None or not isinstance(result, dict):
        return json_response(200, {"ready": False, "precision": [], "recall": []})
    return json_response(200, {"ready": True, **result})


async def metric_versions(request: Request, params: dict[str, str], state: object):
    runtime_state = require_runtime_state(state)
    session_id = parse_session_id(params["session_id"])
    async with runtime_state.database.connection() as connection:
        context = await get_session_context(connection, session_id)
        if context is None or context["dataset_id"] is None:
            raise AppError(404, "Сессия не привязана к датасету.")
        versions = await list_metric_versions(connection, context["dataset_id"], context["current_dataset_version_id"])
    return json_response(
        200,
        {
            "items": [
                {
                    "datasetVersionId": str(item["id"]),
                    "versionIndex": int(item["version_index"]),
                    "kind": str(item["kind"]),
                    "createdAt": item["created_at"].isoformat() if item["created_at"] is not None else None,
                    "isActive": bool(item["is_active"]),
                    "hasMetrics": bool(item["has_metrics"]),
                }
                for item in versions
            ]
        },
    )


async def classifier_summary(request: Request, params: dict[str, str], state: object):
    runtime_state = require_runtime_state(state)
    session_id = parse_session_id(params["session_id"])
    async with runtime_state.database.connection() as connection:
        context = await get_session_context(connection, session_id)
        if context is None or context["dataset_id"] is None or context["current_dataset_version_id"] is None:
            raise AppError(404, "Сессия не готова к обучению классификатора.")
        assets = await list_active_assets_with_origin(
            connection,
            context["dataset_id"],
            context["current_dataset_version_id"],
        )

    split_payload = _build_split_payload(assets, runtime_state.settings.classifier_val_ratio)
    uploaded_weights = list_classifier_weights(
        runtime_state.runtime_paths,
        runtime_state.settings.runtime_dir,
        context["dataset_id"],
        session_id,
    )
    return json_response(
        200,
        {
            "split": split_payload,
            "uploadedWeights": [
                {
                    "displayName": item.display_name,
                    "fileName": item.file_name,
                    "weightsPath": item.weights_path,
                    "sizeBytes": item.size_bytes,
                    "updatedAt": item.updated_at,
                }
                for item in uploaded_weights
            ],
        },
    )


def _build_split_payload(assets: list[dict], val_ratio: float) -> dict[str, object]:
    if not assets:
        return {
            "classCount": 0,
            "trainCount": 0,
            "valCount": 0,
            "perClass": [],
            "error": "В активной версии датасета нет изображений для обучения.",
        }
    try:
        split = analyze_training_layout(assets, val_ratio=val_ratio)
    except RuntimeError as error:
        return {
            "classCount": 0,
            "trainCount": 0,
            "valCount": 0,
            "perClass": [],
            "error": str(error),
        }
    return {
        "classCount": int(split["classCount"]),
        "trainCount": int(split["trainCount"]),
        "valCount": int(split["valCount"]),
        "perClass": split["perClass"],
        "error": None,
    }


def _parse_version_id(raw_version_id: str):
    from uuid import UUID

    try:
        return UUID(raw_version_id)
    except ValueError as error:
        raise AppError(400, "Некорректный versionId.") from error
