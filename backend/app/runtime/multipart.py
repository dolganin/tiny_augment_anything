from __future__ import annotations

from dataclasses import dataclass

from backend.app.runtime.errors import AppError


@dataclass(frozen=True, slots=True)
class UploadedFile:
    field_name: str
    file_name: str
    content_type: str
    data: bytes


@dataclass(frozen=True, slots=True)
class MultipartForm:
    files: list[UploadedFile]
    fields: dict[str, str]


def parse_multipart(body: bytes, content_type: str) -> list[UploadedFile]:
    form = parse_multipart_form(body, content_type)
    if not form.files:
        raise AppError(400, "Multipart payload does not contain files")
    return form.files


def parse_multipart_form(body: bytes, content_type: str) -> MultipartForm:
    boundary_marker = "boundary="
    if boundary_marker not in content_type:
        raise AppError(400, "Multipart boundary is missing")
    boundary = content_type.split(boundary_marker, maxsplit=1)[1].strip().strip('"')
    delimiter = f"--{boundary}".encode("utf-8")
    files: list[UploadedFile] = []
    fields: dict[str, str] = {}
    for chunk in body.split(delimiter):
        part = chunk.strip()
        if not part or part == b"--":
            continue
        headers_blob, _, content = part.partition(b"\r\n\r\n")
        if not content:
            continue
        headers = _parse_headers(headers_blob)
        disposition = headers.get("content-disposition", "")
        field_name = _extract_disposition_value(disposition, "name")
        if "filename=" not in disposition:
            if field_name:
                fields[field_name] = content.rstrip(b"\r\n").decode("utf-8")
            continue
        file_name = _extract_disposition_value(disposition, "filename")
        files.append(
            UploadedFile(
                field_name=field_name,
                file_name=file_name,
                content_type=headers.get("content-type", "application/octet-stream"),
                data=content.rstrip(b"\r\n"),
            )
        )
    return MultipartForm(files=files, fields=fields)


def _parse_headers(blob: bytes) -> dict[str, str]:
    headers: dict[str, str] = {}
    for raw_line in blob.split(b"\r\n"):
        if b":" not in raw_line:
            continue
        key, value = raw_line.split(b":", maxsplit=1)
        headers[key.decode("latin-1").strip().lower()] = value.decode("latin-1").strip()
    return headers


def _extract_disposition_value(disposition: str, key: str) -> str:
    prefix = f'{key}="'
    start = disposition.find(prefix)
    if start < 0:
        return ""
    remainder = disposition[start + len(prefix) :]
    end = remainder.find('"')
    return remainder[:end] if end >= 0 else remainder
