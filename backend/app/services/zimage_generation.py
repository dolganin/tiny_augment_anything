from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

from backend.app.services.diffusion_runtime import WarmedDiffusionRuntime


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
    items = load_json_list(input_json_path)
    output_dir.mkdir(parents=True, exist_ok=True)

    args_size = as_int(config.get("size"), 1024)
    args_default_strength = as_float(config.get("strength"), 0.6)
    args_default_inpaint_strength = as_float(config.get("inpaint_strength"), 1.0)
    args_default_steps = as_int(config.get("num_inference_steps"), 9)
    args_default_guidance_scale = as_float(config.get("guidance_scale"), 0.0)
    args_seed = as_int(config.get("seed"), 42)
    args_mask_dilate = as_int(config.get("mask_dilate"), 7)
    args_mask_blur = as_float(config.get("mask_blur"), 6.0)
    args_use_all_masks = as_bool(config.get("use_all_masks"))

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

        mask_candidates = _resolve_mask_candidates(warmed, rec, input_json_path.parent, args_use_all_masks)
        seed = as_int(rec.get("seed"), args_seed)
        steps = as_int(rec.get("num_inference_steps"), args_default_steps)
        guidance_scale = as_float(rec.get("guidance_scale"), args_default_guidance_scale)
        stem = warmed.module.utils.sanitize_stem(str(rec.get("id", index)))
        results: list[str] = []

        with warmed.module.load_rgb(image_path) as image:
            if mask_candidates:
                results = _generate_masked_results(
                    warmed,
                    image,
                    mask_candidates,
                    rec,
                    prompt,
                    negative_prompt,
                    output_dir,
                    stem,
                    seed,
                    steps,
                    guidance_scale,
                    args_size,
                    args_mask_dilate,
                    args_mask_blur,
                    args_default_inpaint_strength,
                )
            else:
                z_image, _ = warmed.module.resize_pair(image, None, args_size)
                out_img = warmed.generator.generate_img2img(
                    prompt=str(prompt),
                    image=z_image,
                    negative_prompt=str(negative_prompt) if negative_prompt else None,
                    strength=as_float(rec.get("strength"), args_default_strength),
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


def load_json_list(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        return []
    return [item for item in payload if isinstance(item, dict)]


def as_int(value: object, default: int) -> int:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str) and value:
        return int(float(value))
    return default


def as_float(value: object, default: float) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str) and value:
        return float(value)
    return default


def as_bool(value: object) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return False


def _resolve_mask_candidates(warmed, rec: dict[str, Any], base_dir: Path, use_all_masks: bool) -> list[Path]:
    if isinstance(rec.get("mask_paths"), list) and rec["mask_paths"]:
        raw_list = rec["mask_paths"] if use_all_masks else rec["mask_paths"][:1]
        return [warmed.module.utils.resolve_path(str(item), base_dir) for item in raw_list]
    if rec.get("mask_path"):
        return [warmed.module.utils.resolve_path(str(rec["mask_path"]), base_dir)]
    return []


def _generate_masked_results(
    warmed,
    image,
    mask_candidates: list[Path],
    rec: dict[str, Any],
    prompt: object,
    negative_prompt: object,
    output_dir: Path,
    stem: str,
    seed: int,
    steps: int,
    guidance_scale: float,
    args_size: int,
    args_mask_dilate: int,
    args_mask_blur: float,
    args_default_inpaint_strength: float,
) -> list[str]:
    results: list[str] = []
    for mask_index, mask_path in enumerate(mask_candidates):
        if not mask_path.exists():
            continue
        with warmed.module.load_mask(mask_path) as raw_mask:
            mask = warmed.module.feather_mask(raw_mask, args_mask_dilate, args_mask_blur)
        z_image, z_mask = warmed.module.resize_pair(image, mask, args_size)
        out_img = warmed.generator.generate_inpaint(
            prompt=str(prompt),
            image=z_image,
            mask_image=z_mask,
            negative_prompt=str(negative_prompt) if negative_prompt else None,
            strength=as_float(
                rec.get("inpaint_strength"),
                as_float(rec.get("strength"), args_default_inpaint_strength),
            ),
            steps=steps,
            guidance_scale=guidance_scale,
            seed=seed + mask_index,
        )
        out_path = output_dir / f"{stem}__gen_mask_{mask_index:02d}.png"
        out_img.save(out_path)
        results.append(str(out_path.resolve()))
    return results
