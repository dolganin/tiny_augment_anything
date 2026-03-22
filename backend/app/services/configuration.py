from __future__ import annotations


def generation_defaults() -> dict:
    return {
        "sampleCount": 1,
        "fields": [
            {"key": "model_id", "label": "Model ID", "value": "Tongyi-MAI/Z-Image-Turbo", "type": "string"},
            {"key": "size", "label": "Размер", "value": "1024", "type": "number"},
            {"key": "strength", "label": "Сила модификации", "value": "0.6", "type": "number"},
            {"key": "inpaint_strength", "label": "Сила inpaint", "value": "1.0", "type": "number"},
            {"key": "num_inference_steps", "label": "Шаги инференса", "value": "9", "type": "number"},
            {"key": "guidance_scale", "label": "Guidance scale", "value": "0.0", "type": "number"},
            {"key": "negative_prompt", "label": "Negative prompt", "value": "", "type": "string"},
            {"key": "seed", "label": "Seed", "value": "42", "type": "number"},
            {"key": "lora_scale", "label": "LoRA scale", "value": "1.0", "type": "number"},
        ],
    }
