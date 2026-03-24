from __future__ import annotations

from backend.app.domain.enums import TaskType
from backend.app.repositories.tasks import create_task
from backend.app.repositories.workflow_assets import list_active_assets_with_origin
from backend.app.repositories.workflow_runs import get_latest_metrics, list_classifier_runs
from backend.app.repositories.workflow_session import get_session_context
from backend.app.runtime.errors import AppError
from backend.app.runtime.request import Request
from backend.app.runtime.response import json_response
from backend.app.services.classifier_runtime import analyze_training_layout
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
    async with runtime_state.database.connection() as connection:
        result = await get_latest_metrics(connection, session_id)
    if result is None or not isinstance(result, dict):
        return json_response(200, {"ready": False, "precision": [], "recall": []})
    return json_response(200, {"ready": True, **result})


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
        runs = await list_classifier_runs(connection, session_id)

    split_payload = _build_split_payload(assets, runtime_state.settings.classifier_val_ratio)
    return json_response(
        200,
        {
            "split": split_payload,
            "models": [
                {
                    "id": str(run["id"]),
                    "taskId": str(run["task_id"]),
                    "datasetVersionId": str(run["dataset_version_id"]),
                    "status": run["status"],
                    "modelKey": run["model_key"],
                    "classNames": run["class_names"] if isinstance(run["class_names"], list) else [],
                    "hparams": run["hparams"] if isinstance(run["hparams"], dict) else {},
                    "pretrainedWeightsPath": run["pretrained_weights_path"],
                    "metrics": run["metrics"] if isinstance(run["metrics"], dict) else None,
                    "createdAt": run["created_at"].isoformat() if run["created_at"] is not None else None,
                    "finishedAt": run["finished_at"].isoformat() if run["finished_at"] is not None else None,
                }
                for run in runs
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
