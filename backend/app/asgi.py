from __future__ import annotations

from dataclasses import dataclass

from backend.app.config.settings import Settings, load_settings
from backend.app.runtime.request import Request, read_body
from backend.app.runtime.response import json_response
from backend.app.runtime.router import Router


@dataclass(slots=True)
class AppState:
    settings: Settings


async def health_handler(request: Request, params: dict[str, str], state: object):
    app_state = _require_state(state)
    return json_response(
        200,
        {
            "status": "ok",
            "service": "tiny-augment-backend",
            "runtimeDir": str(app_state.settings.runtime_dir),
        },
    )


def build_router() -> Router:
    router = Router()
    router.add_http("GET", "/api/health", health_handler)
    return router


def _require_state(state: object) -> AppState:
    if not isinstance(state, AppState):
        raise RuntimeError("Application state is not initialized")
    return state


class TinyAugmentBackend:
    def __init__(self) -> None:
        self.router = build_router()
        self.state: AppState | None = None

    async def __call__(self, scope, receive, send) -> None:
        scope_type = scope["type"]
        if scope_type == "lifespan":
            await self.handle_lifespan(receive, send)
            return
        if scope_type == "http":
            await self.handle_http(scope, receive, send)
            return
        if scope_type == "websocket":
            await send({"type": "websocket.close", "code": 1000})
            return
        raise RuntimeError(f"Unsupported scope type: {scope_type}")

    async def handle_lifespan(self, receive, send) -> None:
        while True:
            message = await receive()
            message_type = message["type"]
            if message_type == "lifespan.startup":
                settings = load_settings()
                settings.runtime_dir.mkdir(parents=True, exist_ok=True)
                self.state = AppState(settings=settings)
                await send({"type": "lifespan.startup.complete"})
                continue
            if message_type == "lifespan.shutdown":
                await send({"type": "lifespan.shutdown.complete"})
                return

    async def handle_http(self, scope, receive, send) -> None:
        route = self.router.match_http(str(scope["method"]).upper(), str(scope["path"]))
        if route is None:
            await json_response(404, {"message": "Route not found"}).send(send)
            return
        if self.state is None:
            await json_response(503, {"message": "Application is not ready"}).send(send)
            return
        handler, params = route
        request = Request(scope=scope, body=await read_body(receive))
        response = await handler(request, params, self.state)
        await response.send(send)


app = TinyAugmentBackend()
