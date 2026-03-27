from __future__ import annotations


def as_float(value: object, default: float) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str) and value:
        return float(value)
    return float(default)


def as_bool(value: object) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return False


def as_offload(value: object) -> str:
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"none", "model", "sequential"}:
            return normalized
    return "none"
