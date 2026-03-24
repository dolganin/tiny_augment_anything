from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID


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


@dataclass(frozen=True, slots=True)
class ChunkUploadStatus:
    upload_id: UUID
    file_name: str
    file_size: int
    chunk_size: int
    total_parts: int
    next_part: int
    uploaded_bytes: int


@dataclass(frozen=True, slots=True)
class CompletedClassifierWeightsUpload:
    file_name: str
    weights_path: str
