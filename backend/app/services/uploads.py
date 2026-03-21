from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from pathlib import PurePosixPath
from zipfile import BadZipFile, ZipFile
import json
from uuid import UUID, uuid4

from backend.app.repositories.datasets import create_assets, create_dataset, create_initial_version, get_dataset_stats
from backend.app.repositories.sessions import create_session
from backend.app.runtime.errors import AppError
from backend.app.services.filesystem import (
    RuntimePaths,
    dataset_manifest_dir,
    dataset_originals_dir,
    make_relative_path,
    session_upload_dir,
)


IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".bmp", ".webp"}


@dataclass(frozen=True, slots=True)
class UploadResult:
    session_id: UUID
    dataset_id: UUID
    dataset_name: str


async def process_dataset_upload(
    connection,
    runtime_paths: RuntimePaths,
    runtime_root,
    file_name: str,
    file_bytes: bytes,
) -> UploadResult:
    if not file_name.lower().endswith(".zip"):
        raise AppError(400, "Нужен архив формата .zip.")
    session_id = uuid4()
    dataset_id = uuid4()
    version_id = uuid4()
    upload_dir = session_upload_dir(runtime_paths, session_id)
    upload_dir.mkdir(parents=True, exist_ok=True)
    source_archive_path = upload_dir / "source.zip"
    source_archive_path.write_bytes(file_bytes)
    dataset_name = file_name[:-4] if file_name.lower().endswith(".zip") else file_name
    assets = _extract_assets(runtime_paths, runtime_root, dataset_id, source_archive_path)
    if not assets:
        raise AppError(422, "Архив не содержит изображений в ожидаемой структуре.")
    manifest_dir = dataset_manifest_dir(runtime_paths, dataset_id)
    manifest_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = manifest_dir / "v1.json"
    class_stats = _class_stats(assets)
    manifest_path.write_text(
        json.dumps(
            {
                "datasetId": str(dataset_id),
                "versionIndex": 1,
                "classes": class_stats,
                "assets": [
                    {
                        "id": str(asset["id"]),
                        "className": asset["class_name"],
                        "storagePath": asset["storage_path"],
                    }
                    for asset in assets
                ],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    await create_session(connection, session_id, dataset_id, version_id)
    await create_dataset(
        connection,
        dataset_id=dataset_id,
        session_id=session_id,
        name=dataset_name,
        source_archive_path=make_relative_path(runtime_root, source_archive_path),
    )
    await create_initial_version(
        connection,
        version_id=version_id,
        dataset_id=dataset_id,
        manifest_path=make_relative_path(runtime_root, manifest_path),
        summary={"classes": class_stats, "assetCount": len(assets)},
    )
    await create_assets(connection, assets, version_id)
    await get_dataset_stats(connection, dataset_id, version_id)
    return UploadResult(session_id=session_id, dataset_id=dataset_id, dataset_name=dataset_name)


def _extract_assets(runtime_paths: RuntimePaths, runtime_root, dataset_id: UUID, archive_path) -> list[dict]:
    originals_dir = dataset_originals_dir(runtime_paths, dataset_id)
    originals_dir.mkdir(parents=True, exist_ok=True)
    assets: list[dict] = []
    try:
        with ZipFile(archive_path, "r") as archive:
            for member in archive.infolist():
                if member.is_dir():
                    continue
                class_name = _resolve_class_name(member.filename)
                if not class_name:
                    continue
                suffix = PurePosixPath(member.filename).suffix.lower()
                if suffix not in IMAGE_SUFFIXES:
                    continue
                asset_id = uuid4()
                class_dir = originals_dir / class_name
                class_dir.mkdir(parents=True, exist_ok=True)
                target_path = class_dir / f"{asset_id}{suffix}"
                with archive.open(member, "r") as source_file:
                    data = source_file.read()
                target_path.write_bytes(data)
                relative_path = make_relative_path(runtime_root, target_path)
                assets.append(
                    {
                        "id": asset_id,
                        "dataset_id": dataset_id,
                        "class_name": class_name,
                        "storage_path": relative_path,
                        "preview_path": relative_path,
                        "checksum": sha256(data).hexdigest(),
                    }
                )
    except BadZipFile as error:
        raise AppError(422, "Архив повреждён или не распознаётся как zip.") from error
    return assets


def _resolve_class_name(member_name: str) -> str | None:
    parts = [part for part in PurePosixPath(member_name).parts if part not in {"", ".", "__MACOSX"}]
    if len(parts) < 2:
        return None
    return parts[-2]


def _class_stats(assets: list[dict]) -> list[dict[str, int | str]]:
    counts: dict[str, int] = {}
    for asset in assets:
        class_name = str(asset["class_name"])
        counts[class_name] = counts.get(class_name, 0) + 1
    return [
        {"name": class_name, "count": count}
        for class_name, count in sorted(counts.items(), key=lambda item: (item[1], item[0]))
    ]
