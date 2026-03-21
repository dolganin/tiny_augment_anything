from __future__ import annotations

from base64 import b64decode
from hashlib import sha256
from pathlib import Path
from typing import Any
from uuid import UUID
from zipfile import ZipFile

from backend.app.domain.enums import TaskStatus, WorkflowStage
from backend.app.repositories.tasks import get_task, save_task_event, update_task_state
from backend.app.repositories.workflow_session import update_session_stage
from backend.app.services.events import publish_session_event


TINY_PNG = b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9pW+V0UAAAAASUVORK5CYII="
)


async def emit_event(
    runtime_state,
    connection,
    session_id: UUID,
    task_id: UUID,
    event_type: str,
    payload: dict[str, Any],
    *,
    status: TaskStatus | None = None,
    progress: float | None = None,
    message: str | None = None,
) -> None:
    if status is not None:
        await update_task_state(connection, task_id, status, progress=progress, message=message)
    await save_task_event(connection, session_id, task_id, event_type, payload)
    await publish_session_event(
        runtime_state.redis,
        runtime_state.settings,
        session_id,
        {"type": event_type, "sessionId": str(session_id), "jobId": str(task_id), "payload": payload},
    )


async def emit_completion(runtime_state, connection, session_id: UUID, task_id: UUID, stage: WorkflowStage) -> None:
    await update_session_stage(connection, session_id, stage)
    await emit_event(
        runtime_state,
        connection,
        session_id,
        task_id,
        "task.completed",
        {"stage": stage.value, "message": "Задача завершена успешно."},
        status=TaskStatus.SUCCESS,
        progress=1.0,
        message="completed",
    )


async def emit_failure(runtime_state, connection, session_id: UUID, task_id: UUID, message: str) -> None:
    await emit_event(
        runtime_state,
        connection,
        session_id,
        task_id,
        "task.failed",
        {"message": message},
        status=TaskStatus.ERROR,
        message=message,
    )


async def emit_cancelled(runtime_state, connection, session_id: UUID, task_id: UUID, message: str) -> None:
    await emit_event(
        runtime_state,
        connection,
        session_id,
        task_id,
        "task.failed",
        {"message": message, "cancelled": True},
        status=TaskStatus.CANCELLED,
        progress=1.0,
        message=message,
    )


async def ensure_not_cancelled(connection, task_id: UUID) -> bool:
    task = await get_task(connection, task_id)
    return bool(task and task["status"] == TaskStatus.CANCELLED.value)


def checksum_bytes(payload: bytes) -> str:
    return sha256(payload).hexdigest()


def load_binary(path: Path | None) -> bytes:
    if path is None or not path.exists():
        return TINY_PNG
    return path.read_bytes()


def export_dataset_archive(archive_path: Path, items: list[tuple[Path, str]]) -> None:
    archive_path.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(archive_path, "w") as archive:
        for path, class_name in items:
            archive.write(path, arcname=f"{class_name}/{path.name}")
