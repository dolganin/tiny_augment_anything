import argparse
import json
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageDraw
from transformers import Sam2Model, Sam2Processor

import utils


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--input-json", required=True)
    p.add_argument("--output-json", required=True)
    p.add_argument("--model-id", default="facebook/sam2.1-hiera-small")
    p.add_argument("--precision", default="fp16", choices=["fp16", "bf16", "fp32"])
    p.add_argument("--device", default=None)
    p.add_argument("--save-all-masks", action="store_true")
    p.add_argument("--multimask-output", action="store_true")
    p.add_argument("--mask-dir", default=None)
    p.add_argument("--png-compress-level", type=int, default=3)
    return p.parse_args()


class Sam2Segmenter:
    def __init__(self, model_id, device, dtype):
        self.model = Sam2Model.from_pretrained(model_id).to(device)
        self.processor = Sam2Processor.from_pretrained(model_id)
        self.device = device
        self.dtype = dtype

    def predict(self, image, points=None, labels=None, box=None, multimask_output=False):
        kwargs = {"images": image, "return_tensors": "pt"}
        if points:
            kwargs["input_points"] = [[points]]
            kwargs["input_labels"] = [[[int(x) for x in labels]]] if labels else [[[1 for _ in points]]]
        if box:
            kwargs["input_boxes"] = [[box]]
        inputs = self.processor(**kwargs).to(self.device)
        with torch.inference_mode():
            outputs = self.model(**inputs, multimask_output=multimask_output)
        masks = self.processor.post_process_masks(outputs.pred_masks.cpu(), inputs["original_sizes"])[0]
        if torch.is_tensor(masks):
            arr = masks.detach().cpu().numpy()
        else:
            arr = np.asarray(masks)
        if arr.ndim == 4:
            if arr.shape[0] == 1:
                arr = arr[0]
            elif arr.shape[1] == 1:
                arr = arr[:, 0]
            else:
                arr = arr.reshape(-1, arr.shape[-2], arr.shape[-1])
        if arr.ndim == 2:
            arr = arr[None, ...]
        return (arr > 0).astype(np.uint8) * 255


def load_rgb(path):
    return Image.open(path).convert("RGB")


def polygon_mask(size, points):
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).polygon([tuple(p) for p in points], fill=255)
    return np.array(mask, dtype=np.uint8)[None, ...]


def box_mask(size, box):
    x1, y1, x2, y2 = [int(v) for v in box]
    mask = np.zeros((size[1], size[0]), dtype=np.uint8)
    mask[y1:y2, x1:x2] = 255
    return mask[None, ...]


def save_masks(mask_stack, out_dir, stem, save_all, compress_level):
    out_dir.mkdir(parents=True, exist_ok=True)
    count = mask_stack.shape[0] if save_all else min(mask_stack.shape[0], 1)
    saved = []
    for i in range(count):
        path = out_dir / f"{stem}__mask_{i:02d}.png"
        Image.fromarray(mask_stack[i], mode="L").save(path, compress_level=compress_level)
        saved.append(str(path.resolve()))
    return saved


def main():
    args = parse_args()
    input_json = Path(args.input_json).resolve()
    output_json = Path(args.output_json).resolve()
    json_dir = input_json.parent
    mask_dir = Path(args.mask_dir).resolve() if args.mask_dir else output_json.parent / "masks"

    items = json.loads(input_json.read_text(encoding="utf-8"))
    device = utils.choose_device(args.device)
    dtype = utils.choose_dtype(device, args.precision)
    segmenter = Sam2Segmenter(args.model_id, device, dtype)

    out_items = []
    for idx, record in enumerate(items):
        rec = dict(record)
        rec.setdefault("mask_path", None)
        rec.setdefault("mask_paths", [])

        image_field = rec.get("org_img")
        if not image_field:
            out_items.append(rec)
            continue

        image_path = utils.resolve_path(str(image_field), json_dir)
        if not image_path.exists():
            out_items.append(rec)
            continue

        image = load_rgb(image_path)
        masks = None

        area_points = rec.get("area_points")
        area_box = rec.get("area_box")
        sam_points = rec.get("sam_points")
        sam_labels = rec.get("sam_labels")
        sam_box = rec.get("sam_box")
        multimask_output = bool(rec.get("sam_multimask", args.multimask_output))

        if area_points:
            masks = polygon_mask(image.size, area_points)
        elif area_box:
            masks = box_mask(image.size, area_box)
        elif sam_points or sam_box:
            masks = segmenter.predict(
                image=image,
                points=sam_points,
                labels=sam_labels,
                box=sam_box,
                multimask_output=multimask_output,
            )

        if masks is None:
            out_items.append(rec)
            continue

        stem = utils.sanitize_stem(str(rec.get("id", idx)))
        saved = save_masks(
            masks,
            out_dir=mask_dir,
            stem=stem,
            save_all=args.save_all_masks,
            compress_level=args.png_compress_level,
        )
        rec["mask_paths"] = saved
        rec["mask_path"] = saved[0] if saved else None
        out_items.append(rec)

    output_json.write_text(json.dumps(out_items, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Saved segmentation JSON to: {output_json}")


if __name__ == "__main__":
    main()
