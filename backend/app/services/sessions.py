from __future__ import annotations

from typing import Any
from uuid import UUID

from backend.app.domain.enums import TaskType
from backend.app.repositories.sessions import get_snapshot
from backend.app.repositories.tasks import get_latest_active_task
from backend.app.runtime.errors import AppError


def adapt_snapshot(row: dict[str, Any] | None) -> dict[str, Any]:
    if row is None:
        raise AppError(404, "Сессия не найдена.")
    selected_classes = row["selected_classes"]
    selected_class_targets = row["selected_class_targets"]
    return {
        "sessionId": str(row["session_id"]),
        "datasetId": str(row["dataset_id"]) if row["dataset_id"] else None,
        "datasetName": row["dataset_name"],
        "selectedClasses": selected_classes if isinstance(selected_classes, list) else [],
        "selectedClassTargets": selected_class_targets if isinstance(selected_class_targets, dict) else {},
        "currentMode": row["current_mode"],
        "fineTuneEnabled": bool(row["fine_tune_enabled"]),
        "fineTuneResolved": bool(row["fine_tune_resolved"]),
        "workflowStage": row["workflow_stage"],
        "currentDatasetVersionId": str(row["current_dataset_version_id"]) if row["current_dataset_version_id"] else None,
        "downloadPath": row["last_download_path"],
        "revision": int(row["revision"]),
        "fineTuneJobId": row.get("fine_tune_job_id"),
        "generationJobId": row.get("generation_job_id"),
        "classifierJobId": row.get("classifier_job_id"),
    }


def parse_session_id(raw_session_id: str) -> UUID:
    try:
        return UUID(raw_session_id)
    except ValueError as error:
        raise AppError(400, "Некорректный sessionId.") from error


async def build_snapshot(connection, session_id: UUID) -> dict[str, Any]:
    row = await get_snapshot(connection, session_id)
    if row is None:
        raise AppError(404, "Сессия не найдена.")
    fine_tune_task = await get_latest_active_task(connection, session_id, [TaskType.FINE_TUNE])
    generation_task = await get_latest_active_task(
        connection,
        session_id,
        [TaskType.GENERATION, TaskType.MODIFICATION],
    )
    classifier_task = await get_latest_active_task(connection, session_id, [TaskType.CLASSIFIER])
    return adapt_snapshot(
        {
            **row,
            "fine_tune_job_id": None if fine_tune_task is None else str(fine_tune_task["id"]),
            "generation_job_id": None if generation_task is None else str(generation_task["id"]),
            "classifier_job_id": None if classifier_task is None else str(classifier_task["id"]),
        }
    )
