from __future__ import annotations

from uuid import UUID

from backend.app.domain.enums import TaskType
from backend.app.repositories.sessions import save_selected_classes, touch_session
from backend.app.repositories.tasks import create_task
from backend.app.runtime.errors import AppError
from backend.app.runtime.multipart import parse_multipart
from backend.app.runtime.request import Request
from backend.app.runtime.response import json_response
from backend.app.services.bootstrap import RuntimeState
from backend.app.services.queue import enqueue_task
from backend.app.services.sessions import build_snapshot, parse_session_id
from backend.app.services.uploads import append_chunk, init_chunk_upload, prepare_dataset_upload, prepare_dataset_upload_from_staged_archive


async def upload_dataset(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    content_type = request.headers.get("content-type", "")
    files = parse_multipart(request.body, content_type)
    upload_file = next((item for item in files if item.field_name == "file"), files[0])
    async with runtime_state.database.connection() as connection:
        result = await prepare_dataset_upload(
            connection=connection,
            runtime_paths=runtime_state.runtime_paths,
            runtime_root=runtime_state.settings.runtime_dir,
            file_name=upload_file.file_name,
            file_bytes=upload_file.data,
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
    await enqueue_task(
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
    try:
        upload_id = UUID(params["upload_id"])
    except ValueError as error:
        raise AppError(400, "Некорректный uploadId.") from error
    raw_part_number = request.query_params.get("partNumber")
    raw_total_parts = request.query_params.get("totalParts")
    if raw_part_number is None or raw_total_parts is None:
        raise AppError(400, "Нужны параметры partNumber и totalParts.")
    try:
        part_number = int(raw_part_number)
        total_parts = int(raw_total_parts)
    except ValueError as error:
        raise AppError(400, "Некорректные параметры части.") from error
    progress = append_chunk(runtime_state.runtime_paths, upload_id, part_number, total_parts, request.body)
    return json_response(200, {"status": "success", "progress": progress})


async def complete_dataset_upload(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    try:
        upload_id = UUID(params["upload_id"])
    except ValueError as error:
        raise AppError(400, "Некорректный uploadId.") from error
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
    await enqueue_task(
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


async def get_session(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    session_id = parse_session_id(params["session_id"])
    async with runtime_state.database.connection() as connection:
        snapshot = await build_snapshot(connection, session_id)
        await touch_session(connection, session_id)
    return json_response(200, snapshot)


async def save_classes(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    session_id = parse_session_id(params["session_id"])
    payload = request.json()
    if not isinstance(payload, dict):
        raise AppError(400, "Некорректное тело запроса.")
    class_names = payload.get("classNames")
    if not isinstance(class_names, list) or not class_names or not all(isinstance(item, str) and item for item in class_names):
        raise AppError(400, "Нужен непустой список classNames.")
    async with runtime_state.database.connection() as connection:
        result = await save_selected_classes(connection, session_id, class_names)
    return json_response(200, result)


def _require_state(state: object) -> RuntimeState:
    if not isinstance(state, RuntimeState):
        raise RuntimeError("Runtime state is not available")
    return state
