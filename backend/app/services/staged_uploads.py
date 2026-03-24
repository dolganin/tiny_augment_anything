from __future__ import annotations

from pathlib import Path
import shutil
from uuid import UUID, uuid4

from backend.app.runtime.errors import AppError
from backend.app.runtime.logging import get_logger, log_event
from backend.app.services.filesystem import RuntimePaths, make_relative_path, staged_upload_dir
from backend.app.services.upload_models import ChunkUploadInit, ChunkUploadStatus, CompletedClassifierWeightsUpload
from backend.app.services.upload_utils import (
    CLASSIFIER_WEIGHTS_EXTENSIONS,
    DEFAULT_CHUNK_SIZE,
    meta_target_name,
    read_upload_meta,
    remove_duplicate_classifier_weights,
    sha256_file,
    write_upload_meta,
)


logger = get_logger(__name__)


def init_chunk_upload(runtime_paths: RuntimePaths, file_name: str, file_size: int) -> ChunkUploadInit:
    if not file_name.lower().endswith(".zip"):
        raise AppError(400, "Нужен архив формата .zip.")
    return _init_staged_upload(runtime_paths, file_name, file_size, staged_file_name="source.zip")


def init_classifier_weights_upload(runtime_paths: RuntimePaths, file_name: str, file_size: int) -> ChunkUploadInit:
    suffix = Path(file_name).suffix.lower()
    if suffix not in CLASSIFIER_WEIGHTS_EXTENSIONS:
        raise AppError(400, "Нужны веса формата .bin, .ckpt, .pt, .pth или .safetensors.")
    return _init_staged_upload(runtime_paths, file_name, file_size, staged_file_name="weights.bin")


def complete_classifier_weights_upload(
    runtime_paths: RuntimePaths,
    runtime_root: Path,
    session_id: UUID,
    upload_id: UUID,
) -> CompletedClassifierWeightsUpload:
    upload_dir = staged_upload_dir(runtime_paths, upload_id)
    meta_path = upload_dir / "meta.json"
    if not meta_path.exists():
        raise AppError(404, "Загрузка весов не найдена.")
    meta = read_upload_meta(meta_path)
    weights_path = upload_dir / meta_target_name(meta)
    if not weights_path.exists():
        raise AppError(404, "Загруженные веса не найдены.")
    if int(meta["next_part"]) != int(meta["total_parts"]):
        raise AppError(400, "Файл весов ещё не загружен полностью.")
    file_name = str(meta["file_name"])
    target_dir = runtime_paths.temp / "classifier-weights" / str(session_id)
    target_dir.mkdir(parents=True, exist_ok=True)
    file_hash = sha256_file(weights_path)
    target_path = target_dir / f"{file_hash}_{Path(file_name).name}"
    if target_path.exists():
        weights_path.unlink(missing_ok=True)
    else:
        weights_path.replace(target_path)
    remove_duplicate_classifier_weights(target_dir, target_path, file_hash)
    try:
        meta_path.unlink(missing_ok=True)
        upload_dir.rmdir()
    except OSError:
        pass
    relative_path = make_relative_path(runtime_root, target_path)
    log_event(
        logger,
        20,
        "upload.classifier-weights.complete",
        upload_id=upload_id,
        session_id=session_id,
        file_name=file_name,
        weights_path=relative_path,
    )
    return CompletedClassifierWeightsUpload(file_name=file_name, weights_path=relative_path)


def append_chunk(runtime_paths: RuntimePaths, upload_id: UUID, part_number: int, total_parts: int, payload: bytes) -> float:
    upload_dir = staged_upload_dir(runtime_paths, upload_id)
    meta_path = upload_dir / "meta.json"
    if not meta_path.exists():
        raise AppError(404, "Загрузка не найдена.")
    meta = read_upload_meta(meta_path)
    archive_path = upload_dir / meta_target_name(meta)
    if not archive_path.exists():
        raise AppError(404, "Загрузка не найдена.")
    if int(meta["total_parts"]) != total_parts:
        raise AppError(400, "Некорректное число частей.")
    if int(meta["next_part"]) != part_number:
        raise AppError(409, "Нарушен порядок передачи частей.")
    with archive_path.open("ab") as archive_file:
        archive_file.write(payload)
    meta["next_part"] = part_number + 1
    meta["uploaded_bytes"] = int(meta["uploaded_bytes"]) + len(payload)
    write_upload_meta(meta_path, meta)
    next_part = int(meta["next_part"])
    expected_parts = int(meta["total_parts"])
    if next_part == 1 or next_part == expected_parts or next_part % 10 == 0:
        log_event(
            logger,
            20,
            "upload.chunk.appended",
            upload_id=upload_id,
            part_number=part_number,
            next_part=next_part,
            total_parts=expected_parts,
            uploaded_bytes=int(meta["uploaded_bytes"]),
            file_size=int(meta["file_size"]),
        )
    return min(1.0, int(meta["uploaded_bytes"]) / int(meta["file_size"]))


def discard_chunk_upload(runtime_paths: RuntimePaths, upload_id: UUID) -> None:
    upload_dir = staged_upload_dir(runtime_paths, upload_id)
    if not upload_dir.exists():
        return
    shutil.rmtree(upload_dir, ignore_errors=True)
    log_event(logger, 20, "upload.discarded", upload_id=upload_id, upload_dir=upload_dir)


def get_chunk_upload_status(runtime_paths: RuntimePaths, upload_id: UUID) -> ChunkUploadStatus:
    upload_dir = staged_upload_dir(runtime_paths, upload_id)
    meta_path = upload_dir / "meta.json"
    if not meta_path.exists():
        raise AppError(404, "Загрузка не найдена.")
    meta = read_upload_meta(meta_path)
    archive_path = upload_dir / meta_target_name(meta)
    if not archive_path.exists():
        raise AppError(404, "Загрузка не найдена.")
    return ChunkUploadStatus(
        upload_id=upload_id,
        file_name=str(meta["file_name"]),
        file_size=int(meta["file_size"]),
        chunk_size=int(meta["chunk_size"]),
        total_parts=int(meta["total_parts"]),
        next_part=int(meta["next_part"]),
        uploaded_bytes=int(meta["uploaded_bytes"]),
    )


def _init_staged_upload(
    runtime_paths: RuntimePaths,
    file_name: str,
    file_size: int,
    *,
    staged_file_name: str,
) -> ChunkUploadInit:
    if file_size <= 0:
        raise AppError(400, "Размер файла должен быть положительным.")
    upload_id = uuid4()
    upload_dir = staged_upload_dir(runtime_paths, upload_id)
    upload_dir.mkdir(parents=True, exist_ok=True)
    archive_path = upload_dir / staged_file_name
    archive_path.write_bytes(b"")
    total_parts = max(1, (file_size + DEFAULT_CHUNK_SIZE - 1) // DEFAULT_CHUNK_SIZE)
    write_upload_meta(
        upload_dir / "meta.json",
        {
            "file_name": Path(file_name).name,
            "file_size": file_size,
            "chunk_size": DEFAULT_CHUNK_SIZE,
            "total_parts": total_parts,
            "next_part": 0,
            "uploaded_bytes": 0,
            "target_name": staged_file_name,
        },
    )
    log_event(
        logger,
        20,
        "upload.init",
        upload_id=upload_id,
        file_name=file_name,
        file_size=file_size,
        chunk_size=DEFAULT_CHUNK_SIZE,
        total_parts=total_parts,
        upload_dir=upload_dir,
    )
    return ChunkUploadInit(upload_id=upload_id, chunk_size=DEFAULT_CHUNK_SIZE, total_parts=total_parts)
