from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

from backend.app.config.settings import Settings
from backend.app.services.diffusion_runtime import load_segment_module
from backend.app.services.zimage_segmenter import cleanup_prompt_segmenter, load_evf_segment_module


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
    records = load_json_list(input_json_path)
    if not records:
        raise RuntimeError("Не найден input.json для построения маски.")

    normalized_points = normalize_area_points(area_points)
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
    records = load_json_list(input_json_path)
    if not records:
        raise RuntimeError("Не найден input.json для построения маски.")

    segment_module = load_evf_segment_module(settings)
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
        cleanup_prompt_segmenter(segmenter)

    output_json_path.write_text(
        json.dumps(prepared, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return output_json_path


def load_json_list(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        return []
    return [item for item in payload if isinstance(item, dict)]


def normalize_area_points(area_points: Any) -> list[tuple[int, int]]:
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
