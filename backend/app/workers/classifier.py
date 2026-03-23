from __future__ import annotations

import asyncio
from pathlib import Path
import shutil
from uuid import UUID

from backend.app.domain.enums import TaskStatus, WorkflowStage
from backend.app.repositories.tasks import get_task
from backend.app.repositories.workflow_assets import list_active_assets_with_origin
from backend.app.repositories.workflow_runs import create_classifier_run, finish_classifier_run
from backend.app.repositories.workflow_runs import update_classifier_run_status
from backend.app.repositories.workflow_session import get_session_context, update_session_stage
from backend.app.services.classifier_runtime import (
    analyze_training_layout,
    build_classifier_bundle,
    load_state,
    prepare_classifier_bundle,
    prepare_training_layout,
    read_metrics,
    request_cancellation,
)
from backend.app.services.downloads import build_dataset_download_archive
from backend.app.services.queue import enqueue_ml_task
from backend.app.workers.shared import emit_cancelled, emit_completion, emit_event, emit_failure, ensure_not_cancelled


async def run_classifier(runtime_state, session_id: UUID, task_id: UUID) -> None:
    async with runtime_state.database.connection() as connection:
        task = await get_task(connection, task_id)
        context = await get_session_context(connection, session_id)
        if task is None or context is None or context["dataset_id"] is None or context["current_dataset_version_id"] is None:
            await emit_failure(runtime_state, connection, session_id, task_id, "Сессия не готова к обучению классификатора.")
            return

        payload = task["payload"] if isinstance(task["payload"], dict) else {}
        assets = await list_active_assets_with_origin(
            connection,
            context["dataset_id"],
            context["current_dataset_version_id"],
        )
        if not assets:
            run_id = await create_classifier_run(
                connection,
                session_id,
                task_id,
                context["current_dataset_version_id"],
                model_key=str(payload.get("modelKey") or "EdgeNeXt_finetune"),
                class_names=[],
                hparams=payload.get("hparams", {}) if isinstance(payload.get("hparams", {}), dict) else {},
                pretrained_weights_path=None,
                checkpoints_dir="",
            )
            await update_classifier_run_status(connection, run_id, TaskStatus.ERROR)
            await emit_failure(runtime_state, connection, session_id, task_id, "В активной версии датасета нет изображений для обучения.")
            return

        bundle = build_classifier_bundle(runtime_state.runtime_paths, task_id)
        model_key = str(payload.get("modelKey") or "EdgeNeXt_finetune")
        pretrained_weights_path = payload.get("pretrainedWeightsPath")
        pretrained_weights_abs = (
            runtime_state.settings.runtime_dir / Path(str(pretrained_weights_path))
            if isinstance(pretrained_weights_path, str) and pretrained_weights_path
            else None
        )
        hparams = payload.get("hparams", {}) if isinstance(payload.get("hparams", {}), dict) else {}
        class_names = sorted({str(asset["class_name"]) for asset in assets})
        run_id = await create_classifier_run(
            connection,
            session_id,
            task_id,
            context["current_dataset_version_id"],
            model_key=model_key,
            class_names=class_names,
            hparams=hparams,
            pretrained_weights_path=None if pretrained_weights_abs is None else str(pretrained_weights_abs),
            checkpoints_dir=str(bundle.checkpoints_dir),
        )
        await update_session_stage(connection, session_id, WorkflowStage.CLASSIFIER_TRAIN)

        try:
            split = analyze_training_layout(assets, val_ratio=runtime_state.settings.classifier_val_ratio)
            layout = prepare_training_layout(bundle, runtime_state.settings.runtime_dir, assets, val_ratio=runtime_state.settings.classifier_val_ratio)
        except RuntimeError as error:
            await update_classifier_run_status(connection, run_id, TaskStatus.ERROR)
            await emit_failure(runtime_state, connection, session_id, task_id, str(error))
            return
        if layout["valCount"] == 0:
            await update_classifier_run_status(connection, run_id, TaskStatus.ERROR)
            await emit_failure(runtime_state, connection, session_id, task_id, "Не удалось подготовить валидационную выборку без синтетики.")
            return

        prepare_classifier_bundle(
            bundle,
            {
                "taskId": str(task_id),
                "sessionId": str(session_id),
                "datasetId": str(context["dataset_id"]),
                "datasetVersionId": str(context["current_dataset_version_id"]),
                "modelKey": model_key,
                "classNames": class_names,
                "hparams": hparams,
                "pretrainedWeightsPath": None if pretrained_weights_abs is None else str(pretrained_weights_abs),
                "trainRoot": str(bundle.train_dir),
                "valRoot": str(bundle.val_dir),
                "checkpointsDir": str(bundle.checkpoints_dir),
                "metricsPath": str(bundle.metrics_path),
            },
        )

        await emit_event(
            runtime_state,
            connection,
            session_id,
            task_id,
            "classifier.progress",
            {
                "phase": "dataset_prepared",
                "message": (
                    f"Подготовил layout для обучения: train={layout['trainCount']}, "
                    f"val={layout['valCount']}, classes={layout['classCount']}. "
                    "Валидация собрана только из исходных изображений."
                ),
                "split": split["perClass"],
                "progress": 0.1,
            },
            status=TaskStatus.RUNNING,
            progress=0.1,
            message="classifier dataset prepared",
        )

        await enqueue_ml_task(
            runtime_state.redis,
            runtime_state.settings,
            {
                "taskId": str(task_id),
                "sessionId": str(session_id),
                "taskType": "classifier.train",
                "runDir": str(bundle.run_dir),
            },
        )

        last_snapshot: tuple[object, object, object, object] | None = None
        while True:
            if await ensure_not_cancelled(connection, task_id):
                request_cancellation(bundle)
            state = load_state(bundle)
            snapshot = (
                state.get("status"),
                state.get("phase"),
                state.get("progress"),
                state.get("message"),
            )
            if snapshot != last_snapshot:
                last_snapshot = snapshot
                status = state.get("status")
                if status == "running":
                    progress = float(state.get("progress") or 0.0)
                    await emit_event(
                        runtime_state,
                        connection,
                        session_id,
                        task_id,
                        "classifier.progress",
                        {
                            "phase": state.get("phase"),
                            "epoch": state.get("epoch"),
                            "totalEpochs": state.get("totalEpochs"),
                            "message": state.get("message"),
                            "progress": progress,
                        },
                        status=TaskStatus.RUNNING,
                        progress=progress,
                        message=str(state.get("message") or "classifier running"),
                    )
                if status == "cancelled":
                    await update_classifier_run_status(connection, run_id, TaskStatus.CANCELLED)
                    await emit_cancelled(runtime_state, connection, session_id, task_id, "Обучение классификатора было остановлено пользователем.")
                    return
                if status == "error":
                    await update_classifier_run_status(connection, run_id, TaskStatus.ERROR)
                    await emit_failure(
                        runtime_state,
                        connection,
                        session_id,
                        task_id,
                        str(state.get("message") or "Обучение классификатора завершилось с ошибкой."),
                    )
                    return
                if status == "success":
                    break
            await asyncio.sleep(0.5)

        metrics = _adapt_metrics(read_metrics(bundle), class_names)
        await finish_classifier_run(
            connection,
            run_id,
            metrics,
            checkpoint_path=None,
        )
        shutil.rmtree(bundle.checkpoints_dir, ignore_errors=True)
        archive_path, _ = await build_dataset_download_archive(
            connection=connection,
            runtime_paths=runtime_state.runtime_paths,
            runtime_root=runtime_state.settings.runtime_dir,
            dataset_id=context["dataset_id"],
        )
        await update_session_stage(
            connection,
            session_id,
            WorkflowStage.METRICS,
            download_path=archive_path.relative_to(runtime_state.settings.runtime_dir).as_posix(),
        )
        await emit_completion(runtime_state, connection, session_id, task_id, WorkflowStage.METRICS)


def _adapt_metrics(raw_metrics: dict, class_names: list[str]) -> dict:
    precision = []
    recall = []
    for index, class_name in enumerate(class_names):
        precision_value = raw_metrics.get(f"precision_class_{index}")
        recall_value = raw_metrics.get(f"recall_class_{index}")
        if isinstance(precision_value, (int, float)):
            precision.append({"name": class_name, "value": float(precision_value)})
        if isinstance(recall_value, (int, float)):
            recall.append({"name": class_name, "value": float(recall_value)})
    return {
        "precision": precision,
        "recall": recall,
    }
