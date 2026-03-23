from __future__ import annotations

from pathlib import Path
from uuid import UUID
from uuid import uuid4

from backend.app.domain.enums import TaskType, WorkflowStage
from backend.app.repositories.tasks import cancel_task, create_task, get_task_status
from backend.app.repositories.workflow_assets import list_class_reference_preview_paths, list_modification_source_assets
from backend.app.repositories.workflow_runs import get_latest_augmentation_run, get_latest_metrics, list_pending_results
from backend.app.runtime.multipart import parse_multipart_form
from backend.app.repositories.workflow_session import get_session_context, sync_session_state
from backend.app.runtime.errors import AppError
from backend.app.runtime.request import Request
from backend.app.runtime.response import json_response
from backend.app.services.bootstrap import RuntimeState
from backend.app.services.configuration import generation_defaults
from backend.app.services.filesystem import make_relative_path
from backend.app.services.queue import enqueue_core_task, remove_core_queued_task, remove_ml_queued_task
from backend.app.services.sessions import parse_session_id
from backend.app.services.zimage import build_run_bundle


CLASSIFIER_MODEL_KEYS = {"EdgeNeXt_finetune", "EVA02-small_finetune"}


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
    await enqueue_core_task(
        runtime_state.redis,
        runtime_state.settings,
        {"taskId": task["jobId"], "sessionId": str(session_id), "taskType": TaskType.FINE_TUNE.value},
    )
    return json_response(200, task)


