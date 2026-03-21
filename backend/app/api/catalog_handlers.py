from __future__ import annotations

from uuid import UUID

from backend.app.runtime.errors import AppError
from backend.app.runtime.request import Request
from backend.app.runtime.response import json_response
from backend.app.services.bootstrap import RuntimeState
from backend.app.services.catalog import activate_dataset_session, build_dataset_catalog, delete_dataset_entry, rename_dataset_entry


async def datasets_catalog(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    async with runtime_state.database.connection() as connection:
        items = await build_dataset_catalog(connection)
    return json_response(200, {"items": items})


async def activate_dataset(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    try:
        dataset_id = UUID(params["dataset_id"])
    except ValueError as error:
        raise AppError(400, "Некорректный datasetId.") from error
    async with runtime_state.database.connection() as connection:
        snapshot = await activate_dataset_session(connection, dataset_id)
    return json_response(200, snapshot)


async def rename_dataset(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    try:
        dataset_id = UUID(params["dataset_id"])
    except ValueError as error:
        raise AppError(400, "Некорректный datasetId.") from error
    payload = request.json()
    if not isinstance(payload, dict):
        raise AppError(400, "Некорректное тело запроса.")
    name = payload.get("name")
    if not isinstance(name, str):
        raise AppError(400, "Нужно поле name.")
    async with runtime_state.database.connection() as connection:
        await rename_dataset_entry(connection, dataset_id, name)
    return json_response(200, {"status": "success"})


async def delete_dataset(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    try:
        dataset_id = UUID(params["dataset_id"])
    except ValueError as error:
        raise AppError(400, "Некорректный datasetId.") from error
    async with runtime_state.database.connection() as connection:
        await delete_dataset_entry(
            connection,
            runtime_paths=runtime_state.runtime_paths,
            runtime_root=runtime_state.settings.runtime_dir,
            dataset_id=dataset_id,
        )
    return json_response(200, {"status": "success"})


def _require_state(state: object) -> RuntimeState:
    if not isinstance(state, RuntimeState):
        raise RuntimeError("Runtime state is not available")
    return state
