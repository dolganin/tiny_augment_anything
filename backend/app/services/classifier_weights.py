from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

from backend.app.services.filesystem import (
    RuntimePaths,
    dataset_classifier_weights_dir,
    make_relative_path,
)
from backend.app.services.upload_models import ClassifierWeightsInfo


def list_classifier_weights(
    runtime_paths: RuntimePaths,
    runtime_root: Path,
    dataset_id: UUID,
    session_id: UUID,
) -> list[ClassifierWeightsInfo]:
    directories = [
        dataset_classifier_weights_dir(runtime_paths, dataset_id),
        runtime_paths.temp / "classifier-weights" / str(session_id),
    ]
    seen_paths: set[str] = set()
    items: list[ClassifierWeightsInfo] = []

    for target_dir in directories:
        if not target_dir.exists():
            continue
        for candidate in sorted(target_dir.iterdir(), key=lambda item: item.stat().st_mtime, reverse=True):
            if not candidate.is_file():
                continue
            relative_path = make_relative_path(runtime_root, candidate)
            if relative_path in seen_paths:
                continue
            seen_paths.add(relative_path)
            stat = candidate.stat()
            file_name = _original_name(candidate.name)
            items.append(
                ClassifierWeightsInfo(
                    display_name=Path(file_name).stem or file_name,
                    file_name=file_name,
                    weights_path=relative_path,
                    size_bytes=stat.st_size,
                    updated_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
                )
            )
    return items


def _original_name(file_name: str) -> str:
    parts = file_name.split("_", 1)
    if len(parts) == 2 and len(parts[0]) == 64:
        return parts[1]
    return file_name
