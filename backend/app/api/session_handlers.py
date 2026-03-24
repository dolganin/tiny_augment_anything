from __future__ import annotations

from backend.app.repositories.sessions import save_selected_classes, touch_session
from backend.app.runtime.errors import AppError
from backend.app.runtime.request import Request
from backend.app.runtime.response import json_response
from backend.app.services.bootstrap import RuntimeState
from backend.app.services.sessions import build_snapshot, parse_session_id


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
    class_targets = payload.get("classTargets")
    if not isinstance(class_names, list) or not class_names or not all(isinstance(item, str) and item for item in class_names):
        raise AppError(400, "Нужен непустой список classNames.")
    if not isinstance(class_targets, dict):
        raise AppError(400, "Нужен объект classTargets.")
    normalized_targets = {
        class_name: _parse_positive_int(class_targets.get(class_name), f"classTargets.{class_name}")
        for class_name in class_names
    }
    async with runtime_state.database.connection() as connection:
        result = await save_selected_classes(connection, session_id, class_names, normalized_targets)
    return json_response(200, result)


def _require_state(state: object) -> RuntimeState:
    if not isinstance(state, RuntimeState):
        raise RuntimeError("Runtime state is not available")
    return state


def _parse_positive_int(value: object, field_name: str) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError) as error:
        raise AppError(400, f"Поле {field_name} должно быть положительным целым числом.") from error
    if parsed <= 0:
        raise AppError(400, f"Поле {field_name} должно быть положительным целым числом.")
    return parsed
