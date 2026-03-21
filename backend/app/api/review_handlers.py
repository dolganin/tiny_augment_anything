from __future__ import annotations

from pathlib import Path
from uuid import UUID

from backend.app.repositories.workflow_assets import create_version_from_current_state, get_asset_for_review, reject_asset
from backend.app.runtime.errors import AppError
from backend.app.runtime.request import Request
from backend.app.runtime.response import json_response
from backend.app.services.bootstrap import RuntimeState
from backend.app.services.sessions import parse_session_id
from backend.app.services.versioning import write_version_manifest


async def approve_asset(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    session_id = parse_session_id(params["session_id"])
    try:
        asset_id = UUID(params["asset_id"])
    except ValueError as error:
        raise AppError(400, "Некорректный assetId.") from error
    async with runtime_state.database.connection() as connection:
        asset = await get_asset_for_review(connection, session_id, asset_id)
        if asset is None:
            raise AppError(404, "Кандидат для approve не найден.")
        version_id = await create_version_from_current_state(connection, session_id, asset_id)
        await write_version_manifest(
            connection,
            runtime_state.runtime_paths,
            runtime_state.settings.runtime_dir,
            asset["dataset_id"],
            version_id,
        )
    return json_response(200, {"jobId": str(asset_id), "status": "success"})


async def reject_asset_handler(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    session_id = parse_session_id(params["session_id"])
    try:
        asset_id = UUID(params["asset_id"])
    except ValueError as error:
        raise AppError(400, "Некорректный assetId.") from error
    async with runtime_state.database.connection() as connection:
        asset = await reject_asset(connection, asset_id)
    if asset is None:
        raise AppError(404, "Кандидат для reject не найден.")
    target_path = runtime_state.settings.runtime_dir / Path(asset["storage_path"])
    if target_path.exists():
        target_path.unlink()
    return json_response(200, {"jobId": str(asset_id), "status": "success"})


def _require_state(state: object) -> RuntimeState:
    if not isinstance(state, RuntimeState):
        raise RuntimeError("Runtime state is not available")
    return state
