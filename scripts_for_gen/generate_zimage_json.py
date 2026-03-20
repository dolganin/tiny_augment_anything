from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any, Dict, List

from PIL import Image, ImageFilter

import utils


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument(
        "--input-json",
        required=True
    )
    p.add_argument(
        "--output-json",
        required=True
    )
    p.add_argument(
        "--model-id",
        default="Tongyi-MAI/Z-Image-Turbo",
    )
    p.add_argument(
        "--device",
        default=None,
    )
    p.add_argument(
        "--precision",
        default="bf16",
        choices=["fp16", "bf16", "fp32"],
    )
    p.add_argument(
        "--output-dir",
        default=None,
    )
    p.add_argument(
        "--size",
        type=int,
        default=1024,
    )
    p.add_argument(
        "--default-strength",
        type=float,
        default=0.6,
    )
    p.add_argument(
        "--default-inpaint-strength",
        type=float,
        default=1.0,
    )
    p.add_argument(
        "--default-steps",
        type=int,
        default=9,
    )
    p.add_argument(
        "--default-guidance-scale",
        type=float,
        default=0.0,
    )
    p.add_argument(
        "--use-all-masks",
        action="store_true",
    )
    p.add_argument(
        "--mask-dilate",
        type=int,
        default=7,
    )
    p.add_argument(
        "--mask-blur",
        type=float,
        default=6.0,
    )
    p.add_argument(
        "--seed",
        type=int,
        default=42,
    )
    return p.parse_args()


def load_rgb(path: Path) -> Image.Image:
    return Image.open(path).convert("RGB")


def load_mask(path: Path) -> Image.Image:
    return Image.open(path).convert("L")


def feather_mask(mask: Image.Image, dilate_size: int, blur_radius: float) -> Image.Image:
    out = mask.convert("L")
    if dilate_size and dilate_size > 1:
        if dilate_size % 2 == 0:
            dilate_size += 1
        out = out.filter(ImageFilter.MaxFilter(dilate_size))
    if blur_radius and blur_radius > 0:
        out = out.filter(ImageFilter.GaussianBlur(radius=blur_radius))
    return out


def resize_pair(image: Image.Image, mask: Image.Image | None, size: int):
    image_resized = image.resize((size, size), Image.LANCZOS)
    if mask is None:
        return image_resized, None
    mask_resized = mask.resize((size, size), Image.BILINEAR).convert("L")
    return image_resized, mask_resized


class ZImageGenerator:
    def __init__(self, model_id: str, device: str, dtype) -> None:
        import torch
        from diffusers import ZImageImg2ImgPipeline, ZImageInpaintPipeline

        self.torch = torch
        self.device = device
        self.img2img = ZImageImg2ImgPipeline.from_pretrained(model_id, torch_dtype=dtype).to(device)
        self.inpaint = ZImageInpaintPipeline.from_pretrained(model_id, torch_dtype=dtype).to(device)

    def _generator(self, seed: int):
        if self.device.startswith("cuda"):
            return self.torch.Generator(device=self.device).manual_seed(seed)
        return self.torch.Generator().manual_seed(seed)

    def generate_img2img(
        self,
        prompt: str,
        image: Image.Image,
        negative_prompt: str | None,
        strength: float,
        steps: int,
        guidance_scale: float,
        seed: int,
    ) -> Image.Image:
        return self.img2img(
            prompt=prompt,
            image=image,
            negative_prompt=negative_prompt,
            strength=strength,
            num_inference_steps=steps,
            guidance_scale=guidance_scale,
            generator=self._generator(seed),
        ).images[0]

    def generate_inpaint(
        self,
        prompt: str,
        image: Image.Image,
        mask_image: Image.Image,
        negative_prompt: str | None,
        strength: float,
        steps: int,
        guidance_scale: float,
        seed: int,
    ) -> Image.Image:
        return self.inpaint(
            prompt=prompt,
            image=image,
            mask_image=mask_image,
            negative_prompt=negative_prompt,
            strength=strength,
            num_inference_steps=steps,
            guidance_scale=guidance_scale,
            generator=self._generator(seed),
        ).images[0]


