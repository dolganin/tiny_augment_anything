from __future__ import annotations

from backend.app.api.assets_handlers import asset_by_path
from backend.app.api.catalog_handlers import activate_dataset, datasets_catalog, delete_dataset, rename_dataset
from backend.app.api.dataset_handlers import dataset_stats
from backend.app.api.diffusion_lora_handlers import (
    cancel_diffusion_lora_upload,
    complete_diffusion_lora_upload,
    get_diffusion_lora_upload_status,
    init_diffusion_lora_upload,
    list_diffusion_lora_adapters,
    upload_diffusion_lora_chunk,
)
from backend.app.api.download_handlers import download_dataset
from backend.app.api.jobs_handlers import cancel_global_job_handler, list_global_jobs
from backend.app.api.review_handlers import approve_asset, finalize_review, reject_asset_handler
from backend.app.api.session_handlers import (
    get_session,
    save_classes,
)
from backend.app.api.upload_handlers import (
    cancel_classifier_weights,
    cancel_dataset_upload,
    complete_classifier_weights,
    complete_dataset_upload,
    get_classifier_weights_status,
    get_dataset_upload_status,
    init_classifier_weights,
    init_dataset_upload,
    upload_classifier_weights_chunk,
    upload_dataset,
    upload_dataset_chunk,
)
from backend.app.api.workflow_handlers import (
    batch_modification_sources,
    generation_config,
    generation_results,
    metrics,
    modification_source,
    cancel_running_task,
    classifier_summary,
    sync_workflow_state,
    start_classifier_training,
    start_batch_modification,
    start_generation,
    start_modification,
    task_status,
)
from backend.app.api.ws_handlers import session_stream
from backend.app.config.settings import load_settings
from backend.app.runtime.errors import AppError
from backend.app.runtime.logging import configure_logging, get_logger, log_event
from backend.app.runtime.request import Request, read_body
from backend.app.runtime.response import json_response
from backend.app.runtime.router import Router
from backend.app.services.bootstrap import RuntimeState, bootstrap_runtime, shutdown_runtime


logger = get_logger(__name__)


