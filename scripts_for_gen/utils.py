from __future__ import annotations

from pathlib import Path
import torch

def choose_device(user_device):
    if user_device:
        return user_device
    return "cuda" if torch.cuda.is_available() else "cpu"


def choose_dtype(device, precision):

    if not device.startswith("cuda"):
        return torch.float32
    if precision == "fp16":
        return torch.float16
    if precision == "bf16":
        return torch.bfloat16
    return torch.float32


def sanitize_stem(value):
    cleaned = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in value)
    cleaned = cleaned.strip("_")
    return cleaned or "item"


def resolve_path(raw_path, json_dir):
    p = Path(raw_path)
    if not p.is_absolute():
        p = (json_dir / p).resolve()
    return p
