from __future__ import annotations

from urllib.parse import quote
from uuid import UUID

from backend.app.runtime.errors import AppError
from backend.app.runtime.request import Request
from backend.app.runtime.response import Response, file_response_with_headers
from backend.app.services.bootstrap import RuntimeState
from backend.app.services.downloads import build_dataset_download_archive


class DatasetDownloadResponse(Response):
    def __init__(self, archive_path, download_name: str) -> None:
        disposition = f"attachment; filename*=UTF-8''{quote(download_name)}".encode("utf-8")
        super().__init__(
            status=200,
            headers=[(b"content-disposition", disposition)],
        )
        self.archive_path = archive_path

    async def send(self, send) -> None:
        await file_response_with_headers(send, self.archive_path, "application/zip", self.headers)


async def download_dataset(request: Request, params: dict[str, str], state: object):
    runtime_state = _require_state(state)
    try:
        dataset_id = UUID(params["dataset_id"])
    except ValueError as error:
        raise AppError(400, "Некорректный datasetId.") from error
    async with runtime_state.database.connection() as connection:
        archive_path, download_name = await build_dataset_download_archive(
            connection=connection,
            runtime_paths=runtime_state.runtime_paths,
            runtime_root=runtime_state.settings.runtime_dir,
            dataset_id=dataset_id,
        )
    return DatasetDownloadResponse(archive_path, download_name)


def _require_state(state: object) -> RuntimeState:
    if not isinstance(state, RuntimeState):
        raise RuntimeError("Runtime state is not available")
    return state
