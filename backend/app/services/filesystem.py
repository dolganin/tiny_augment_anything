from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from uuid import UUID

from backend.app.config.settings import Settings


@dataclass(frozen=True, slots=True)
class RuntimePaths:
    uploads: Path
    datasets: Path
    manifests: Path
    temp: Path


def build_runtime_paths(settings: Settings) -> RuntimePaths:
    return RuntimePaths(
        uploads=settings.runtime_dir / "uploads",
        datasets=settings.runtime_dir / "datasets",
        manifests=settings.runtime_dir / "manifests",
        temp=settings.runtime_dir / "temp",
    )


def ensure_runtime_layout(paths: RuntimePaths) -> None:
    for directory in (paths.uploads, paths.datasets, paths.manifests, paths.temp):
        directory.mkdir(parents=True, exist_ok=True)


def session_upload_dir(paths: RuntimePaths, session_id: UUID) -> Path:
    return paths.uploads / str(session_id)


def staged_upload_dir(paths: RuntimePaths, upload_id: UUID) -> Path:
    return paths.temp / "uploads" / str(upload_id)


def dataset_root_dir(paths: RuntimePaths, dataset_id: UUID) -> Path:
    return paths.datasets / str(dataset_id)


def dataset_originals_dir(paths: RuntimePaths, dataset_id: UUID) -> Path:
    return dataset_root_dir(paths, dataset_id) / "originals"


def dataset_generated_dir(paths: RuntimePaths, dataset_id: UUID) -> Path:
    return dataset_root_dir(paths, dataset_id) / "generated"


def dataset_modified_dir(paths: RuntimePaths, dataset_id: UUID) -> Path:
    return dataset_root_dir(paths, dataset_id) / "modified"


def dataset_previews_dir(paths: RuntimePaths, dataset_id: UUID) -> Path:
    return dataset_root_dir(paths, dataset_id) / "previews"


def dataset_exports_dir(paths: RuntimePaths, dataset_id: UUID) -> Path:
    return dataset_root_dir(paths, dataset_id) / "exports"


def dataset_manifest_dir(paths: RuntimePaths, dataset_id: UUID) -> Path:
    return paths.manifests / str(dataset_id)


def make_relative_path(base_dir: Path, target: Path) -> str:
    return target.relative_to(base_dir).as_posix()
