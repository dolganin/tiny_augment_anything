from __future__ import annotations


def generation_defaults() -> dict:
    return {
        "sampleCount": 1,
        "fields": [
            {"key": "guidance_scale", "label": "Guidance scale", "value": "7.5", "type": "number"},
            {"key": "num_inference_steps", "label": "Inference steps", "value": "30", "type": "number"},
            {"key": "negative_prompt", "label": "Negative prompt", "value": "", "type": "string"},
            {"key": "seed", "label": "Seed", "value": "42", "type": "number"},
        ],
    }
