from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path
import json
import shutil
from uuid import UUID, uuid4
from zipfile import ZipFile

from backend.app.services.archive_layout import collect_dataset_archive_images
from backend.app.repositories.datasets import create_assets, create_dataset, create_initial_version, get_dataset_stats, update_dataset_status
from backend.app.repositories.sessions import create_pending_session, finalize_import_session
from backend.app.runtime.errors import AppError
from backend.app.services.filesystem import (
    RuntimePaths,
    dataset_manifest_dir,
    dataset_originals_dir,
    make_relative_path,
    session_upload_dir,
    staged_upload_dir,
)

@dataclass(frozen=True, slots=True)
class UploadResult:
    session_id: UUID
    dataset_id: UUID
    dataset_name: str


@dataclass(frozen=True, slots=True)
class UploadPreparation:
    session_id: UUID
    dataset_id: UUID
    version_id: UUID
    dataset_name: str
    archive_path: str


@dataclass(frozen=True, slots=True)
class ChunkUploadInit:
    upload_id: UUID
    chunk_size: int
    total_parts: int


DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024


def init_chunk_upload(runtime_paths: RuntimePaths, file_name: str, file_size: int) -> ChunkUploadInit:
    if not file_name.lower().endswith(".zip"):
        raise AppError(400, "Нужен архив формата .zip.")
    if file_size <= 0:
        raise AppError(400, "Размер файла должен быть положительным.")
    upload_id = uuid4()
    upload_dir = staged_upload_dir(runtime_paths, upload_id)
    upload_dir.mkdir(parents=True, exist_ok=True)
    archive_path = upload_dir / "source.zip"
    archive_path.write_bytes(b"")
    total_parts = max(1, (file_size + DEFAULT_CHUNK_SIZE - 1) // DEFAULT_CHUNK_SIZE)
    _write_upload_meta(
        upload_dir / "meta.json",
        {
            "file_name": file_name,
            "file_size": file_size,
            "chunk_size": DEFAULT_CHUNK_SIZE,
            "total_parts": total_parts,
            "next_part": 0,
            "uploaded_bytes": 0,
        },
    )
    return ChunkUploadInit(upload_id=upload_id, chunk_size=DEFAULT_CHUNK_SIZE, total_parts=total_parts)


def append_chunk(runtime_paths: RuntimePaths, upload_id: UUID, part_number: int, total_parts: int, payload: bytes) -> float:
    upload_dir = staged_upload_dir(runtime_paths, upload_id)
    meta_path = upload_dir / "meta.json"
    archive_path = upload_dir / "source.zip"
    if not meta_path.exists() or not archive_path.exists():
        raise AppError(404, "Загрузка не найдена.")
    meta = _read_upload_meta(meta_path)
    if int(meta["total_parts"]) != total_parts:
        raise AppError(400, "Некорректное число частей.")
    if int(meta["next_part"]) != part_number:
        raise AppError(409, "Нарушен порядок передачи частей.")
    with archive_path.open("ab") as archive_file:
        archive_file.write(payload)
    meta["next_part"] = part_number + 1
    meta["uploaded_bytes"] = int(meta["uploaded_bytes"]) + len(payload)
    _write_upload_meta(meta_path, meta)
    return min(1.0, int(meta["uploaded_bytes"]) / int(meta["file_size"]))


def discard_chunk_upload(runtime_paths: RuntimePaths, upload_id: UUID) -> None:
    upload_dir = staged_upload_dir(runtime_paths, upload_id)
    if not upload_dir.exists():
        return
    shutil.rmtree(upload_dir, ignore_errors=True)


async def prepare_dataset_upload_from_staged_archive(
    connection,
    runtime_paths: RuntimePaths,
    runtime_root,
    upload_id: UUID,
) -> UploadPreparation:
    upload_dir = staged_upload_dir(runtime_paths, upload_id)
    meta_path = upload_dir / "meta.json"
    archive_path = upload_dir / "source.zip"
    if not meta_path.exists() or not archive_path.exists():
        raise AppError(404, "Загрузка не найдена.")
    meta = _read_upload_meta(meta_path)
    if int(meta["next_part"]) != int(meta["total_parts"]):
        raise AppError(400, "Архив ещё не загружен полностью.")
    file_name = str(meta["file_name"])
    if not file_name.lower().endswith(".zip"):
        raise AppError(400, "Нужен архив формата .zip.")
    session_id = uuid4()
    dataset_id = uuid4()
    version_id = uuid4()
    dataset_name = file_name[:-4]
    session_dir = session_upload_dir(runtime_paths, session_id)
    session_dir.mkdir(parents=True, exist_ok=True)
    target_archive_path = session_dir / "source.zip"
    archive_path.replace(target_archive_path)
    archive_relative_path = make_relative_path(runtime_root, target_archive_path)
    await create_pending_session(connection, session_id, dataset_id)
    await create_dataset(
        connection,
        dataset_id=dataset_id,
        session_id=session_id,
        name=dataset_name,
        source_archive_path=archive_relative_path,
        status="importing",
    )
    try:
        meta_path.unlink(missing_ok=True)
        upload_dir.rmdir()
    except OSError:
        pass
    return UploadPreparation(
        session_id=session_id,
        dataset_id=dataset_id,
        version_id=version_id,
        dataset_name=dataset_name,
        archive_path=archive_relative_path,
    )


async def prepare_dataset_upload(
    connection,
    runtime_paths: RuntimePaths,
    runtime_root,
    file_name: str,
    file_bytes: bytes,
) -> UploadPreparation:
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
    archive_relative_path = make_relative_path(runtime_root, source_archive_path)
    await create_pending_session(connection, session_id, dataset_id)
    await create_dataset(
        connection,
        dataset_id=dataset_id,
        session_id=session_id,
        name=dataset_name,
        source_archive_path=archive_relative_path,
        status="importing",
    )
    return UploadPreparation(
        session_id=session_id,
        dataset_id=dataset_id,
        version_id=version_id,
        dataset_name=dataset_name,
        archive_path=archive_relative_path,
    )


async def process_dataset_upload(
    connection,
    runtime_paths: RuntimePaths,
    runtime_root,
    file_name: str,
    file_bytes: bytes,
) -> UploadResult:
    preparation = await prepare_dataset_upload(
        connection=connection,
        runtime_paths=runtime_paths,
        runtime_root=runtime_root,
        file_name=file_name,
        file_bytes=file_bytes,
    )
    await import_prepared_dataset(
        connection,
        runtime_paths=runtime_paths,
        runtime_root=runtime_root,
        session_id=preparation.session_id,
        dataset_id=preparation.dataset_id,
        version_id=preparation.version_id,
        archive_path=preparation.archive_path,
    )
    return UploadResult(
        session_id=preparation.session_id,
        dataset_id=preparation.dataset_id,
        dataset_name=preparation.dataset_name,
    )


async def import_prepared_dataset(
    connection,
    runtime_paths: RuntimePaths,
    runtime_root,
    session_id: UUID,
    dataset_id: UUID,
    version_id: UUID,
    archive_path: str,
) -> dict[str, int | str]:
    source_archive_path = runtime_root / archive_path
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
    await create_initial_version(
        connection,
        version_id=version_id,
        dataset_id=dataset_id,
        manifest_path=make_relative_path(runtime_root, manifest_path),
        summary={"classes": class_stats, "assetCount": len(assets)},
    )
    await create_assets(connection, assets, version_id)
    await finalize_import_session(connection, session_id, version_id)
    await update_dataset_status(connection, dataset_id, "ready")
    await get_dataset_stats(connection, dataset_id, version_id)
    return {"assetCount": len(assets), "classCount": len(class_stats)}


async def fail_prepared_dataset_import(connection, dataset_id: UUID) -> None:
    await update_dataset_status(connection, dataset_id, "error")


def _read_upload_meta(meta_path: Path) -> dict[str, int | str]:
    payload = json.loads(meta_path.read_text(encoding="utf-8"))
    return payload if isinstance(payload, dict) else {}


def _write_upload_meta(meta_path: Path, payload: dict[str, int | str]) -> None:
    meta_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def _extract_assets(runtime_paths: RuntimePaths, runtime_root, dataset_id: UUID, archive_path) -> list[dict]:
    originals_dir = dataset_originals_dir(runtime_paths, dataset_id)
    originals_dir.mkdir(parents=True, exist_ok=True)
    assets: list[dict] = []
    archive_entries = collect_dataset_archive_images(archive_path)
    with ZipFile(archive_path, "r") as archive:
        for entry in archive_entries:
            asset_id = uuid4()
            class_dir = originals_dir / entry.class_name
            class_dir.mkdir(parents=True, exist_ok=True)
            target_path = class_dir / f"{asset_id}{entry.suffix}"
            with archive.open(entry.member_name, "r") as source_file:
                data = source_file.read()
            target_path.write_bytes(data)
            relative_path = make_relative_path(runtime_root, target_path)
            assets.append(
                {
                    "id": asset_id,
                    "dataset_id": dataset_id,
                    "class_name": entry.class_name,
                    "storage_path": relative_path,
                    "preview_path": relative_path,
                    "checksum": sha256(data).hexdigest(),
                }
            )
    return assets


def _class_stats(assets: list[dict]) -> list[dict[str, int | str]]:
    counts: dict[str, int] = {}
    for asset in assets:
        class_name = str(asset["class_name"])
        counts[class_name] = counts.get(class_name, 0) + 1
    return [
        {"name": class_name, "count": count}
        for class_name, count in sorted(counts.items(), key=lambda item: (item[1], item[0]))
    ]
