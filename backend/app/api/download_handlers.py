from __future__ import annotations

from backend.app.repositories.workflow_session import get_session_context
from backend.app.runtime.errors import AppError
from backend.app.runtime.request import Request
from backend.app.runtime.response import json_response
from backend.app.services.bootstrap import RuntimeState
from backend.app.services.sessions import parse_session_id


async def get_download(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    session_id = parse_session_id(params["session_id"])
    async with runtime_state.database.connection() as connection:
        context = await get_session_context(connection, session_id)
    if context is None or not context["last_download_path"]:
        raise AppError(404, "Архив ещё не готов.")
    return json_response(200, {"downloadPath": context["last_download_path"]})


def _require_state(state: object) -> RuntimeState:
    if not isinstance(state, RuntimeState):
        raise RuntimeError("Runtime state is not available")
    return state
