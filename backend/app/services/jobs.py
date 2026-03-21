from __future__ import annotations

from uuid import UUID

from backend.app.repositories.job_queue import cancel_task_by_id, list_jobs
from backend.app.runtime.errors import AppError


async def build_jobs_list(connection) -> list[dict]:
    rows = await list_jobs(connection)
    return [
        {
            "jobId": str(row["id"]),
            "sessionId": str(row["session_id"]),
            "datasetId": str(row["dataset_id"]) if row["dataset_id"] else None,
            "datasetName": row["dataset_name"],
            "taskType": row["task_type"],
            "status": row["status"],
            "progress": float(row["progress"]) if row["progress"] is not None else 0,
            "message": row["message"],
            "errorMessage": None if row["error"] is None else row["error"].get("message"),
            "createdAt": row["created_at"].isoformat(),
            "startedAt": None if row["started_at"] is None else row["started_at"].isoformat(),
            "finishedAt": None if row["finished_at"] is None else row["finished_at"].isoformat(),
            "heartbeatAt": None if row["heartbeat_at"] is None else row["heartbeat_at"].isoformat(),
        }
        for row in rows
    ]


async def cancel_global_job(connection, task_id: UUID) -> dict:
    row = await cancel_task_by_id(connection, task_id)
    if row is None:
        raise AppError(404, "Активная задача не найдена.")
    return {"jobId": str(row["id"]), "sessionId": str(row["session_id"]), "status": row["status"]}
