import argparse
from pathlib import Path
import json 
from PIL import Image, ImageFilter
import torch
from diffusers import ZImageImg2ImgPipeline, ZImageInpaintPipeline
import utils

def parse_args():
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
    p.add_argument(
        "--lora-path",
        default=None,
    )
    p.add_argument(
        "--lora-scale",
        type=float,
        default=1.0,
    )
    p.add_argument(
        "--offload",
        default="none",
        choices=["none", "model", "sequential"],
    )
    p.add_argument(
        "--mode",
        default="inpaint",
        choices=["inpaint", "full"],
        help="Generation mode. 'full' forces img2img even if mask is present.",
    )
    return p.parse_args()


def load_rgb(path):
    return Image.open(path).convert("RGB")


def load_mask(path):
    return Image.open(path).convert("L")


def feather_mask(mask, dilate_size, blur_radius):
    out = mask.convert("L")
    if dilate_size and dilate_size > 1:
        if dilate_size % 2 == 0:
            dilate_size += 1
        out = out.filter(ImageFilter.MaxFilter(dilate_size))
    if blur_radius and blur_radius > 0:
        out = out.filter(ImageFilter.GaussianBlur(radius=blur_radius))
    return out


def resize_pair(image, mask, size):
    image_resized = image.resize((size, size), Image.LANCZOS)
    if mask is None:
        return image_resized, None
    mask_resized = mask.resize((size, size), Image.BILINEAR).convert("L")
    return image_resized, mask_resized


class ZImageGenerator:
    def __init__(self, model_id, device, dtype, lora_path, lora_scale, offload="none"):
        self.torch = torch
        self.device = device
        self.dtype = dtype
        self.model_id = model_id
        self.lora_path = lora_path
        self.lora_scale = lora_scale
        self.pipe = None
        self.pipe_kind = None
        self.offload = offload

    def _clear_pipe(self):
        if self.pipe is not None:
            try:
                self.pipe.to("cpu")
            except Exception:
                pass
            del self.pipe
            self.pipe = None
            self.pipe_kind = None
            if self.device.startswith("cuda"):
                self.torch.cuda.empty_cache()

    def _load_pipe(self, kind):
        if self.pipe is not None and self.pipe_kind == kind:
            return self.pipe

        self._clear_pipe()

        if kind == "inpaint":
            pipe = ZImageInpaintPipeline.from_pretrained(
                self.model_id,
                torch_dtype=self.dtype)
        else:
            pipe = ZImageImg2ImgPipeline.from_pretrained(
                self.model_id,
                torch_dtype=self.dtype)

        if hasattr(pipe, "enable_vae_slicing"):
            pipe.enable_vae_slicing()
        if hasattr(pipe, "enable_vae_tiling"):
            pipe.enable_vae_tiling()

        if self.lora_path:
            p = Path(self.lora_path)
            adapter_dir = str(p.parent)
            weight_name = p.name
            pipe.load_lora_weights(adapter_dir, weight_name=weight_name)
        
        if self.device.startswith("cuda"):
            if self.offload == "model":
                pipe.enable_model_cpu_offload()
            elif self.offload == "sequential":
                pipe.enable_sequential_cpu_offload()
            else:
                pipe.to(self.device)
        else:
            pipe.to(self.device)

        self.pipe = pipe
        self.pipe_kind = kind
        return pipe

    def _generator(self, seed):
        if self.device.startswith("cuda"):
            return self.torch.Generator(device=self.device).manual_seed(seed)
        return self.torch.Generator().manual_seed(seed)

    def generate_img2img(
        self,
        prompt,
        image,
        negative_prompt,
        strength,
        steps,
        guidance_scale,
        seed,
    ):
        pipe = self._load_pipe("img2img")
        return pipe(
            prompt=prompt,
            image=image,
            negative_prompt=negative_prompt,
            strength=strength,
            num_inference_steps=steps,
            guidance_scale=guidance_scale,
            generator=self._generator(seed),
            cross_attention_kwargs={"scale": self.lora_scale},
        ).images[0]

    def generate_inpaint(
        self,
        prompt,
        image,
        mask_image,
        negative_prompt,
        strength,
        steps,
        guidance_scale,
        seed,
    ):
        pipe = self._load_pipe("inpaint")
        return pipe(
            prompt=prompt,
            image=image,
            mask_image=mask_image,
            negative_prompt=negative_prompt,
            strength=strength,
            num_inference_steps=steps,
            guidance_scale=guidance_scale,
            generator=self._generator(seed),
            cross_attention_kwargs={"scale": self.lora_scale},
        ).images[0]


def main():
    args = parse_args()
    input_json = Path(args.input_json).resolve()
    output_json = Path(args.output_json).resolve()
    json_dir = input_json.parent
    output_dir = Path(args.output_dir).resolve() if args.output_dir else output_json.parent / "generated"
    output_dir.mkdir(parents=True, exist_ok=True)

    items = json.loads(input_json.read_text(encoding="utf-8"))
    device = utils.choose_device(args.device)
    dtype = utils.choose_dtype(device, args.precision)
    generator = ZImageGenerator(args.model_id, device=device, dtype=dtype, lora_path=args.lora_path, lora_scale=args.lora_scale, offload = args.offload)

    out_items = []
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

        mask_candidates = []
        if isinstance(rec.get("mask_paths"), list) and rec["mask_paths"]:
            raw_list = rec["mask_paths"] if args.use_all_masks else rec["mask_paths"][:1]
            mask_candidates = [utils.resolve_path(str(x), json_dir) for x in raw_list]
        elif rec.get("mask_path"):
            mask_candidates = [utils.resolve_path(str(rec["mask_path"]), json_dir)]

        image = load_rgb(image_path)
        seed = int(rec.get("seed", args.seed))
        steps = int(rec.get("num_inference_steps", args.default_steps))
        guidance_scale = float(rec.get("guidance_scale", args.default_guidance_scale))
        stem = utils.sanitize_stem(str(rec.get("id", idx)))
        results = []

        use_inpaint = bool(mask_candidates) and args.mode != "full"

        if use_inpaint:
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

        out_items.append(rec)

    output_json.write_text(json.dumps(out_items, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Saved generation json to: {output_json}")


if __name__ == "__main__":
    main()
