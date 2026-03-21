from __future__ import annotations

import shutil
from uuid import UUID

from backend.app.repositories.catalog import get_dataset_details, get_latest_session_for_dataset, list_datasets, list_recent_tasks_for_session, list_session_ids_for_dataset
from backend.app.repositories.datasets import rename_dataset
from backend.app.repositories.sessions import delete_sessions_for_dataset
from backend.app.runtime.errors import AppError
from backend.app.services.filesystem import dataset_manifest_dir, dataset_root_dir, session_upload_dir
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
                "status": item["dataset_status"],
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


async def rename_dataset_entry(connection, dataset_id: UUID, name: str) -> None:
    normalized_name = " ".join(name.split()).strip()
    if not normalized_name:
        raise AppError(400, "Имя датасета не может быть пустым.")
    renamed = await rename_dataset(connection, dataset_id, normalized_name)
    if not renamed:
        raise AppError(404, "Датасет не найден.")


async def delete_dataset_entry(connection, runtime_paths, runtime_root, dataset_id: UUID) -> None:
    details = await get_dataset_details(connection, dataset_id)
    if details is None:
        raise AppError(404, "Датасет не найден.")
    session_ids = await list_session_ids_for_dataset(connection, dataset_id)
    await delete_sessions_for_dataset(connection, dataset_id)
    archive_path = runtime_root / str(details["source_archive_path"])
    if archive_path.exists():
        archive_path.unlink(missing_ok=True)
    for session_id in session_ids:
        shutil.rmtree(session_upload_dir(runtime_paths, session_id), ignore_errors=True)
    shutil.rmtree(dataset_root_dir(runtime_paths, dataset_id), ignore_errors=True)
    shutil.rmtree(dataset_manifest_dir(runtime_paths, dataset_id), ignore_errors=True)
