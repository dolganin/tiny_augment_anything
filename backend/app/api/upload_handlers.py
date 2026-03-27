from __future__ import annotations

from uuid import UUID

from backend.app.domain.enums import TaskType
from backend.app.repositories.tasks import create_task
from backend.app.runtime.errors import AppError
from backend.app.runtime.logging import get_logger, log_event
from backend.app.runtime.request import Request
from backend.app.runtime.response import json_response
from backend.app.services.bootstrap import RuntimeState
from backend.app.services.queue import enqueue_core_task
from backend.app.services.sessions import parse_session_id
from backend.app.services.uploads import (
    append_chunk,
    complete_classifier_weights_upload,
    discard_chunk_upload,
    get_chunk_upload_status,
    init_chunk_upload,
    init_classifier_weights_upload,
    prepare_dataset_upload,
    prepare_dataset_upload_from_staged_archive,
)


logger = get_logger(__name__)


async def init_dataset_upload(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    payload = request.json()
    if not isinstance(payload, dict):
        raise AppError(400, "Некорректное тело запроса.")
    file_name = payload.get("fileName")
    file_size = payload.get("fileSize")
    if not isinstance(file_name, str) or not file_name:
        raise AppError(400, "Нужно поле fileName.")
    if not isinstance(file_size, int) or file_size <= 0:
        raise AppError(400, "Нужно положительное поле fileSize.")
    log_event(logger, 20, "api.upload.init.requested", file_name=file_name, file_size=file_size)
    upload = init_chunk_upload(runtime_state.runtime_paths, file_name, file_size)
    return json_response(
        200,
        {
            "uploadId": str(upload.upload_id),
            "chunkSize": upload.chunk_size,
            "totalParts": upload.total_parts,
        },
    )


async def upload_dataset_chunk(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    upload_id = _parse_upload_id(params["upload_id"])
    part_number, total_parts = _parse_chunk_coordinates(request)
    if part_number == 0 or part_number + 1 == total_parts or (part_number + 1) % 10 == 0:
        log_event(
            logger,
            20,
            "api.upload.chunk.received",
            upload_id=upload_id,
            part_number=part_number,
            total_parts=total_parts,
            payload_size=len(request.body),
        )
    progress = append_chunk(runtime_state.runtime_paths, upload_id, part_number, total_parts, request.body)
    return json_response(200, {"status": "success", "progress": progress})


async def get_dataset_upload_status(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    upload_id = _parse_upload_id(params["upload_id"])
    status = get_chunk_upload_status(runtime_state.runtime_paths, upload_id)
    return json_response(
        200,
        {
            "uploadId": str(status.upload_id),
            "fileName": status.file_name,
            "fileSize": status.file_size,
            "chunkSize": status.chunk_size,
            "totalParts": status.total_parts,
            "nextPart": status.next_part,
            "uploadedBytes": status.uploaded_bytes,
            "progress": 0 if status.file_size == 0 else min(1.0, status.uploaded_bytes / status.file_size),
        },
    )


async def complete_dataset_upload(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    upload_id = _parse_upload_id(params["upload_id"])
    log_event(logger, 20, "api.upload.complete.requested", upload_id=upload_id)
    async with runtime_state.database.connection() as connection:
        result = await prepare_dataset_upload_from_staged_archive(
            connection=connection,
            runtime_paths=runtime_state.runtime_paths,
            runtime_root=runtime_state.settings.runtime_dir,
            upload_id=upload_id,
        )
        task = await create_task(
            connection,
            session_id=result.session_id,
            task_type=TaskType.IMPORT,
            payload={
                "datasetId": str(result.dataset_id),
                "versionId": str(result.version_id),
                "archivePath": result.archive_path,
            },
            dataset_version_id=None,
        )
    log_event(
        logger,
        20,
        "api.upload.complete.enqueued",
        upload_id=upload_id,
        session_id=result.session_id,
        dataset_id=result.dataset_id,
        job_id=task["jobId"],
        archive_path=result.archive_path,
    )
    await enqueue_core_task(
        runtime_state.redis,
        runtime_state.settings,
        {"taskId": task["jobId"], "sessionId": str(result.session_id), "taskType": TaskType.IMPORT.value},
    )
    return json_response(
        200,
        {
            "sessionId": str(result.session_id),
            "datasetId": str(result.dataset_id),
            "datasetName": result.dataset_name,
            "jobId": task["jobId"],
            "status": task["status"],
            "error": None,
        },
    )


async def cancel_dataset_upload(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    upload_id = _parse_upload_id(params["upload_id"])
    log_event(logger, 20, "api.upload.cancel.requested", upload_id=upload_id)
    discard_chunk_upload(runtime_state.runtime_paths, upload_id)
    return json_response(200, {"status": "success"})


async def init_classifier_weights(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    session_id = parse_session_id(params["session_id"])
    payload = request.json()
    if not isinstance(payload, dict):
        raise AppError(400, "Некорректное тело запроса.")
    file_name = payload.get("fileName")
    file_size = payload.get("fileSize")
    if not isinstance(file_name, str) or not file_name:
        raise AppError(400, "Нужно поле fileName.")
    if not isinstance(file_size, int) or file_size <= 0:
        raise AppError(400, "Нужно положительное поле fileSize.")
    log_event(
        logger,
        20,
        "api.classifier-weights.init.requested",
        session_id=session_id,
        file_name=file_name,
        file_size=file_size,
    )
    upload = init_classifier_weights_upload(runtime_state.runtime_paths, file_name, file_size)
    return json_response(
        200,
        {
            "uploadId": str(upload.upload_id),
            "chunkSize": upload.chunk_size,
            "totalParts": upload.total_parts,
        },
    )


async def get_classifier_weights_status(request: Request, params: dict[str, str], state: object):
    _ = parse_session_id(params["session_id"])
    runtime_state = _require_state(state)
    upload_id = _parse_upload_id(params["upload_id"])
    status = get_chunk_upload_status(runtime_state.runtime_paths, upload_id)
    return json_response(
        200,
        {
            "uploadId": str(status.upload_id),
            "fileName": status.file_name,
            "fileSize": status.file_size,
            "chunkSize": status.chunk_size,
            "totalParts": status.total_parts,
            "nextPart": status.next_part,
            "uploadedBytes": status.uploaded_bytes,
            "progress": 0 if status.file_size == 0 else min(1.0, status.uploaded_bytes / status.file_size),
        },
    )


async def upload_classifier_weights_chunk(request: Request, params: dict[str, str], state: object):
    _ = parse_session_id(params["session_id"])
    runtime_state = _require_state(state)
    upload_id = _parse_upload_id(params["upload_id"])
    part_number, total_parts = _parse_chunk_coordinates(request)
    progress = append_chunk(runtime_state.runtime_paths, upload_id, part_number, total_parts, request.body)
    return json_response(200, {"status": "success", "progress": progress})


async def complete_classifier_weights(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    session_id = parse_session_id(params["session_id"])
    upload_id = _parse_upload_id(params["upload_id"])
    async with runtime_state.database.connection() as connection:
        context = await get_session_context(connection, session_id)
    if context is None or context["dataset_id"] is None:
        raise AppError(404, "Для сессии не найден активный датасет.")
    result = complete_classifier_weights_upload(
        runtime_state.runtime_paths,
        runtime_state.settings.runtime_dir,
        context["dataset_id"],
        upload_id,
    )
    return json_response(
        200,
        {
            "status": "success",
            "fileName": result.file_name,
            "weightsPath": result.weights_path,
        },
    )


async def cancel_classifier_weights(request: Request, params: dict[str, str], state: object):
    _ = parse_session_id(params["session_id"])
    runtime_state = _require_state(state)
    upload_id = _parse_upload_id(params["upload_id"])
    discard_chunk_upload(runtime_state.runtime_paths, upload_id)
    return json_response(200, {"status": "success"})


def _require_state(state: object) -> RuntimeState:
    if not isinstance(state, RuntimeState):
        raise RuntimeError("Runtime state is not available")
    return state


def _parse_upload_id(raw_upload_id: str) -> UUID:
    try:
        return UUID(raw_upload_id)
    except ValueError as error:
        raise AppError(400, "Некорректный uploadId.") from error


def _parse_chunk_coordinates(request: Request) -> tuple[int, int]:
    raw_part_number = request.query_params.get("partNumber")
    raw_total_parts = request.query_params.get("totalParts")
    if raw_part_number is None or raw_total_parts is None:
        raise AppError(400, "Нужны параметры partNumber и totalParts.")
    try:
        return int(raw_part_number), int(raw_total_parts)
    except ValueError as error:
        raise AppError(400, "Некорректные параметры части.") from error
