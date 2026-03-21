from __future__ import annotations

from mimetypes import guess_type
from pathlib import Path

from backend.app.runtime.errors import AppError
from backend.app.runtime.request import Request
from backend.app.runtime.response import Response, file_response
from backend.app.services.bootstrap import RuntimeState


class StreamFileResponse(Response):
    def __init__(self, file_path: Path, content_type: str) -> None:
        super().__init__(status=200)
        self.file_path = file_path
        self.content_type = content_type

    async def send(self, send) -> None:
        await file_response(send, self.file_path, self.content_type)


async def asset_by_path(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    raw_path = request.query_params.get("path")
    if not raw_path:
        raise AppError(400, "Нужен query-параметр path.")
    resolved_path = (runtime_state.settings.runtime_dir / raw_path).resolve()
    runtime_root = runtime_state.settings.runtime_dir.resolve()
    if runtime_root not in resolved_path.parents and resolved_path != runtime_root:
        raise AppError(403, "Доступ к файлу запрещён.")
    if not resolved_path.exists() or not resolved_path.is_file():
        raise AppError(404, "Файл не найден.")
    content_type = guess_type(resolved_path.name)[0] or "application/octet-stream"
    return StreamFileResponse(resolved_path, content_type)


def _require_state(state: object) -> RuntimeState:
    if not isinstance(state, RuntimeState):
        raise RuntimeError("Runtime state is not available")
    return state
