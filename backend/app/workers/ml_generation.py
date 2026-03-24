from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from backend.app.runtime.logging import get_logger, log_event
from backend.app.services.diffusion_runtime import (
    preload_diffusion_pipe,
    release_all_diffusion_runtimes,
    release_warm_diffusion_runtime,
    warm_diffusion_runtime,
)
from backend.app.services.zimage import (
    build_run_bundle_from_dir,
    has_mask_records,
    is_cancellation_requested,
    load_config,
    write_state,
)
from backend.app.services.zimage_executor import (
    generate_results,
    prepare_prompt_segmented_input,
    prepare_polygon_segmented_input,
)


logger = get_logger(__name__)


async def execute_ml_generation(runtime_state, task_payload: dict[str, Any]) -> None:
    run_dir_value = task_payload.get("runDir")
    task_type = task_payload.get("taskType")
    if not isinstance(run_dir_value, str) or not run_dir_value or not isinstance(task_type, str):
        log_event(logger, 30, "ml_worker.task.invalid_payload", task_payload=task_payload)
        return

    bundle = build_run_bundle_from_dir(Path(run_dir_value))
    log_event(logger, 20, "ml_worker.task.begin", task_type=task_type, run_dir=bundle.run_dir)

    if is_cancellation_requested(bundle):
        log_event(
            logger,
            20,
            "ml_worker.task.cancelled_before_start",
            task_type=task_type,
            run_dir=bundle.run_dir,
        )
        write_state(
            bundle,
            {
                "status": "cancelled",
                "phase": "cancelled",
                "progress": 1.0,
                "message": "cancelled",
            },
        )
        return

    await _run_generation(runtime_state, bundle)


async def _run_generation(runtime_state, bundle) -> None:
    manifest = _load_json_dict(bundle.manifest_path)
    config = load_config(bundle)
    sample_count = int(manifest.get("sampleCount", 1))
    source_path = Path(str(manifest.get("sourcePath", "")))
    class_pool = [
        str(item) for item in manifest.get("classPool", []) if isinstance(item, str)
    ] or ["unknown"]
    area_points = manifest.get("areaPoints")
    has_seg_prompt = any(
        isinstance(item, dict) and isinstance(item.get("seg_prompt"), str) and item.get("seg_prompt").strip()
        for item in _load_json_list(bundle.input_json_path)
    )

    log_event(
        logger,
        20,
        "ml_worker.generation.begin",
        run_dir=bundle.run_dir,
        sample_count=sample_count,
        source_path=source_path,
        class_pool=class_pool,
        has_area=area_points is not None,
    )

    if runtime_state.settings.executor_mode == "stub":
        await _run_stub(bundle, source_path, class_pool, sample_count)
        return

    input_json_path = bundle.input_json_path
    if area_points is not None:
        log_event(
            logger,
            20,
            "ml_worker.generation.segment.begin",
            run_dir=bundle.run_dir,
            mode="polygon_mask",
        )
        write_state(
            bundle,
            {
                "status": "running",
                "phase": "segmenting",
                "progress": 0.15,
                "message": "Строю маску области через segment_sam2_json.py.",
            },
        )
        try:
            input_json_path = await prepare_polygon_segmented_input(
                runtime_state.settings,
                bundle.input_json_path,
                bundle.segmented_json_path,
                bundle.masks_dir,
                area_points,
                is_cancelled=lambda: _is_cancelled(bundle),
                on_progress=lambda current, total: _write_progress(
                    bundle,
                    phase="segmenting",
                    progress=min(0.28, 0.15 + current / max(total, 1) * 0.13),
                    message=f"Подготовил маски {current}/{total}",
                    current_count=current,
                ),
            )
        except RuntimeError as error:
            _write_terminal_state(bundle, error)
            return

    elif has_seg_prompt:
        log_event(
            logger,
            20,
            "ml_worker.generation.segment.begin",
            run_dir=bundle.run_dir,
            mode="prompt_mask",
        )
        write_state(
            bundle,
            {
                "status": "running",
                "phase": "segmenting",
                "progress": 0.15,
                "message": "Строю маску области по SAM prompt.",
            },
        )
        try:
            input_json_path = await prepare_prompt_segmented_input(
                runtime_state.settings,
                bundle.input_json_path,
                bundle.segmented_json_path,
                bundle.masks_dir,
                is_cancelled=lambda: _is_cancelled(bundle),
                on_progress=lambda current, total: _write_progress(
                    bundle,
                    phase="segmenting",
                    progress=min(0.28, 0.15 + current / max(total, 1) * 0.13),
                    message=f"Подготовил prompt-маски {current}/{total}",
                    current_count=current,
                ),
            )
        except RuntimeError as error:
            _write_terminal_state(bundle, error)
            return

        if not has_mask_records(bundle):
            log_event(
                logger,
                40,
                "ml_worker.generation.segment.empty",
                run_dir=bundle.run_dir,
            )
            write_state(
                bundle,
                {
                    "status": "error",
                    "phase": "segmenting",
                    "progress": 1.0,
                    "message": "Не удалось построить маску по SAM prompt.",
                },
            )
            return

        if not has_mask_records(bundle):
            log_event(
                logger,
                40,
                "ml_worker.generation.segment.empty",
                run_dir=bundle.run_dir,
            )
            write_state(
                bundle,
                {
                    "status": "error",
                    "phase": "segmenting",
                    "progress": 1.0,
                    "message": "Не удалось построить маску по выбранной области.",
                },
            )
            return

    log_event(
        logger,
        20,
        "ml_worker.generation.runtime_warmup.begin",
        run_dir=bundle.run_dir,
        config=config,
    )
    write_state(
        bundle,
        {
            "status": "running",
            "phase": "warming_up",
            "progress": 0.3,
            "message": "Поднимаю генератор из generate_zimage_json.py.",
        },
    )
    try:
        warmed = warm_diffusion_runtime(runtime_state.settings, config)
        preload_diffusion_pipe(warmed, "img2img")
    except Exception as error:
        _write_terminal_state(bundle, RuntimeError(str(error)))
        return

    ready_message = (
        f"img2img runtime уже был прогрет на {warmed.key.device}, начинаю генерацию."
        if warmed.cache_hit
        else f"img2img runtime загружен на {warmed.key.device}, начинаю генерацию."
    )
    log_event(
        logger,
        20,
        "ml_worker.generation.runtime_ready",
        run_dir=bundle.run_dir,
        cache_hit=warmed.cache_hit,
        model_id=warmed.key.model_id,
        device=warmed.key.device,
        offload=warmed.key.offload,
    )
    write_state(
        bundle,
        {
            "status": "running",
            "phase": "runtime_ready",
            "progress": 0.35,
            "message": ready_message,
            "cacheHit": warmed.cache_hit,
            "modelId": warmed.key.model_id,
            "device": warmed.key.device,
            "offload": warmed.key.offload,
            "generatedCount": 0,
        },
    )

    try:
        generated_count = await generate_results(
            warmed,
            config,
            input_json_path,
            bundle.output_json_path,
            bundle.output_dir,
            is_cancelled=lambda: _is_cancelled(bundle),
            on_progress=lambda current, total: _write_progress(
                bundle,
                phase="generating",
                progress=min(0.95, 0.35 + current / max(total, 1) * 0.6),
                message=f"Готово {current}/{total} записей генерации",
                current_count=current,
            ),
        )
    except RuntimeError as error:
        _write_terminal_state(bundle, error)
        return
    finally:
        if warmed is not None:
            release_warm_diffusion_runtime(warmed)
        release_all_diffusion_runtimes()

    log_event(
        logger,
        20,
        "ml_worker.generation.completed",
        run_dir=bundle.run_dir,
        generated_count=generated_count,
    )
    write_state(
        bundle,
        {
            "status": "success",
            "phase": "images_ready",
            "progress": 1.0,
            "message": f"Изображения готовы: {generated_count} файлов.",
            "generatedCount": generated_count,
            "cacheHit": warmed.cache_hit,
            "modelId": warmed.key.model_id,
            "device": warmed.key.device,
            "offload": warmed.key.offload,
        },
    )


