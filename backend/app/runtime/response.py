from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
import json
from typing import Iterable


Headers = list[tuple[bytes, bytes]]


@dataclass(slots=True)
class Response:
    status: int
    body: bytes = b""
    headers: Headers = field(default_factory=list)

    async def send(self, send) -> None:
        await send(
            {
                "type": "http.response.start",
                "status": self.status,
                "headers": self.headers,
            }
        )
        await send({"type": "http.response.body", "body": self.body})


def json_response(status: int, payload: object) -> Response:
    return Response(
        status=status,
        body=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers=[(b"content-type", b"application/json; charset=utf-8")],
    )


def text_response(status: int, payload: str) -> Response:
    return Response(
        status=status,
        body=payload.encode("utf-8"),
        headers=[(b"content-type", b"text/plain; charset=utf-8")],
    )


async def file_response(send, file_path: Path, content_type: str) -> None:
    headers: Headers = [
        (b"content-type", content_type.encode("utf-8")),
        (b"content-length", str(file_path.stat().st_size).encode("utf-8")),
    ]
    await send({"type": "http.response.start", "status": 200, "headers": headers})
    with file_path.open("rb") as file_object:
        while True:
            chunk = file_object.read(65536)
            if not chunk:
                break
            await send(
                {
                    "type": "http.response.body",
                    "body": chunk,
                    "more_body": True,
                }
            )
    await send({"type": "http.response.body", "body": b"", "more_body": False})


async def file_response_with_headers(send, file_path: Path, content_type: str, headers: Headers) -> None:
    merged_headers: Headers = [
        (b"content-type", content_type.encode("utf-8")),
        (b"content-length", str(file_path.stat().st_size).encode("utf-8")),
        *headers,
    ]
    await send({"type": "http.response.start", "status": 200, "headers": merged_headers})
    with file_path.open("rb") as file_object:
        while True:
            chunk = file_object.read(65536)
            if not chunk:
                break
            await send(
                {
                    "type": "http.response.body",
                    "body": chunk,
                    "more_body": True,
                }
            )
    await send({"type": "http.response.body", "body": b"", "more_body": False})


def merge_headers(*chunks: Iterable[tuple[bytes, bytes]]) -> Headers:
    merged: Headers = []
    for chunk in chunks:
        merged.extend(chunk)
    return merged
