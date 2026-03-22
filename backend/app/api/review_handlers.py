from __future__ import annotations

from uuid import UUID

from backend.app.domain.enums import WorkflowStage
from backend.app.repositories.workflow_assets import finalize_review_decisions, mark_asset_approved, reject_asset
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
        asset = await mark_asset_approved(connection, session_id, asset_id)
        if asset is None:
            raise AppError(404, "Кандидат для approve не найден.")
    return json_response(200, {"jobId": str(asset_id), "status": "success"})


async def reject_asset_handler(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    session_id = parse_session_id(params["session_id"])
    try:
        asset_id = UUID(params["asset_id"])
    except ValueError as error:
        raise AppError(400, "Некорректный assetId.") from error
    async with runtime_state.database.connection() as connection:
        asset = await reject_asset(connection, session_id, asset_id)
    if asset is None:
        raise AppError(404, "Кандидат для reject не найден.")
    return json_response(200, {"jobId": str(asset_id), "status": "success"})


async def finalize_review(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    session_id = parse_session_id(params["session_id"])
    payload = request.json()
    if not isinstance(payload, dict):
        raise AppError(400, "Некорректное тело запроса.")
    raw_next_stage = payload.get("nextStage")
    if raw_next_stage == WorkflowStage.MODIFY.value:
        next_stage = WorkflowStage.MODIFY
    elif raw_next_stage == WorkflowStage.CLASSIFIER_TRAIN.value:
        next_stage = WorkflowStage.CLASSIFIER_TRAIN
    else:
        raise AppError(400, "nextStage должен быть modify или classifier-train.")

    async with runtime_state.database.connection() as connection:
        result = await finalize_review_decisions(connection, session_id, next_stage=next_stage)
        version_id = result.get("versionId")
        dataset_id = result.get("datasetId")
        if isinstance(version_id, UUID) and isinstance(dataset_id, UUID):
            await write_version_manifest(
                connection,
                runtime_state.runtime_paths,
                runtime_state.settings.runtime_dir,
                dataset_id,
                version_id,
            )

    return json_response(
        200,
        {
            "status": "success",
            "approvedCount": result["approvedCount"],
            "rejectedCount": result["rejectedCount"],
            "versionCreated": result["versionId"] is not None,
        },
    )


def _require_state(state: object) -> RuntimeState:
    if not isinstance(state, RuntimeState):
        raise RuntimeError("Runtime state is not available")
    return state