async def _run_stub(bundle, source_path: Path, class_pool: list[str], sample_count: int) -> None:
    log_event(
        logger,
        20,
        "ml_worker.stub.begin",
        run_dir=bundle.run_dir,
        source_path=source_path,
        sample_count=sample_count,
    )
    if not source_path.exists():
        write_state(
            bundle,
            {
                "status": "error",
                "phase": "preparing",
                "progress": 1.0,
                "message": "Source image is missing.",
            },
        )
        return

    payload = source_path.read_bytes()
    results: list[dict[str, Any]] = []
    suffix = source_path.suffix or ".png"

    write_state(
        bundle,
        {
            "status": "running",
            "phase": "runtime_ready",
            "progress": 0.1,
            "message": "Stub runtime готов, начинаю копирование результатов.",
            "generatedCount": 0,
        },
    )

    for index in range(sample_count):
        if is_cancellation_requested(bundle):
            write_state(
                bundle,
                {
                    "status": "cancelled",
                    "phase": "cancelled",
                    "progress": 1.0,
                    "message": "cancelled",
                },
            )
            return
        output_path = bundle.output_dir / f"sample-{index + 1}{suffix}"
        output_path.write_bytes(payload)
        results.append(
            {
                "id": f"sample-{index + 1}",
                "class_name": class_pool[index % len(class_pool)],
                "result_paths": [str(output_path)],
            },
        )
        write_state(
            bundle,
            {
                "status": "running",
                "phase": "generating",
                "progress": (index + 1) / max(sample_count, 1),
                "message": f"generated {index + 1}/{sample_count}",
                "generatedCount": index + 1,
            },
        )

    bundle.output_json_path.write_text(
        json.dumps(results, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    log_event(
        logger,
        20,
        "ml_worker.stub.completed",
        run_dir=bundle.run_dir,
        generated_count=sample_count,
    )
    write_state(
        bundle,
        {
            "status": "success",
            "phase": "images_ready",
            "progress": 1.0,
            "message": f"Изображения готовы: {sample_count} файлов.",
            "generatedCount": sample_count,
        },
    )


async def _write_progress(
    bundle,
    *,
    phase: str,
    progress: float,
    message: str,
    current_count: int,
) -> None:
    state = _load_json_dict(bundle.state_path)
    state.update(
        {
            "status": "running",
            "phase": phase,
            "progress": progress,
            "message": message,
            "generatedCount": current_count,
        }
    )
    write_state(bundle, state)


async def _is_cancelled(bundle) -> bool:
    return is_cancellation_requested(bundle)


def _write_terminal_state(bundle, error: RuntimeError) -> None:
    if str(error) == "cancelled":
        write_state(
            bundle,
            {
                "status": "cancelled",
                "phase": "cancelled",
                "progress": 1.0,
                "message": "cancelled",
            },
        )
        return

    log_event(
        logger,
        40,
        "ml-worker.generation.failed",
        run_dir=str(bundle.run_dir),
        error=str(error),
    )
    write_state(
        bundle,
        {
            "status": "error",
            "phase": "failed",
            "progress": 1.0,
            "message": str(error),
        },
    )


def _load_json_dict(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    return payload if isinstance(payload, dict) else {}


def _load_json_list(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        return []
    return [item for item in payload if isinstance(item, dict)]
