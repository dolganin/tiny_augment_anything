from __future__ import annotations

import gc
import importlib.util
import json
import sys
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

from backend.app.config.settings import Settings
from backend.app.services.diffusion_runtime import WarmedDiffusionRuntime, load_segment_module


async def prepare_polygon_segmented_input(
    settings: Settings,
    input_json_path: Path,
    output_json_path: Path,
    mask_dir: Path,
    area_points: Any,
    *,
    is_cancelled: Callable[[], Awaitable[bool]],
    on_progress: Callable[[int, int], Awaitable[None]],
) -> Path:
    records = _load_json_list(input_json_path)
    if not records:
        raise RuntimeError("Не найден input.json для построения маски.")

    normalized_points = _normalize_area_points(area_points)
    if len(normalized_points) < 3:
        raise RuntimeError("Для области нужно минимум три точки.")

    segment_module = load_segment_module(settings)
    prepared: list[dict[str, Any]] = []

    for index, record in enumerate(records):
        if await is_cancelled():
            raise RuntimeError("cancelled")

        rec = dict(record)
        org_img = rec.get("org_img")
        if not isinstance(org_img, str) or not org_img:
            prepared.append(rec)
            continue

        image_path = segment_module.utils.resolve_path(org_img, input_json_path.parent)
        if not image_path.exists():
            prepared.append(rec)
            continue

        with segment_module.load_rgb(image_path) as image:
            mask_stack = segment_module.polygon_mask(image.size, normalized_points)

        stem = segment_module.utils.sanitize_stem(str(rec.get("id", index)))
        saved_masks = segment_module.save_masks(
            mask_stack,
            out_dir=mask_dir,
            stem=stem,
            save_all=False,
            compress_level=3,
        )
        rec["mask_path"] = saved_masks[0] if saved_masks else None
        rec["mask_paths"] = saved_masks
        prepared.append(rec)
        await on_progress(index + 1, len(records))

    output_json_path.write_text(
        json.dumps(prepared, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return output_json_path


async def prepare_prompt_segmented_input(
    settings: Settings,
    input_json_path: Path,
    output_json_path: Path,
    mask_dir: Path,
    *,
    is_cancelled: Callable[[], Awaitable[bool]],
    on_progress: Callable[[int, int], Awaitable[None]],
) -> Path:
    records = _load_json_list(input_json_path)
    if not records:
        raise RuntimeError("Не найден input.json для построения маски.")

    segment_module = _load_evf_segment_module(settings)
    device = segment_module.utils.choose_device(None)
    dtype = segment_module.utils.choose_dtype(device, "fp16")
    segmenter = segment_module.EVFSegmenter(
        version="YxZhang/evf-sam2-multitask",
        model_type="sam2",
        device=device,
        dtype=dtype,
    )
    prepared: list[dict[str, Any]] = []
    try:
        for index, record in enumerate(records):
            if await is_cancelled():
                raise RuntimeError("cancelled")

            rec = dict(record)
            org_img = rec.get("org_img")
            seg_prompt = rec.get("seg_prompt")
            if not isinstance(org_img, str) or not org_img or not isinstance(seg_prompt, str) or not seg_prompt.strip():
                prepared.append(rec)
                await on_progress(index + 1, len(records))
                continue

            image_path = segment_module.utils.resolve_path(org_img, input_json_path.parent)
            if not image_path.exists():
                prepared.append(rec)
                await on_progress(index + 1, len(records))
                continue

            with segment_module.Image.open(image_path) as raw_image:
                image_np = segment_module.np.array(raw_image.convert("RGB"))
            masks = segmenter.predict(
                image_np=image_np,
                prompt=seg_prompt.strip(),
                semantic_type=bool(rec.get("seg_semantic")),
            )
            stem = segment_module.utils.sanitize_stem(str(rec.get("id", index)))
            saved_masks = segment_module.save_masks(
                masks,
                out_dir=mask_dir,
                stem=stem,
                save_all=False,
                compress_level=3,
            )
            rec["mask_path"] = saved_masks[0] if saved_masks else None
            rec["mask_paths"] = saved_masks
            prepared.append(rec)
            await on_progress(index + 1, len(records))
    finally:
        _cleanup_prompt_segmenter(segmenter)

    output_json_path.write_text(
        json.dumps(prepared, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return output_json_path


async def generate_results(
    warmed: WarmedDiffusionRuntime,
    config: dict[str, Any],
    input_json_path: Path,
    output_json_path: Path,
    output_dir: Path,
    *,
    is_cancelled: Callable[[], Awaitable[bool]],
    on_progress: Callable[[int, int], Awaitable[None]],
) -> int:
    items = _load_json_list(input_json_path)
    output_dir.mkdir(parents=True, exist_ok=True)

    args_size = _as_int(config.get("size"), 1024)
    args_default_strength = _as_float(config.get("strength"), 0.6)
    args_default_inpaint_strength = _as_float(config.get("inpaint_strength"), 1.0)
    args_default_steps = _as_int(config.get("num_inference_steps"), 9)
    args_default_guidance_scale = _as_float(config.get("guidance_scale"), 0.0)
    args_seed = _as_int(config.get("seed"), 42)
    args_mask_dilate = _as_int(config.get("mask_dilate"), 7)
    args_mask_blur = _as_float(config.get("mask_blur"), 6.0)
    args_use_all_masks = _as_bool(config.get("use_all_masks"))

    out_items: list[dict[str, Any]] = []
    generated_count = 0
    total_items = len(items)

    for index, record in enumerate(items):
        if await is_cancelled():
            raise RuntimeError("cancelled")

        rec = dict(record)
        rec.setdefault("result_path", None)
        rec.setdefault("result_paths", [])

        image_field = rec.get("org_img")
        prompt = rec.get("gen_prompt")
        negative_prompt = rec.get("negative_prompt")
        if not image_field or not prompt:
            out_items.append(rec)
            await on_progress(index + 1, total_items)
            continue

        image_path = warmed.module.utils.resolve_path(str(image_field), input_json_path.parent)
        if not image_path.exists():
            out_items.append(rec)
            await on_progress(index + 1, total_items)
            continue

        mask_candidates: list[Path] = []
        if isinstance(rec.get("mask_paths"), list) and rec["mask_paths"]:
            raw_list = rec["mask_paths"] if args_use_all_masks else rec["mask_paths"][:1]
            mask_candidates = [
                warmed.module.utils.resolve_path(str(item), input_json_path.parent)
                for item in raw_list
            ]
        elif rec.get("mask_path"):
            mask_candidates = [
                warmed.module.utils.resolve_path(str(rec["mask_path"]), input_json_path.parent)
            ]

        seed = _as_int(rec.get("seed"), args_seed)
        steps = _as_int(rec.get("num_inference_steps"), args_default_steps)
        guidance_scale = _as_float(rec.get("guidance_scale"), args_default_guidance_scale)
        stem = warmed.module.utils.sanitize_stem(str(rec.get("id", index)))
        results: list[str] = []

        with warmed.module.load_rgb(image_path) as image:
            if mask_candidates:
                for mask_index, mask_path in enumerate(mask_candidates):
                    if not mask_path.exists():
                        continue
                    with warmed.module.load_mask(mask_path) as raw_mask:
                        mask = warmed.module.feather_mask(
                            raw_mask,
                            args_mask_dilate,
                            args_mask_blur,
                        )
                    z_image, z_mask = warmed.module.resize_pair(image, mask, args_size)
                    out_img = warmed.generator.generate_inpaint(
                        prompt=str(prompt),
                        image=z_image,
                        mask_image=z_mask,
                        negative_prompt=str(negative_prompt) if negative_prompt else None,
                        strength=_as_float(
                            rec.get("inpaint_strength"),
                            _as_float(rec.get("strength"), args_default_inpaint_strength),
                        ),
                        steps=steps,
                        guidance_scale=guidance_scale,
                        seed=seed + mask_index,
                    )
                    out_path = output_dir / f"{stem}__gen_mask_{mask_index:02d}.png"
                    out_img.save(out_path)
                    results.append(str(out_path.resolve()))
            else:
                z_image, _ = warmed.module.resize_pair(image, None, args_size)
                out_img = warmed.generator.generate_img2img(
                    prompt=str(prompt),
                    image=z_image,
                    negative_prompt=str(negative_prompt) if negative_prompt else None,
                    strength=_as_float(rec.get("strength"), args_default_strength),
                    steps=steps,
                    guidance_scale=guidance_scale,
                    seed=seed,
                )
                out_path = output_dir / f"{stem}__gen_nomask.png"
                out_img.save(out_path)
                results.append(str(out_path.resolve()))

        generated_count += len(results)
        rec["result_paths"] = results
        rec["result_path"] = results[0] if results else None
        out_items.append(rec)
        await on_progress(index + 1, total_items)

    output_json_path.write_text(
        json.dumps(out_items, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return generated_count


def _load_json_list(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        return []
    return [item for item in payload if isinstance(item, dict)]


def _normalize_area_points(area_points: Any) -> list[tuple[int, int]]:
    if not isinstance(area_points, list):
        return []
    points: list[tuple[int, int]] = []
    for point in area_points:
        if not isinstance(point, list) or len(point) != 2:
            continue
        x, y = point
        if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
            continue
        points.append((int(round(x)), int(round(y))))
    return points


def _as_int(value: object, default: int) -> int:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str) and value:
        return int(float(value))
    return default


def _as_float(value: object, default: float) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str) and value:
        return float(value)
    return default


def _as_bool(value: object) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return False


def _load_evf_segment_module(settings: Settings):
    script_path = (settings.executor_segment_script_path.parent / "segment_evf_sam2_json.py").resolve()
    evf_repo_path = script_path.parent / "EVF-SAM"
    if not script_path.exists():
        raise RuntimeError(f"Не найден script для SAM prompt: {script_path}")
    if not evf_repo_path.exists():
        raise RuntimeError(
            "SAM prompt недоступен: рядом со скриптами нет директории scripts_for_gen/EVF-SAM. "
            "Сейчас доступна только сегментация полигоном."
        )
    module_name = f"segment_evf_sam2_json_{abs(hash(script_path))}"
    cached = sys.modules.get(module_name)
    if cached is not None:
        return cached
    spec = importlib.util.spec_from_file_location(module_name, script_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Не удалось загрузить модуль сегментации из {script_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


def _cleanup_prompt_segmenter(segmenter: object) -> None:
    model = getattr(segmenter, "model", None)
    if model is not None:
        try:
            model.to("cpu")
        except Exception:
            pass
    for attr in ("model", "tokenizer", "beit3_preprocess", "sam_preprocess"):
        if hasattr(segmenter, attr):
            try:
                delattr(segmenter, attr)
            except Exception:
                pass
    torch_module = sys.modules.get("torch")
    if torch_module is not None:
        try:
            torch_module.cuda.empty_cache()
        except Exception:
            pass
        try:
            torch_module.cuda.ipc_collect()
        except Exception:
            pass
    gc.collect()