def main() -> None:
    args = parse_args()
    input_json = Path(args.input_json).resolve()
    output_json = Path(args.output_json).resolve()
    json_dir = input_json.parent
    output_dir = Path(args.output_dir).resolve() if args.output_dir else output_json.parent / "generated"
    output_dir.mkdir(parents=True, exist_ok=True)

    meta, items = utils.load_json_container(input_json)
    device = utils.choose_device(args.device)
    dtype = utils.choose_dtype(device, args.precision)
    generator = ZImageGenerator(args.model_id, device=device, dtype=dtype)

    out_items: List[Dict[str, Any]] = []
    for idx, record in enumerate(items):
        rec = dict(record)
        rec.setdefault("result_path", None)
        rec.setdefault("result_paths", [])

        image_field = rec.get("org_img")
        prompt = rec.get("gen_prompt")
        negative_prompt = rec.get("negative_prompt")
        if not image_field:
            out_items.append(rec)
            continue
        if not prompt:
            out_items.append(rec)
            continue

        image_path = utils.resolve_path(str(image_field), json_dir)
        if not image_path.exists():
            out_items.append(rec)
            continue

        mask_candidates: List[Path] = []
        if isinstance(rec.get("mask_paths"), list) and rec["mask_paths"]:
            raw_list = rec["mask_paths"] if args.use_all_masks else rec["mask_paths"][:1]
            mask_candidates = [utils.resolve_path(str(x), json_dir) for x in raw_list]
        elif rec.get("mask_path"):
            mask_candidates = [utils.resolve_path(str(rec["mask_path"]), json_dir)]

        try:
            image = load_rgb(image_path)
            seed = int(rec.get("seed", args.seed))
            steps = int(rec.get("num_inference_steps", args.default_steps))
            guidance_scale = float(rec.get("guidance_scale", args.default_guidance_scale))
            stem = utils.sanitize_stem(str(rec.get("id", idx)))
            results: List[str] = []

            if mask_candidates:
                for m_idx, mask_path in enumerate(mask_candidates):
                    if not mask_path.exists():
                        continue
                    mask = feather_mask(load_mask(mask_path), args.mask_dilate, args.mask_blur)
                    z_image, z_mask = resize_pair(image, mask, args.size)
                    out_img = generator.generate_inpaint(
                        prompt=str(prompt),
                        image=z_image,
                        mask_image=z_mask,
                        negative_prompt=str(negative_prompt) if negative_prompt else None,
                        strength=float(rec.get("inpaint_strength", rec.get("strength", args.default_inpaint_strength))),
                        steps=steps,
                        guidance_scale=guidance_scale,
                        seed=seed + m_idx,
                    )
                    out_path = output_dir / f"{stem}__gen_mask_{m_idx:02d}.png"
                    out_img.save(out_path)
                    results.append(str(out_path.resolve()))
            else:
                z_image, _ = resize_pair(image, None, args.size)
                out_img = generator.generate_img2img(
                    prompt=str(prompt),
                    image=z_image,
                    negative_prompt=str(negative_prompt) if negative_prompt else None,
                    strength=float(rec.get("strength", args.default_strength)),
                    steps=steps,
                    guidance_scale=guidance_scale,
                    seed=seed,
                )
                out_path = output_dir / f"{stem}__gen_nomask.png"
                out_img.save(out_path)
                results.append(str(out_path.resolve()))

            rec["result_paths"] = results
            rec["result_path"] = results[0] if results else None
        except Exception:
            pass

        out_items.append(rec)

    if meta is None:
        meta_out = {
            "generated_by": "generate_zimage_json.py",
            "input_json": str(input_json),
            "generation_model": args.model_id,
            "device": device,
        }
    else:
        meta_out = dict(meta)
        meta_out.update(
            {
                "generated_by": "generate_zimage_json.py",
                "input_json": str(input_json),
                "generation_model": args.model_id,
                "device": device,
            }
        )
    utils.save_json_container(output_json, meta_out, out_items)
    print(f"Saved generation JSON to: {output_json}")


if __name__ == "__main__":
    main()
