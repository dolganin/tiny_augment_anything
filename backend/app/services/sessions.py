from __future__ import annotations

from typing import Any
from uuid import UUID

from backend.app.runtime.errors import AppError


def adapt_snapshot(row: dict[str, Any] | None) -> dict[str, Any]:
    if row is None:
        raise AppError(404, "Сессия не найдена.")
    selected_classes = row["selected_classes"]
    return {
        "sessionId": str(row["session_id"]),
        "datasetId": str(row["dataset_id"]) if row["dataset_id"] else None,
        "datasetName": row["dataset_name"],
        "selectedClasses": selected_classes if isinstance(selected_classes, list) else [],
        "currentMode": row["current_mode"],
        "fineTuneEnabled": bool(row["fine_tune_enabled"]),
        "fineTuneResolved": bool(row["fine_tune_resolved"]),
        "workflowStage": row["workflow_stage"],
        "currentDatasetVersionId": str(row["current_dataset_version_id"]) if row["current_dataset_version_id"] else None,
        "downloadPath": row["last_download_path"],
        "revision": int(row["revision"]),
    }


def parse_session_id(raw_session_id: str) -> UUID:
    try:
        return UUID(raw_session_id)
    except ValueError as error:
        raise AppError(400, "Некорректный sessionId.") from error
