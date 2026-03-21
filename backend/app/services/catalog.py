from __future__ import annotations

from uuid import UUID

from backend.app.repositories.catalog import get_latest_session_for_dataset, list_datasets, list_recent_tasks_for_session
from backend.app.runtime.errors import AppError
from backend.app.services.sessions import build_snapshot


async def build_dataset_catalog(connection) -> list[dict]:
    items = await list_datasets(connection)
    result: list[dict] = []
    for item in items:
        recent_tasks = await list_recent_tasks_for_session(connection, item["session_id"], 3)
        result.append(
            {
                "datasetId": str(item["dataset_id"]),
                "datasetName": item["dataset_name"],
                "sessionId": str(item["session_id"]),
                "workflowStage": item["workflow_stage"],
                "currentMode": item["current_mode"],
                "fineTuneEnabled": bool(item["fine_tune_enabled"]),
                "fineTuneResolved": bool(item["fine_tune_resolved"]),
                "versionIndex": int(item["version_index"]),
                "assetCount": int(item["asset_count"]),
                "updatedAt": item["updated_at"].isoformat(),
                "recentTasks": [
                    {
                        "jobId": str(task["id"]),
                        "taskType": task["task_type"],
                        "status": task["status"],
                        "progress": float(task["progress"]) if task["progress"] is not None else 0,
                        "message": task["message"],
                        "errorMessage": None if task["error"] is None else task["error"].get("message"),
                    }
                    for task in recent_tasks
                ],
            }
        )
    return result


async def activate_dataset_session(connection, dataset_id: UUID) -> dict:
    row = await get_latest_session_for_dataset(connection, dataset_id)
    if row is None:
        raise AppError(404, "Для датасета не найдена активная сессия.")
    return await build_snapshot(connection, row["session_id"])
