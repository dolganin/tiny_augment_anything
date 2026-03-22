import argparse
import sys
import torch
import utils
import json
from pathlib import Path

EVF_REPO = (Path(__file__).resolve().parent / "EVF-SAM").resolve()
sys.path.insert(0, str(EVF_REPO))

import numpy as np
from PIL import Image
from inference import beit3_preprocess, sam_preprocess
from model.evf_sam2 import EvfSam2Model
from transformers import AutoTokenizer


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
        "--version",
        default="YxZhang/evf-sam2-multitask",
    )
    p.add_argument(
        "--model-type",
        default="sam2",
        choices=["ori", "effi", "sam2"],
    )
    p.add_argument(
        "--precision",
        default="fp16",
        choices=["fp16", "bf16", "fp32"],
    )
    p.add_argument(
        "--device",
        default=None,
    )
    p.add_argument(
        "--semantic-default",
        action="store_true",
    )
    p.add_argument(
        "--save-all-masks",
        action="store_true",
    )
    p.add_argument(
        "--mask-dir",
        default=None,
    )
    p.add_argument(
        "--png-compress-level",
        type=int,
        default=3,
    )
    return p.parse_args()


class EVFSegmenter:
    def __init__(
        self,
        version,
        model_type,
        device,
        dtype
        ):
        self.version = version
        self.model_type = model_type
        self.device = device
        self.dtype = dtype
        self.beit3_preprocess = beit3_preprocess
        self.sam_preprocess = sam_preprocess

        self.tokenizer = AutoTokenizer.from_pretrained(
            self.version,
            padding_side="right",
            use_fast=False,
        )
        self.model = EvfSam2Model.from_pretrained(
            self.version,
            low_cpu_mem_usage=True,
            torch_dtype=self.dtype,
        ).eval()
        if hasattr(self.model.visual_model, "memory_encoder"):
            del self.model.visual_model.memory_encoder
        if hasattr(self.model.visual_model, "memory_attention"):
            del self.model.visual_model.memory_attention
        self.model = self.model.to(self.device)

    def _normalize_mask_array(self, pred_mask):

        if torch.is_tensor(pred_mask):
            arr = pred_mask.detach().float().cpu().numpy()
        else:
            arr = np.asarray(pred_mask)

        if arr.ndim == 2:
            arr = arr[None, ...]
        elif arr.ndim == 4:
            if arr.shape[0] == 1:
                arr = arr[0]
            elif arr.shape[1] == 1:
                arr = arr[:, 0]
            else:
                arr = arr.reshape(-1, arr.shape[-2], arr.shape[-1])

        return (arr > 0).astype(np.uint8) * 255

    def predict(self, image_np, prompt, semantic_type):

        original_size_list = [image_np.shape[:2]]
        prompt_to_use = prompt
        if semantic_type and not prompt_to_use.lstrip().startswith("[semantic]"):
            prompt_to_use = f"[semantic] {prompt_to_use}"

        image_beit = self.beit3_preprocess(image_np, 224).to(
            dtype=self.model.dtype,
            device=self.model.device,
        )
        image_sam, resize_shape = self.sam_preprocess(image_np, model_type=self.model_type)
        image_sam = image_sam.to(dtype=self.model.dtype, device=self.model.device)
        input_ids = self.tokenizer(prompt_to_use, return_tensors="pt")["input_ids"].to(
            device=self.model.device
        )

        with torch.inference_mode():
            pred_mask = self.model.inference(
                image_sam.unsqueeze(0),
                image_beit.unsqueeze(0),
                input_ids,
                resize_list=[resize_shape],
                original_size_list=original_size_list,
            )
        return self._normalize_mask_array(pred_mask)


def save_masks(
    mask_stack,
    out_dir,
    stem,
    save_all,
    compress_level
    ):
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

    segmenter = EVFSegmenter(
        version=args.version,
        model_type=args.model_type,
        device=device,
        dtype=dtype,
    )

    out_items = []
    for idx, record in enumerate(items):
        rec = dict(record)
        rec.setdefault("mask_path", None)
        rec.setdefault("mask_paths", [])

        image_field = rec.get("org_img")
        prompt = rec.get("seg_prompt")
        semantic_type = bool(rec.get("seg_semantic", args.semantic_default))

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

        image_np = np.array(Image.open(image_path).convert("RGB"))
        masks = segmenter.predict(image_np=image_np, prompt=str(prompt), semantic_type=semantic_type)
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
