from __future__ import annotations

from backend.app.domain.enums import TaskType, WorkflowStage
from backend.app.repositories.tasks import cancel_task, get_task_status
from backend.app.repositories.workflow_session import sync_session_state
from backend.app.runtime.errors import AppError
from backend.app.runtime.request import Request
from backend.app.runtime.response import json_response
from backend.app.services.queue import remove_core_queued_task, remove_ml_queued_task
from backend.app.services.sessions import parse_session_id
from backend.app.services.zimage import build_run_bundle

from backend.app.api.workflow_handler_utils import parse_task_id, require_runtime_state


async def task_status(request: Request, params: dict[str, str], state: object):
    runtime_state = require_runtime_state(state)
    session_id = parse_session_id(params["session_id"])
    task_id = parse_task_id(params["task_id"])
    async with runtime_state.database.connection() as connection:
        row = await get_task_status(connection, session_id, task_id)
    if row is None:
        raise AppError(404, "Задача не найдена.")
    return json_response(
        200,
        {
            "jobId": str(row["id"]),
            "status": row["status"],
            "progress": float(row["progress"]) if row["progress"] is not None else None,
            "message": row["message"],
            "error": row["error"],
            "taskType": row["task_type"],
        },
    )


async def cancel_running_task(request: Request, params: dict[str, str], state: object):
    runtime_state = require_runtime_state(state)
    session_id = parse_session_id(params["session_id"])
    task_id = parse_task_id(params["task_id"])
    async with runtime_state.database.connection() as connection:
        row = await cancel_task(connection, session_id, task_id)
    if row is None:
        raise AppError(404, "Активная задача для отмены не найдена.")
    await remove_core_queued_task(
        runtime_state.redis,
        runtime_state.settings,
        {"taskId": str(row["id"]), "sessionId": str(session_id), "taskType": row["task_type"]},
    )
    if row["task_type"] in {TaskType.MODIFICATION.value, TaskType.GENERATION.value}:
        bundle = build_run_bundle(runtime_state.runtime_paths, task_id)
        ml_task_type = "diffusion.modify" if row["task_type"] == TaskType.MODIFICATION.value else "diffusion.generate"
        await remove_ml_queued_task(
            runtime_state.redis,
            runtime_state.settings,
            {
                "taskId": str(row["id"]),
                "sessionId": str(session_id),
                "taskType": ml_task_type,
                "runDir": str(bundle.run_dir),
            },
        )
    return json_response(200, {"jobId": str(row["id"]), "status": row["status"]})


async def sync_workflow_state(request: Request, params: dict[str, str], state: object):
    runtime_state = require_runtime_state(state)
    session_id = parse_session_id(params["session_id"])
    payload = request.json()
    if not isinstance(payload, dict):
        raise AppError(400, "Некорректное тело workflow state.")
    raw_stage = payload.get("workflowStage")
    if not isinstance(raw_stage, str):
        raise AppError(400, "Нужно поле workflowStage.")
    try:
        stage = WorkflowStage(raw_stage)
    except ValueError as error:
        raise AppError(400, "Некорректный workflowStage.") from error
    mode = payload.get("currentMode")
    async with runtime_state.database.connection() as connection:
        await sync_session_state(
            connection,
            session_id,
            stage=stage,
            mode=mode if isinstance(mode, str) else None,
        )
    return json_response(200, {"status": "success"})
