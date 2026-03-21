from __future__ import annotations

from uuid import UUID

from backend.app.runtime.errors import AppError
from backend.app.runtime.request import Request
from backend.app.runtime.response import json_response
from backend.app.services.bootstrap import RuntimeState
from backend.app.services.jobs import build_jobs_list, cancel_global_job


async def list_global_jobs(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    async with runtime_state.database.connection() as connection:
        items = await build_jobs_list(connection)
    return json_response(200, {"items": items})


async def cancel_global_job_handler(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    try:
        task_id = UUID(params["job_id"])
    except ValueError as error:
        raise AppError(400, "Некорректный jobId.") from error
    async with runtime_state.database.connection() as connection:
        payload = await cancel_global_job(connection, task_id)
    return json_response(200, payload)


def _require_state(state: object) -> RuntimeState:
    if not isinstance(state, RuntimeState):
        raise RuntimeError("Runtime state is not available")
    return state
