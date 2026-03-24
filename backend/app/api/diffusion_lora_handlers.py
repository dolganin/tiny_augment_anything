from __future__ import annotations

from backend.app.runtime.errors import AppError
from backend.app.runtime.logging import get_logger, log_event
from backend.app.runtime.request import Request
from backend.app.runtime.response import json_response
from backend.app.repositories.workflow_session import get_session_context
from backend.app.services.bootstrap import RuntimeState
from backend.app.services.lora_adapters import list_lora_adapters
from backend.app.services.sessions import parse_session_id
from backend.app.services.staged_uploads import (
    append_chunk,
    complete_lora_adapter_upload,
    discard_chunk_upload,
    get_chunk_upload_status,
    init_lora_adapter_upload,
)

from backend.app.api.upload_handlers import _parse_chunk_coordinates, _parse_upload_id


logger = get_logger(__name__)


async def list_diffusion_lora_adapters(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    session_id = parse_session_id(params["session_id"])
    dataset_id = await _require_dataset_id(runtime_state, session_id)
    items = list_lora_adapters(runtime_state.runtime_paths, runtime_state.settings.runtime_dir, dataset_id)
    return json_response(
        200,
        {
            "items": [
                {
                    "displayName": item.display_name,
                    "fileName": item.file_name,
                    "adapterPath": item.adapter_path,
                    "sizeBytes": item.size_bytes,
                    "updatedAt": item.updated_at,
                }
                for item in items
            ]
        },
    )


async def init_diffusion_lora_upload(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    session_id = parse_session_id(params["session_id"])
    payload = request.json()
    if not isinstance(payload, dict):
        raise AppError(400, "Некорректное тело запроса.")
    file_name = payload.get("fileName")
    file_size = payload.get("fileSize")
    display_name = payload.get("displayName")
    if not isinstance(file_name, str) or not file_name:
        raise AppError(400, "Нужно поле fileName.")
    if not isinstance(file_size, int) or file_size <= 0:
        raise AppError(400, "Нужно положительное поле fileSize.")
    if not isinstance(display_name, str) or not display_name.strip():
        raise AppError(400, "Нужно непустое поле displayName.")
    log_event(
        logger,
        20,
        "api.diffusion-lora.init.requested",
        session_id=session_id,
        file_name=file_name,
        display_name=display_name,
        file_size=file_size,
    )
    upload = init_lora_adapter_upload(runtime_state.runtime_paths, file_name, file_size, display_name)
    return json_response(200, {"uploadId": str(upload.upload_id), "chunkSize": upload.chunk_size, "totalParts": upload.total_parts})


async def get_diffusion_lora_upload_status(request: Request, params: dict[str, str], state: object):
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


async def upload_diffusion_lora_chunk(request: Request, params: dict[str, str], state: object):
    _ = parse_session_id(params["session_id"])
    runtime_state = _require_state(state)
    upload_id = _parse_upload_id(params["upload_id"])
    part_number, total_parts = _parse_chunk_coordinates(request)
    progress = append_chunk(runtime_state.runtime_paths, upload_id, part_number, total_parts, request.body)
    return json_response(200, {"status": "success", "progress": progress})


async def complete_diffusion_lora_upload(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    session_id = parse_session_id(params["session_id"])
    dataset_id = await _require_dataset_id(runtime_state, session_id)
    upload_id = _parse_upload_id(params["upload_id"])
    result = complete_lora_adapter_upload(
        runtime_state.runtime_paths,
        runtime_state.settings.runtime_dir,
        dataset_id,
        upload_id,
    )
    return json_response(
        200,
        {
            "displayName": result.display_name,
            "fileName": result.file_name,
            "adapterPath": result.adapter_path,
        },
    )


async def cancel_diffusion_lora_upload(request: Request, params: dict[str, str], state: object):
    _ = parse_session_id(params["session_id"])
    runtime_state = _require_state(state)
    upload_id = _parse_upload_id(params["upload_id"])
    discard_chunk_upload(runtime_state.runtime_paths, upload_id)
    return json_response(200, {"status": "success"})


def _require_state(state: object) -> RuntimeState:
    if not isinstance(state, RuntimeState):
        raise RuntimeError("Application state is not initialized")
    return state


async def _require_dataset_id(runtime_state: RuntimeState, session_id):
    async with runtime_state.database.connection() as connection:
        context = await get_session_context(connection, session_id)
    if context is None or context["dataset_id"] is None:
        raise AppError(404, "Для сессии не найден активный датасет.")
    return context["dataset_id"]
