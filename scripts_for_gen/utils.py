from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Tuple


def load_json_container(path: Path) -> Tuple[Dict[str, Any] | None, List[Dict[str, Any]]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, list):
        return None, data
    if isinstance(data, dict):
        if isinstance(data.get("items"), list):
            meta = {k: v for k, v in data.items() if k != "items"}
            return meta, data["items"]


def save_json_container(path: Path, meta: Dict[str, Any] | None, items: List[Dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload: Any = items if meta is None else {**meta, "items": items}
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def choose_device(user_device: str | None) -> str:
    if user_device:
        return user_device
    import torch

    return "cuda" if torch.cuda.is_available() else "cpu"


def choose_dtype(device: str, precision: str):
    import torch

    if not device.startswith("cuda"):
        return torch.float32
    if precision == "fp16":
        return torch.float16
    if precision == "bf16":
        return torch.bfloat16
    return torch.float32


def sanitize_stem(value: str) -> str:
    cleaned = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in value)
    cleaned = cleaned.strip("_")
    return cleaned or "item"


def resolve_path(raw_path: str, json_dir: Path) -> Path:
    p = Path(raw_path)
    if not p.is_absolute():
        p = (json_dir / p).resolve()
    return p
