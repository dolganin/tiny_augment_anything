from __future__ import annotations

from pathlib import Path
import re
from uuid import UUID

from backend.app.repositories.catalog import get_dataset_export_context
from backend.app.repositories.workflow_assets import list_active_assets
from backend.app.repositories.workflow_session import update_session_download_path
from backend.app.runtime.errors import AppError
from backend.app.services.filesystem import RuntimePaths, dataset_exports_dir
from backend.app.workers.shared import export_dataset_archive


async def build_dataset_download_archive(
    connection,
    runtime_paths: RuntimePaths,
    runtime_root: Path,
    dataset_id: UUID,
) -> tuple[Path, str]:
    context = await get_dataset_export_context(connection, dataset_id)
    if context is None or context["current_dataset_version_id"] is None:
        raise AppError(404, "Датасет не готов к скачиванию.")
    version_id = context["current_dataset_version_id"]
    rows = await list_active_assets(connection, dataset_id, version_id)
    if not rows:
        raise AppError(404, "В датасете нет файлов для выгрузки.")
    dataset_name = str(context["dataset_name"])
    version_index = int(context["version_index"])
    archive_name = _build_archive_name(dataset_name, version_index)
    archive_path = dataset_exports_dir(runtime_paths, dataset_id) / archive_name
    items = [
        (runtime_root / Path(row["storage_path"]), str(row["class_name"]))
        for row in rows
    ]
    export_dataset_archive(archive_path, items)
    relative_path = archive_path.relative_to(runtime_root).as_posix()
    await update_session_download_path(connection, context["session_id"], relative_path)
    return archive_path, archive_name


def _build_archive_name(dataset_name: str, version_index: int) -> str:
    normalized = re.sub(r"[^0-9A-Za-zА-Яа-я._-]+", "-", dataset_name).strip("-._")
    base_name = normalized or "dataset"
    return f"{base_name}-v{version_index}.zip"
