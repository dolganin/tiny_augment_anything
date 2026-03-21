from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from zipfile import BadZipFile, ZipFile

from backend.app.runtime.errors import AppError


IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".bmp", ".gif", ".webp"}
IGNORED_NAMES = {".ds_store", "thumbs.db"}
IGNORED_PARTS = {"", ".", "__MACOSX"}


@dataclass(frozen=True, slots=True)
class ArchiveImageEntry:
    member_name: str
    class_name: str
    suffix: str


def collect_dataset_archive_images(archive_path: Path) -> list[ArchiveImageEntry]:
    try:
        with ZipFile(archive_path, "r") as archive:
            return _collect_from_archive(archive)
    except BadZipFile as error:
        raise AppError(422, "Архив повреждён или не распознаётся как zip.") from error


def _collect_from_archive(archive: ZipFile) -> list[ArchiveImageEntry]:
    normalized_members: list[tuple[str, tuple[str, ...]]] = []
    image_parts: list[tuple[str, ...]] = []
    seen_paths: set[tuple[str, ...]] = set()
    for member in archive.infolist():
        if member.is_dir():
            continue
        parts = _normalize_member_parts(member.filename)
        if parts is None:
            continue
        if parts in seen_paths:
            raise AppError(422, "Архив содержит повторяющиеся пути после нормализации.")
        seen_paths.add(parts)
        normalized_members.append((member.filename, parts))
        if PurePosixPath(*parts).suffix.lower() in IMAGE_SUFFIXES:
            image_parts.append(parts)
    if not image_parts:
        raise AppError(422, "Архив не содержит изображений.")
    strip_depth = _detect_wrapper_depth(image_parts)
    result: list[ArchiveImageEntry] = []
    class_counts: dict[str, int] = {}
    for member_name, parts in normalized_members:
        relative_parts = parts[strip_depth:]
        if not relative_parts:
            continue
        if len(relative_parts) < 2:
            raise AppError(422, "В корне датасета должны быть только папки классов.")
        class_name = relative_parts[0].strip()
        if not class_name:
            raise AppError(422, "Имя класса не может быть пустым.")
        suffix = PurePosixPath(*relative_parts).suffix.lower()
        if suffix not in IMAGE_SUFFIXES:
            raise AppError(422, "В папках классов разрешены только изображения.")
        result.append(ArchiveImageEntry(member_name=member_name, class_name=class_name, suffix=suffix))
        class_counts[class_name] = class_counts.get(class_name, 0) + 1
    if not class_counts:
        raise AppError(422, "После нормализации архив не содержит изображений.")
    return result


def _normalize_member_parts(member_name: str) -> tuple[str, ...] | None:
    raw_name = str(member_name or "").replace("\\", "/").strip()
    if not raw_name:
        return None
    if raw_name.startswith("/"):
        raise AppError(422, "Архив содержит небезопасные пути.")
    parts = tuple(
        part
        for part in PurePosixPath(raw_name.lstrip("./")).parts
        if part not in IGNORED_PARTS and not part.startswith("__MACOSX")
    )
    if not parts:
        return None
    if any(part == ".." for part in parts):
        raise AppError(422, "Архив содержит небезопасные пути.")
    file_name = parts[-1].lower()
    if file_name in IGNORED_NAMES:
        return None
    return parts


def _detect_wrapper_depth(image_parts: list[tuple[str, ...]]) -> int:
    depth = 0
    while True:
        if any(len(parts) - (depth + 1) < 2 for parts in image_parts):
            return depth
        expected = image_parts[0][depth]
        if any(parts[depth] != expected for parts in image_parts):
            return depth
        depth += 1
