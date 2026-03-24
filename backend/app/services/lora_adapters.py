from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

from backend.app.runtime.errors import AppError
from backend.app.services.filesystem import RuntimePaths, dataset_lora_dir, make_relative_path
from backend.app.services.upload_models import LoraAdapterInfo


def list_lora_adapters(runtime_paths: RuntimePaths, runtime_root: Path, dataset_id: UUID) -> list[LoraAdapterInfo]:
    target_dir = dataset_lora_dir(runtime_paths, dataset_id)
    if not target_dir.exists():
        return []

    items: list[LoraAdapterInfo] = []
    for candidate in sorted(target_dir.iterdir(), key=lambda item: item.stat().st_mtime, reverse=True):
        if not candidate.is_file() or candidate.suffix == ".json":
            continue
        stat = candidate.stat()
        display_name = _read_display_name(candidate)
        items.append(
            LoraAdapterInfo(
                display_name=display_name,
                file_name=_original_name(candidate.name),
                adapter_path=make_relative_path(runtime_root, candidate),
                size_bytes=stat.st_size,
                updated_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
            )
        )
    return items


def resolve_lora_adapter_path(runtime_root: Path, raw_path: object) -> Path | None:
    if not isinstance(raw_path, str):
        return None
    normalized = raw_path.strip()
    if not normalized:
        return None
    candidate = (runtime_root / normalized).resolve()
    runtime_root_resolved = runtime_root.resolve()
    if runtime_root_resolved not in candidate.parents and candidate != runtime_root_resolved:
        raise AppError(400, "LoRA adapter path должен оставаться внутри runtime_dir.")
    if not candidate.exists() or not candidate.is_file():
        raise AppError(404, "Выбранный LoRA adapter не найден.")
    return candidate


def update_lora_adapter_display_name(runtime_root: Path, raw_path: object, display_name: object) -> str:
    candidate = resolve_lora_adapter_path(runtime_root, raw_path)
    if candidate is None:
        raise AppError(400, "Нужно указать путь к LoRA adapter.")
    if not isinstance(display_name, str) or not display_name.strip():
        raise AppError(400, "Нужно непустое имя LoRA adapter.")
    normalized_name = display_name.strip()
    candidate.with_suffix(f"{candidate.suffix}.json").write_text(normalized_name, encoding="utf-8")
    return normalized_name


def _original_name(file_name: str) -> str:
    parts = file_name.split("_", 1)
    if len(parts) == 2 and len(parts[0]) == 64:
        return parts[1]
    return file_name


def _read_display_name(candidate: Path) -> str:
    meta_path = candidate.with_suffix(f"{candidate.suffix}.json")
    try:
        payload = meta_path.read_text(encoding="utf-8").strip()
    except OSError:
        return _original_name(candidate.name)
    return payload or _original_name(candidate.name)
