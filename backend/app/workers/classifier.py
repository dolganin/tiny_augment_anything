from __future__ import annotations

import asyncio
from pathlib import Path
from uuid import UUID

from backend.app.domain.enums import TaskStatus, WorkflowStage
from backend.app.repositories.datasets import get_dataset_stats
from backend.app.repositories.tasks import get_task
from backend.app.repositories.workflow_assets import list_active_assets
from backend.app.repositories.workflow_runs import create_classifier_run, finish_classifier_run
from backend.app.repositories.workflow_session import get_session_context, update_session_stage
from backend.app.services.filesystem import dataset_exports_dir
from backend.app.workers.shared import emit_cancelled, emit_completion, emit_event, emit_failure, ensure_not_cancelled, export_dataset_archive


async def run_classifier(runtime_state, session_id: UUID, task_id: UUID) -> None:
    async with runtime_state.database.connection() as connection:
        task = await get_task(connection, task_id)
        context = await get_session_context(connection, session_id)
        if task is None or context is None or context["dataset_id"] is None or context["current_dataset_version_id"] is None:
            await emit_failure(runtime_state, connection, session_id, task_id, "Сессия не готова к обучению классификатора.")
            return
        run_id = await create_classifier_run(connection, session_id, task_id, context["current_dataset_version_id"])
        await update_session_stage(connection, session_id, WorkflowStage.CLASSIFIER_TRAIN)
        for epoch in range(1, 4):
            if await ensure_not_cancelled(connection, task_id):
                await emit_cancelled(runtime_state, connection, session_id, task_id, "Обучение классификатора было остановлено пользователем.")
                return
            await asyncio.sleep(0.2)
            progress = epoch / 3
            await emit_event(
                runtime_state,
                connection,
                session_id,
                task_id,
                "classifier.progress",
                {
                    "epoch": epoch,
                    "totalEpochs": 3,
                    "loss": round(0.7 / epoch, 4),
                    "etaSeconds": int((3 - epoch) * 2),
                    "message": "Stub classifier progress",
                    "progress": progress,
                },
                status=TaskStatus.RUNNING,
                progress=progress,
                message=f"classifier {epoch}/3",
            )
        class_stats = await get_dataset_stats(connection, context["dataset_id"], context["current_dataset_version_id"])
        metrics = _build_metrics(class_stats)
        await finish_classifier_run(connection, run_id, metrics)
        download_path = await _build_export_archive(runtime_state, connection, session_id, context["dataset_id"], context["current_dataset_version_id"])
        await update_session_stage(
            connection,
            session_id,
            WorkflowStage.METRICS,
            download_path=download_path,
        )
        await emit_completion(runtime_state, connection, session_id, task_id, WorkflowStage.METRICS)


def _build_metrics(class_stats: list[dict]) -> dict:
    precision = []
    recall = []
    for row in class_stats:
        count = int(row["count"])
        score = min(0.99, 0.55 + count / max(count + 5, 1) * 0.35)
        precision.append({"name": row["name"], "value": round(score, 4)})
        recall.append({"name": row["name"], "value": round(min(0.99, score - 0.05), 4)})
    return {"precision": precision, "recall": recall}


async def _build_export_archive(runtime_state, connection, session_id: UUID, dataset_id: UUID, version_id: UUID) -> str:
    rows = await list_active_assets(connection, dataset_id, version_id)
    export_dir = dataset_exports_dir(runtime_state.runtime_paths, dataset_id)
    archive_path = export_dir / f"{session_id}-dataset.zip"
    items = [
        (runtime_state.settings.runtime_dir / Path(row["storage_path"]), row["class_name"])
        for row in rows
    ]
    export_dataset_archive(archive_path, items)
    return archive_path.relative_to(runtime_state.settings.runtime_dir).as_posix()
