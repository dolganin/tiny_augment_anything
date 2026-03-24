from __future__ import annotations

from pathlib import Path

from backend.app.runtime.logging import get_logger, log_event
from backend.app.services.diffusion_runtime import (
    preload_diffusion_pipe,
    release_all_diffusion_runtimes,
    release_warm_diffusion_runtime,
    warm_diffusion_runtime,
)
from backend.app.services.lora_adapters import resolve_lora_adapter_path
from backend.app.services.zimage import has_mask_records, load_config, write_state
from backend.app.services.zimage_executor import (
    generate_results,
    prepare_polygon_segmented_input,
    prepare_prompt_segmented_input,
)
from backend.app.workers.ml_generation_progress import (
    is_cancelled,
    load_json_dict,
    load_json_list,
    write_progress,
    write_terminal_state,
)
from backend.app.workers.ml_generation_stub import run_stub


logger = get_logger(__name__)


async def run_generation(runtime_state, bundle) -> None:
    manifest = load_json_dict(bundle.manifest_path)
    config = load_config(bundle)
    sample_count = int(manifest.get("sampleCount", 1))
    source_path = Path(str(manifest.get("sourcePath", "")))
    class_pool = [str(item) for item in manifest.get("classPool", []) if isinstance(item, str)] or ["unknown"]
    area_points = manifest.get("areaPoints")
    has_seg_prompt = any(
        isinstance(item, dict) and isinstance(item.get("seg_prompt"), str) and item.get("seg_prompt").strip()
        for item in load_json_list(bundle.input_json_path)
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
        await run_stub(bundle, source_path, class_pool, sample_count)
        return

    input_json_path = bundle.input_json_path
    if area_points is not None:
        try:
            input_json_path = await _prepare_polygon_input(runtime_state, bundle, area_points)
        except RuntimeError as error:
            write_terminal_state(bundle, error)
            return
    elif has_seg_prompt:
        try:
            input_json_path = await _prepare_prompt_input(runtime_state, bundle)
        except RuntimeError as error:
            write_terminal_state(bundle, error)
            return
        if not has_mask_records(bundle):
            log_event(logger, 40, "ml_worker.generation.segment.empty", run_dir=bundle.run_dir)
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

    log_event(logger, 20, "ml_worker.generation.runtime_warmup.begin", run_dir=bundle.run_dir, config=config)
    write_state(
        bundle,
        {
            "status": "running",
            "phase": "warming_up",
            "progress": 0.3,
            "message": "Поднимаю генератор из generate_zimage_json.py.",
        },
    )
    warmed = None
    resolved_lora_path = None
    try:
        resolved_lora_path = resolve_lora_adapter_path(runtime_state.settings.runtime_dir, config.get("lora_path"))
        warmed = warm_diffusion_runtime(runtime_state.settings, config, lora_path=resolved_lora_path)
        preload_diffusion_pipe(warmed, "img2img")
    except Exception as error:
        write_terminal_state(bundle, RuntimeError(str(error)))
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
        lora_path=str(resolved_lora_path) if resolved_lora_path is not None else None,
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
            "loraPath": str(resolved_lora_path) if resolved_lora_path is not None else None,
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
            is_cancelled=lambda: is_cancelled(bundle),
            on_progress=lambda current, total: write_progress(
                bundle,
                phase="generating",
                progress=min(0.95, 0.35 + current / max(total, 1) * 0.6),
                message=f"Готово {current}/{total} записей генерации",
                current_count=current,
            ),
        )
    except RuntimeError as error:
        write_terminal_state(bundle, error)
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
            "loraPath": str(resolved_lora_path) if resolved_lora_path is not None else None,
        },
    )


async def _prepare_polygon_input(runtime_state, bundle, area_points: object):
    log_event(logger, 20, "ml_worker.generation.segment.begin", run_dir=bundle.run_dir, mode="polygon_mask")
    write_state(
        bundle,
        {
            "status": "running",
            "phase": "segmenting",
            "progress": 0.15,
            "message": "Строю маску области через segment_sam2_json.py.",
        },
    )
    return await prepare_polygon_segmented_input(
        runtime_state.settings,
        bundle.input_json_path,
        bundle.segmented_json_path,
        bundle.masks_dir,
        area_points,
        is_cancelled=lambda: is_cancelled(bundle),
        on_progress=lambda current, total: write_progress(
            bundle,
            phase="segmenting",
            progress=min(0.28, 0.15 + current / max(total, 1) * 0.13),
            message=f"Подготовил маски {current}/{total}",
            current_count=current,
        ),
    )


async def _prepare_prompt_input(runtime_state, bundle):
    log_event(logger, 20, "ml_worker.generation.segment.begin", run_dir=bundle.run_dir, mode="prompt_mask")
    write_state(
        bundle,
        {
            "status": "running",
            "phase": "segmenting",
            "progress": 0.15,
            "message": "Строю маску области по SAM prompt.",
        },
    )
    return await prepare_prompt_segmented_input(
        runtime_state.settings,
        bundle.input_json_path,
        bundle.segmented_json_path,
        bundle.masks_dir,
        is_cancelled=lambda: is_cancelled(bundle),
        on_progress=lambda current, total: write_progress(
            bundle,
            phase="segmenting",
            progress=min(0.28, 0.15 + current / max(total, 1) * 0.13),
            message=f"Подготовил prompt-маски {current}/{total}",
            current_count=current,
        ),
    )
