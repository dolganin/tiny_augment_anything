from __future__ import annotations

from backend.app.repositories.sessions import save_selected_classes, touch_session
from backend.app.runtime.errors import AppError
from backend.app.runtime.multipart import parse_multipart
from backend.app.runtime.request import Request
from backend.app.runtime.response import json_response
from backend.app.services.bootstrap import RuntimeState
from backend.app.services.sessions import build_snapshot, parse_session_id
from backend.app.services.uploads import process_dataset_upload


async def upload_dataset(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    content_type = request.headers.get("content-type", "")
    files = parse_multipart(request.body, content_type)
    upload_file = next((item for item in files if item.field_name == "file"), files[0])
    async with runtime_state.database.connection() as connection:
        result = await process_dataset_upload(
            connection=connection,
            runtime_paths=runtime_state.runtime_paths,
            runtime_root=runtime_state.settings.runtime_dir,
            file_name=upload_file.file_name,
            file_bytes=upload_file.data,
        )
    return json_response(
        200,
        {
            "sessionId": str(result.session_id),
            "datasetId": str(result.dataset_id),
            "datasetName": result.dataset_name,
            "status": "success",
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
