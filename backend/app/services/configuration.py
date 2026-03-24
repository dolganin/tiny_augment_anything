from __future__ import annotations

from backend.app.config.settings import Settings


def generation_defaults(settings: Settings) -> dict:
    return {
        "sampleCount": 1,
        "fields": [
            {"key": "model_id", "label": "Model ID", "value": "Tongyi-MAI/Z-Image-Turbo", "type": "string"},
            {"key": "device", "label": "Устройство", "value": settings.executor_default_device, "type": "string"},
            {
                "key": "offload",
                "label": "Offload",
                "value": "model",
                "type": "enum",
                "options": ["none", "model", "sequential"],
            },
            {"key": "size", "label": "Размер", "value": "1024", "type": "number"},
            {"key": "strength", "label": "Сила модификации", "value": "0.6", "type": "number"},
            {"key": "inpaint_strength", "label": "Сила inpaint", "value": "1.0", "type": "number"},
            {"key": "num_inference_steps", "label": "Шаги инференса", "value": "9", "type": "number"},
            {"key": "guidance_scale", "label": "Guidance scale", "value": "0.0", "type": "number"},
            {"key": "sam_prompt", "label": "SAM prompt", "value": "", "type": "string"},
            {"key": "negative_prompt", "label": "Negative prompt", "value": "", "type": "string"},
            {"key": "lora_path", "label": "LoRA adapter", "value": "", "type": "string"},
            {"key": "precision", "label": "Precision", "value": "bf16", "type": "string"},
            {"key": "lora_scale", "label": "LoRA scale", "value": "1.0", "type": "number"},
        ],
    }


def generation_default_config(settings: Settings) -> dict[str, str]:
    payload = generation_defaults(settings)
    fields = payload["fields"] if isinstance(payload.get("fields"), list) else []
    return {
        str(field["key"]): str(field["value"])
        for field in fields
        if isinstance(field, dict) and "key" in field and "value" in field
    }
