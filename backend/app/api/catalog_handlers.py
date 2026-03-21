from __future__ import annotations

from uuid import UUID

from backend.app.runtime.errors import AppError
from backend.app.runtime.request import Request
from backend.app.runtime.response import json_response
from backend.app.services.bootstrap import RuntimeState
from backend.app.services.catalog import activate_dataset_session, build_dataset_catalog


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


def _require_state(state: object) -> RuntimeState:
    if not isinstance(state, RuntimeState):
        raise RuntimeError("Runtime state is not available")
    return state