async def health_handler(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    return json_response(200, {"status": "ok", "service": "tiny-augment-backend", "runtimeDir": str(runtime_state.settings.runtime_dir)})


def build_router() -> Router:
    router = Router()
    router.add_http("GET", "/api/health", health_handler)
    router.add_http("GET", "/api/assets", asset_by_path)
    router.add_http("GET", "/api/datasets", datasets_catalog)
    router.add_http("POST", "/api/datasets/{dataset_id}/activate", activate_dataset)
    router.add_http("PATCH", "/api/datasets/{dataset_id}", rename_dataset)
    router.add_http("DELETE", "/api/datasets/{dataset_id}", delete_dataset)
    router.add_http("GET", "/api/datasets/{dataset_id}/download", download_dataset)
    router.add_http("GET", "/api/jobs", list_global_jobs)
    router.add_http("POST", "/api/jobs/{job_id}/cancel", cancel_global_job_handler)
    router.add_http("POST", "/api/uploads/init", init_dataset_upload)
    router.add_http("GET", "/api/uploads/{upload_id}", get_dataset_upload_status)
    router.add_http("PUT", "/api/uploads/{upload_id}/parts", upload_dataset_chunk)
    router.add_http("POST", "/api/uploads/{upload_id}/complete", complete_dataset_upload)
    router.add_http("DELETE", "/api/uploads/{upload_id}", cancel_dataset_upload)
    router.add_http("POST", "/api/sessions/{session_id}/classifier/weights/init", init_classifier_weights)
    router.add_http("GET", "/api/sessions/{session_id}/classifier/weights/{upload_id}", get_classifier_weights_status)
    router.add_http("PUT", "/api/sessions/{session_id}/classifier/weights/{upload_id}/parts", upload_classifier_weights_chunk)
    router.add_http("POST", "/api/sessions/{session_id}/classifier/weights/{upload_id}/complete", complete_classifier_weights)
    router.add_http("DELETE", "/api/sessions/{session_id}/classifier/weights/{upload_id}", cancel_classifier_weights)
    router.add_http("GET", "/api/sessions/{session_id}/diffusion/lora", list_diffusion_lora_adapters)
    router.add_http("POST", "/api/sessions/{session_id}/diffusion/lora/init", init_diffusion_lora_upload)
    router.add_http("GET", "/api/sessions/{session_id}/diffusion/lora/{upload_id}", get_diffusion_lora_upload_status)
    router.add_http("PUT", "/api/sessions/{session_id}/diffusion/lora/{upload_id}/parts", upload_diffusion_lora_chunk)
    router.add_http("POST", "/api/sessions/{session_id}/diffusion/lora/{upload_id}/complete", complete_diffusion_lora_upload)
    router.add_http("DELETE", "/api/sessions/{session_id}/diffusion/lora/{upload_id}", cancel_diffusion_lora_upload)
    router.add_http("POST", "/api/sessions/upload", upload_dataset)
    router.add_http("GET", "/api/sessions/{session_id}", get_session)
    router.add_http("GET", "/api/sessions/{session_id}/tasks/{task_id}", task_status)
    router.add_http("POST", "/api/sessions/{session_id}/tasks/{task_id}/cancel", cancel_running_task)
    router.add_http("POST", "/api/sessions/{session_id}/dataset/classes", save_classes)
    router.add_http("GET", "/api/sessions/{session_id}/dataset/stats", dataset_stats)
    router.add_http("POST", "/api/sessions/{session_id}/workflow/state", sync_workflow_state)
    router.add_http("GET", "/api/sessions/{session_id}/generation/config", generation_config)
    router.add_http("POST", "/api/sessions/{session_id}/generation", start_generation)
    router.add_http("GET", "/api/sessions/{session_id}/modification/source", modification_source)
    router.add_http("POST", "/api/sessions/{session_id}/modification", start_modification)
    router.add_http("POST", "/api/sessions/{session_id}/modification/batch", start_batch_modification)
    router.add_http("GET", "/api/sessions/{session_id}/augmentation-runs/{run_id}/sources", batch_modification_sources)
    router.add_http("GET", "/api/sessions/{session_id}/results", generation_results)
    router.add_http("POST", "/api/sessions/{session_id}/results/{asset_id}/approve", approve_asset)
    router.add_http("POST", "/api/sessions/{session_id}/results/{asset_id}/reject", reject_asset_handler)
    router.add_http("POST", "/api/sessions/{session_id}/review/finalize", finalize_review)
    router.add_http("POST", "/api/sessions/{session_id}/classifier/train", start_classifier_training)
    router.add_http("GET", "/api/sessions/{session_id}/classifier/summary", classifier_summary)
    router.add_http("GET", "/api/sessions/{session_id}/metrics", metrics)
    router.add_ws("/ws/sessions/{session_id}/stream", session_stream)
    return router


def _require_state(state: object) -> RuntimeState:
    if not isinstance(state, RuntimeState):
        raise RuntimeError("Application state is not initialized")
    return state


class TinyAugmentBackend:
    def __init__(self) -> None:
        self.router = build_router()
        self.state: RuntimeState | None = None
        self.startup_error: str | None = None

    async def __call__(self, scope, receive, send) -> None:
        scope_type = scope["type"]
        if scope_type == "lifespan":
            await self.handle_lifespan(receive, send)
            return
        if scope_type == "http":
            await self.handle_http(scope, receive, send)
            return
        if scope_type == "websocket":
            await self.handle_websocket(scope, receive, send)
            return
        raise RuntimeError(f"Unsupported scope type: {scope_type}")

    async def handle_lifespan(self, receive, send) -> None:
        while True:
            message = await receive()
            message_type = message["type"]
            if message_type == "lifespan.startup":
                settings = load_settings()
                configure_logging(settings.app_log_level)
                log_event(
                    logger,
                    20,
                    "app.startup.begin",
                    runtime_dir=settings.runtime_dir,
                    log_level=settings.app_log_level,
                )
                try:
                    self.state = await bootstrap_runtime(settings)
                    self.startup_error = None
                    log_event(logger, 20, "app.startup.ready", runtime_dir=self.state.settings.runtime_dir)
                    await send({"type": "lifespan.startup.complete"})
                except Exception as error:
                    self.state = None
                    self.startup_error = str(error)
                    log_event(logger, 40, "app.startup.failed", error=str(error))
                    await send({"type": "lifespan.startup.failed", "message": str(error)})
                continue
            if message_type == "lifespan.shutdown":
                if self.state is not None:
                    log_event(logger, 20, "app.shutdown.begin")
                    await shutdown_runtime(self.state)
                    log_event(logger, 20, "app.shutdown.complete")
                await send({"type": "lifespan.shutdown.complete"})
                return

    async def handle_http(self, scope, receive, send) -> None:
        route = self.router.match_http(str(scope["method"]).upper(), str(scope["path"]))
        if route is None:
            await json_response(404, {"message": "Route not found"}).send(send)
            return
        if self.state is None:
            await json_response(503, {"message": self.startup_error or "Application is not ready"}).send(send)
            return
        handler, params = route
        request = Request(scope=scope, body=await read_body(receive))
        try:
            response = await handler(request, params, self.state)
            await response.send(send)
        except AppError as error:
            log_event(
                logger,
                30,
                "http.app_error",
                method=scope["method"],
                path=scope["path"],
                status_code=error.status_code,
                message=error.message,
            )
            await json_response(error.status_code, {"message": error.message}).send(send)
        except Exception as error:
            log_event(
                logger,
                40,
                "http.unhandled_error",
                method=scope["method"],
                path=scope["path"],
                error=str(error),
            )
            await json_response(500, {"message": str(error)}).send(send)

    async def handle_websocket(self, scope, receive, send) -> None:
        route = self.router.match_ws(str(scope["path"]))
        if route is None:
            await send({"type": "websocket.close", "code": 1008})
            return
        if self.state is None:
            await send({"type": "websocket.close", "code": 1011})
            return
        handler, params = route
        websocket_scope = {"scope": scope, "receive": receive, "send": send}
        try:
            await handler(websocket_scope, params, self.state)
        except AppError:
            await send({"type": "websocket.close", "code": 1008})
        except Exception:
            await send({"type": "websocket.close", "code": 1011})


app = TinyAugmentBackend()
