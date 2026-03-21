from __future__ import annotations

from backend.app.api.dataset_handlers import dataset_stats
from backend.app.api.session_handlers import get_session, save_classes, upload_dataset
from backend.app.config.settings import load_settings
from backend.app.runtime.errors import AppError
from backend.app.runtime.request import Request, read_body
from backend.app.runtime.response import json_response
from backend.app.runtime.router import Router
from backend.app.services.bootstrap import RuntimeState, bootstrap_runtime, shutdown_runtime


async def health_handler(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    return json_response(200, {"status": "ok", "service": "tiny-augment-backend", "runtimeDir": str(runtime_state.settings.runtime_dir)})


def build_router() -> Router:
    router = Router()
    router.add_http("GET", "/api/health", health_handler)
    router.add_http("POST", "/api/sessions/upload", upload_dataset)
    router.add_http("GET", "/api/sessions/{session_id}", get_session)
    router.add_http("POST", "/api/sessions/{session_id}/dataset/classes", save_classes)
    router.add_http("GET", "/api/sessions/{session_id}/dataset/stats", dataset_stats)
    return router


def _require_state(state: object) -> RuntimeState:
    if not isinstance(state, RuntimeState):
        raise RuntimeError("Application state is not initialized")
    return state


class TinyAugmentBackend:
    def __init__(self) -> None:
        self.router = build_router()
        self.state: RuntimeState | None = None

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
                self.state = await bootstrap_runtime(load_settings())
                await send({"type": "lifespan.startup.complete"})
                continue
            if message_type == "lifespan.shutdown":
                if self.state is not None:
                    await shutdown_runtime(self.state)
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
        try:
            response = await handler(request, params, self.state)
            await response.send(send)
        except AppError as error:
            await json_response(error.status_code, {"message": error.message}).send(send)
        except Exception as error:
            await json_response(500, {"message": str(error)}).send(send)


app = TinyAugmentBackend()
