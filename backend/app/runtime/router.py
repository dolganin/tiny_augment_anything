from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Awaitable, Callable

from backend.app.runtime.request import Request
from backend.app.runtime.response import Response


HttpHandler = Callable[[Request, dict[str, str], object], Awaitable[Response]]
WebSocketHandler = Callable[[dict, dict[str, str], object], Awaitable[None]]


@dataclass(frozen=True, slots=True)
class HttpRoute:
    method: str
    pattern: re.Pattern[str]
    handler: HttpHandler


@dataclass(frozen=True, slots=True)
class WebSocketRoute:
    pattern: re.Pattern[str]
    handler: WebSocketHandler


def compile_path(path: str) -> re.Pattern[str]:
    chunks = [segment for segment in path.strip("/").split("/") if segment]
    pattern = "^"
    for chunk in chunks:
        if chunk.startswith("{") and chunk.endswith("}"):
            name = chunk[1:-1]
            pattern += rf"/(?P<{name}>[^/]+)"
        else:
            pattern += f"/{re.escape(chunk)}"
    if not chunks:
        pattern += "/"
    pattern += "$"
    return re.compile(pattern)


class Router:
    def __init__(self) -> None:
        self.http_routes: list[HttpRoute] = []
        self.websocket_routes: list[WebSocketRoute] = []

    def add_http(self, method: str, path: str, handler: HttpHandler) -> None:
        self.http_routes.append(HttpRoute(method=method.upper(), pattern=compile_path(path), handler=handler))

    def add_ws(self, path: str, handler: WebSocketHandler) -> None:
        self.websocket_routes.append(WebSocketRoute(pattern=compile_path(path), handler=handler))

    def match_http(self, method: str, path: str) -> tuple[HttpHandler, dict[str, str]] | None:
        for route in self.http_routes:
            if route.method != method.upper():
                continue
            match = route.pattern.match(path)
            if match:
                return route.handler, match.groupdict()
        return None

    def match_ws(self, path: str) -> tuple[WebSocketHandler, dict[str, str]] | None:
        for route in self.websocket_routes:
            match = route.pattern.match(path)
            if match:
                return route.handler, match.groupdict()
        return None
