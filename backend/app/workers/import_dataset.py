from __future__ import annotations

from uuid import UUID

from backend.app.domain.enums import TaskStatus, WorkflowStage
from backend.app.repositories.tasks import get_task
from backend.app.services.uploads import fail_prepared_dataset_import, import_prepared_dataset
from backend.app.workers.shared import emit_event, emit_failure


async def run_import_dataset(runtime_state, session_id: UUID, task_id: UUID) -> None:
    async with runtime_state.database.connection() as connection:
        task = await get_task(connection, task_id)
        if task is None:
            return
        payload = task["payload"]
        dataset_id = payload.get("datasetId")
        version_id = payload.get("versionId")
        archive_path = payload.get("archivePath")
        if not isinstance(dataset_id, str) or not isinstance(version_id, str) or not isinstance(archive_path, str):
            await emit_failure(runtime_state, connection, session_id, task_id, "Некорректный payload импорта датасета.")
            return
        await emit_event(
            runtime_state,
            connection,
            session_id,
            task_id,
            "upload.progress",
            {"progress": 0.15, "message": "Подготавливаю импорт датасета"},
            status=TaskStatus.RUNNING,
            progress=0.15,
            message="preparing import",
        )
        try:
            result = await import_prepared_dataset(
                connection=connection,
                runtime_paths=runtime_state.runtime_paths,
                runtime_root=runtime_state.settings.runtime_dir,
                session_id=session_id,
                dataset_id=UUID(dataset_id),
                version_id=UUID(version_id),
                archive_path=archive_path,
            )
        except Exception as error:
            await fail_prepared_dataset_import(connection, UUID(dataset_id))
            await emit_failure(runtime_state, connection, session_id, task_id, str(error))
            return
        await emit_event(
            runtime_state,
            connection,
            session_id,
            task_id,
            "upload.progress",
            {
                "progress": 0.9,
                "message": f"Импортировано {result['assetCount']} файлов по {result['classCount']} классам",
            },
            status=TaskStatus.RUNNING,
            progress=0.9,
            message="saving import results",
        )
        await emit_event(
            runtime_state,
            connection,
            session_id,
            task_id,
            "task.completed",
            {"stage": WorkflowStage.DATASET_STATS.value, "message": "Импорт датасета завершён."},
            status=TaskStatus.SUCCESS,
            progress=1.0,
            message="completed",
        )
