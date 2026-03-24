from __future__ import annotations

from hashlib import sha256
from pathlib import Path
import json


DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024
CLASSIFIER_WEIGHTS_EXTENSIONS = {".bin", ".ckpt", ".pt", ".pth", ".safetensors"}
LORA_ADAPTER_EXTENSIONS = CLASSIFIER_WEIGHTS_EXTENSIONS


def read_upload_meta(meta_path: Path) -> dict[str, int | str]:
    payload = json.loads(meta_path.read_text(encoding="utf-8"))
    return payload if isinstance(payload, dict) else {}


def write_upload_meta(meta_path: Path, payload: dict[str, int | str]) -> None:
    meta_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def meta_target_name(meta: dict[str, int | str]) -> str:
    target_name = meta.get("target_name")
    if isinstance(target_name, str) and target_name:
        return target_name
    return "source.zip"


def sha256_file(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as file_object:
        while True:
            chunk = file_object.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def remove_duplicate_classifier_weights(target_dir: Path, canonical_path: Path, expected_hash: str) -> None:
    for candidate in target_dir.iterdir():
        if candidate == canonical_path or not candidate.is_file():
            continue
        try:
            if sha256_file(candidate) == expected_hash:
                candidate.unlink(missing_ok=True)
        except OSError:
            continue


def remove_duplicate_files_by_hash(target_dir: Path, canonical_path: Path, expected_hash: str) -> None:
    for candidate in target_dir.iterdir():
        if candidate == canonical_path or not candidate.is_file():
            continue
        try:
            if sha256_file(candidate) == expected_hash:
                candidate.unlink(missing_ok=True)
        except OSError:
            continue
