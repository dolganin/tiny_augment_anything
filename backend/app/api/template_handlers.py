from __future__ import annotations

from uuid import UUID

from backend.app.repositories.modification_templates import (
    create_negative_template,
    create_polygon_template,
    create_selection_template,
    create_text_template,
    delete_template,
    list_dataset_templates,
    update_template_name,
)
from backend.app.repositories.workflow_session import get_session_context
from backend.app.runtime.errors import AppError
from backend.app.runtime.request import Request
from backend.app.runtime.response import json_response
from backend.app.services.bootstrap import RuntimeState
from backend.app.services.sessions import parse_session_id


async def get_dataset_templates(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    session_id = parse_session_id(params["session_id"])
    async with runtime_state.database.connection() as connection:
        dataset_id = await _require_dataset_id(connection, session_id)
        templates = await list_dataset_templates(connection, dataset_id)
    return json_response(200, templates)


async def create_dataset_text_template(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    session_id = parse_session_id(params["session_id"])
    payload = _require_payload(request)
    name = _require_string(payload, "name")
    prompt = _require_string(payload, "prompt")
    async with runtime_state.database.connection() as connection:
        dataset_id = await _require_dataset_id(connection, session_id)
        template_id = await create_text_template(
            connection,
            dataset_id,
            name=name,
            prompt=prompt,
        )
    return json_response(201, {"id": str(template_id)})


async def create_dataset_negative_template(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    session_id = parse_session_id(params["session_id"])
    payload = _require_payload(request)
    name = _require_string(payload, "name")
    text = _require_string(payload, "text")
    async with runtime_state.database.connection() as connection:
        dataset_id = await _require_dataset_id(connection, session_id)
        template_id = await create_negative_template(connection, dataset_id, name=name, text=text)
    return json_response(201, {"id": str(template_id)})


async def create_dataset_selection_template(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    session_id = parse_session_id(params["session_id"])
    payload = _require_payload(request)
    name = _require_string(payload, "name")
    text = _require_string(payload, "text")
    async with runtime_state.database.connection() as connection:
        dataset_id = await _require_dataset_id(connection, session_id)
        template_id = await create_selection_template(connection, dataset_id, name=name, text=text)
    return json_response(201, {"id": str(template_id)})


async def create_dataset_polygon_template(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    session_id = parse_session_id(params["session_id"])
    payload = _require_payload(request)
    name = _require_string(payload, "name")
    points = _require_points(payload.get("points"))
    async with runtime_state.database.connection() as connection:
        dataset_id = await _require_dataset_id(connection, session_id)
        template_id = await create_polygon_template(connection, dataset_id, name=name, points=points)
    return json_response(201, {"id": str(template_id)})


async def delete_dataset_template(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    session_id = parse_session_id(params["session_id"])
    template_id = _parse_template_id(params["template_id"])
    async with runtime_state.database.connection() as connection:
        dataset_id = await _require_dataset_id(connection, session_id)
        deleted = await delete_template(connection, template_id, dataset_id)
    if not deleted:
        raise AppError(404, "Шаблон не найден.")
    return json_response(200, {"status": "success"})


async def rename_dataset_template(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    session_id = parse_session_id(params["session_id"])
    template_id = _parse_template_id(params["template_id"])
    payload = _require_payload(request)
    new_name = _require_string(payload, "name")
    async with runtime_state.database.connection() as connection:
        dataset_id = await _require_dataset_id(connection, session_id)
        updated = await update_template_name(connection, template_id, dataset_id, new_name)
    if not updated:
        raise AppError(404, "Шаблон не найден.")
    return json_response(200, {"status": "success"})


def _require_state(state: object) -> RuntimeState:
    if not isinstance(state, RuntimeState):
        raise RuntimeError("Runtime state is not available")
    return state


async def _require_dataset_id(connection, session_id):
    context = await get_session_context(connection, session_id)
    if context is None or context["dataset_id"] is None:
        raise AppError(404, "Для сессии не найден активный датасет.")
    return context["dataset_id"]


def _require_payload(request: Request) -> dict[str, object]:
    payload = request.json()
    if not isinstance(payload, dict):
        raise AppError(400, "Некорректное тело запроса.")
    return payload


def _require_string(payload: dict[str, object], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise AppError(400, f"Нужно непустое поле {key}.")
    return value.strip()


def _parse_template_id(raw_template_id: str) -> UUID:
    try:
        return UUID(raw_template_id)
    except ValueError as error:
        raise AppError(400, "Некорректный templateId.") from error


def _require_points(raw_points: object) -> list[list[float]]:
    if not isinstance(raw_points, list) or not raw_points:
        raise AppError(400, "Нужно непустое поле points.")
    points: list[list[float]] = []
    for raw_point in raw_points:
        if not isinstance(raw_point, list) or len(raw_point) != 2:
            raise AppError(400, "Каждая точка должна быть массивом [x, y].")
        x_raw, y_raw = raw_point
        if not isinstance(x_raw, (int, float)) or not isinstance(y_raw, (int, float)):
            raise AppError(400, "Координаты точки должны быть числами.")
        points.append([float(x_raw), float(y_raw)])
    return points
