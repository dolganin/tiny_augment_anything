from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import parse_qs
import json
from typing import Any


@dataclass(slots=True)
class Request:
    scope: dict[str, Any]
    body: bytes

    @property
    def method(self) -> str:
        return str(self.scope["method"]).upper()

    @property
    def path(self) -> str:
        return str(self.scope["path"])

    @property
    def headers(self) -> dict[str, str]:
        return {
            key.decode("latin-1").lower(): value.decode("latin-1")
            for key, value in self.scope.get("headers", [])
        }

    @property
    def query_params(self) -> dict[str, str]:
        query = parse_qs(self.scope.get("query_string", b"").decode("utf-8"))
        return {key: values[-1] for key, values in query.items() if values}

    def json(self) -> Any:
        if not self.body:
            return None
        return json.loads(self.body.decode("utf-8"))


async def read_body(receive) -> bytes:
    chunks: list[bytes] = []
    while True:
        message = await receive()
        if message["type"] != "http.request":
            continue
        chunks.append(message.get("body", b""))
        if not message.get("more_body", False):
            break
    return b"".join(chunks)
