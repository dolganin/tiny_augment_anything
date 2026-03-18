# EVF-SAM2 + Z-Image JSON pipeline

Two scripts are included:

- `segment_evf_sam2_json.py` — reads a JSON file with records like `id, org_img, seg_prompt, gen_prompt`, runs EVF-SAM2 segmentation, and writes a new JSON with `mask_path` and `mask_paths`.
- `generate_zimage_json.py` — reads a JSON file, uses `mask_path` / `mask_paths` for inpainting if present, otherwise falls back to plain Z-Image img2img, and writes a new JSON with `result_path` and `result_paths`.

The output JSON from the segmentation script is directly accepted by the generation script.

## Expected input JSON

A list of objects or an object with an `items` list. Minimal fields:

- `id`
- `org_img`
- `seg_prompt`
- `gen_prompt`

Optional per-record fields:

- `seg_semantic` (bool)
- `negative_prompt`
- `seed`
- `num_inference_steps`
- `guidance_scale`
- `inpaint_strength`
- `strength`

## Install

1. Clone EVF-SAM somewhere:

```bash
git clone https://github.com/hustvl/EVF-SAM.git
```

2. Install PyTorch for your platform/CUDA from the official selector.
3. Install Python dependencies:

```bash
pip install -r requirements.inference.txt
```

## Segmentation

```bash
python segment_evf_sam2_json.py \
  --input-json example_input.json \
  --output-json segmented.json \
  --evf-repo /path/to/EVF-SAM \
  --version YxZhang/evf-sam2-multitask \
  --model-type sam2 \
  --semantic-default \
  --save-all-masks
```

This writes `mask_path` and `mask_paths` into each record.

## Generation

```bash
python generate_zimage_json.py \
  --input-json segmented.json \
  --output-json generated.json \
  --use-all-masks \
  --size 1024
```

If `mask_paths` / `mask_path` exist, generation uses Z-Image inpainting. If no masks are present, it uses Z-Image img2img.
