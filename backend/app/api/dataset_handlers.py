from __future__ import annotations

from backend.app.repositories.datasets import get_dataset_stats
from backend.app.repositories.sessions import get_snapshot, touch_session
from backend.app.runtime.errors import AppError
from backend.app.runtime.request import Request
from backend.app.runtime.response import json_response
from backend.app.services.bootstrap import RuntimeState
from backend.app.services.sessions import parse_session_id


async def dataset_stats(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    session_id = parse_session_id(params["session_id"])
    async with runtime_state.database.connection() as connection:
        session_row = await get_snapshot(connection, session_id)
        if session_row is None or session_row["dataset_id"] is None or session_row["current_dataset_version_id"] is None:
            raise AppError(404, "Для этой сессии датасет ещё не готов.")
        rows = await get_dataset_stats(
            connection,
            session_row["dataset_id"],
            session_row["current_dataset_version_id"],
        )
        await touch_session(connection, session_id)
    return json_response(200, {"classes": rows})


def _require_state(state: object) -> RuntimeState:
    if not isinstance(state, RuntimeState):
        raise RuntimeError("Runtime state is not available")
    return state