async def generation_config(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    return json_response(200, generation_defaults(runtime_state.settings))


async def start_generation(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
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
    if class_targets is not None and not _is_valid_class_targets(class_targets):
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
    runtime_state = _require_state(state)
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
    runtime_state = _require_state(state)
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
    if class_targets is not None and not _is_valid_class_targets(class_targets):
        raise AppError(400, "classTargets должен быть объектом с положительными целыми значениями.")
    if not isinstance(config, dict):
        raise AppError(400, "Нужен объект config.")
    if area_points is not None:
        if not isinstance(area_points, list) or len(area_points) < 3:
            raise AppError(400, "areaPoints должен содержать минимум три точки.")
        for point in area_points:
            if not isinstance(point, list) or len(point) != 2:
                raise AppError(400, "Каждая точка areaPoints должна содержать две координаты.")
            if not all(isinstance(value, (int, float)) for value in point):
                raise AppError(400, "Координаты areaPoints должны быть числами.")
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
                "areaPoints": [[float(value) for value in point] for point in area_points] if area_points is not None else None,
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
    await remove_core_queued_task(
        runtime_state.redis,
        runtime_state.settings,
        {"taskId": str(row["id"]), "sessionId": str(session_id), "taskType": row["task_type"]},
    )
    if row["task_type"] in {TaskType.MODIFICATION.value, TaskType.GENERATION.value}:
        bundle = build_run_bundle(runtime_state.runtime_paths, task_id)
        ml_task_type = "diffusion.modify" if row["task_type"] == TaskType.MODIFICATION.value else "diffusion.generate"
        await remove_ml_queued_task(
            runtime_state.redis,
            runtime_state.settings,
            {
                "taskId": str(row["id"]),
                "sessionId": str(session_id),
                "taskType": ml_task_type,
                "runDir": str(bundle.run_dir),
            },
        )
    return json_response(200, {"jobId": str(row["id"]), "status": row["status"]})


async def start_classifier_training(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    session_id = parse_session_id(params["session_id"])
    classifier_payload = _parse_classifier_payload(request, runtime_state, session_id)
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


def _parse_classifier_payload(
    request: Request,
    runtime_state: RuntimeState,
    session_id: UUID,
) -> dict:
    content_type = request.headers.get("content-type", "")
    if "multipart/form-data" in content_type:
        form = parse_multipart_form(request.body, content_type)
        raw_payload = form.fields
        weights_file = next((item for item in form.files if item.field_name == "weights"), None)
    else:
        payload = request.json()
        if payload is None:
            payload = {}
        if not isinstance(payload, dict):
            raise AppError(400, "Некорректное тело classifier request.")
        raw_payload = payload
        weights_file = None

    model_key = str(raw_payload.get("modelKey") or "EdgeNeXt_finetune")
    if model_key not in CLASSIFIER_MODEL_KEYS:
        raise AppError(400, "Некорректный modelKey для классификатора.")

    hparams = {
        "train_batch_size": _parse_positive_int(raw_payload.get("trainBatchSize"), "trainBatchSize", 32),
        "val_batch_size": _parse_positive_int(raw_payload.get("valBatchSize"), "valBatchSize", 64),
        "learning_rate": _parse_positive_float(raw_payload.get("learningRate"), "learningRate", 3e-4),
        "weight_decay": _parse_non_negative_float(raw_payload.get("weightDecay"), "weightDecay", 1e-6),
        "epochs": _parse_positive_int(raw_payload.get("epochs"), "epochs", 10),
    }

    pretrained_weights_path = _resolve_pretrained_weights_path(
        runtime_state,
        session_id,
        raw_payload.get("pretrainedWeightsPath"),
    )
    if weights_file is not None and weights_file.file_name:
        weights_dir = runtime_state.runtime_paths.temp / "classifier-weights" / str(session_id)
        weights_dir.mkdir(parents=True, exist_ok=True)
        target_path = weights_dir / f"{uuid4()}_{weights_file.file_name}"
        target_path.write_bytes(weights_file.data)
        pretrained_weights_path = make_relative_path(
            runtime_state.settings.runtime_dir,
            target_path,
        )

    return {
        "modelKey": model_key,
        "hparams": hparams,
        "pretrainedWeightsPath": pretrained_weights_path,
    }


def _resolve_pretrained_weights_path(
    runtime_state: RuntimeState,
    session_id: UUID,
    raw_path: object,
) -> str | None:
    if raw_path is None or raw_path == "":
        return None
    if not isinstance(raw_path, str):
        raise AppError(400, "pretrainedWeightsPath должен быть строкой.")
    candidate = (runtime_state.settings.runtime_dir / Path(raw_path)).resolve()
    allowed_root = (runtime_state.runtime_paths.temp / "classifier-weights" / str(session_id)).resolve()
    try:
        candidate.relative_to(allowed_root)
    except ValueError as error:
        raise AppError(400, "pretrainedWeightsPath не принадлежит текущей сессии.") from error
    if not candidate.exists():
        raise AppError(400, "Файл предобученных весов не найден.")
    return make_relative_path(runtime_state.settings.runtime_dir, candidate)


def _parse_positive_int(raw_value: object, field_name: str, default: int) -> int:
    if raw_value is None or raw_value == "":
        return default
    try:
        value = int(raw_value)
    except (TypeError, ValueError) as error:
        raise AppError(400, f"Поле {field_name} должно быть целым числом.") from error
    if value <= 0:
        raise AppError(400, f"Поле {field_name} должно быть положительным.")
    return value


def _parse_positive_float(raw_value: object, field_name: str, default: float) -> float:
    if raw_value is None or raw_value == "":
        return default
    try:
        value = float(raw_value)
    except (TypeError, ValueError) as error:
        raise AppError(400, f"Поле {field_name} должно быть числом.") from error
    if value <= 0:
        raise AppError(400, f"Поле {field_name} должно быть положительным.")
    return value


def _parse_non_negative_float(raw_value: object, field_name: str, default: float) -> float:
    if raw_value is None or raw_value == "":
        return default
    try:
        value = float(raw_value)
    except (TypeError, ValueError) as error:
        raise AppError(400, f"Поле {field_name} должно быть числом.") from error
    if value < 0:
        raise AppError(400, f"Поле {field_name} не должно быть отрицательным.")
    return value


def _is_valid_class_targets(value: object) -> bool:
    if not isinstance(value, dict):
        return False
    for class_name, count in value.items():
        if not isinstance(class_name, str) or not class_name:
            return False
        if not isinstance(count, int) or count <= 0:
            return False
    return True
