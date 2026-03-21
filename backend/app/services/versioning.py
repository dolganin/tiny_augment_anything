from __future__ import annotations

import json
from pathlib import Path
from uuid import UUID

from backend.app.repositories.workflow_assets import build_version_summary, list_active_assets, update_version_manifest_path
from backend.app.services.filesystem import dataset_manifest_dir


async def write_version_manifest(connection, runtime_paths, runtime_root: Path, dataset_id: UUID, version_id: UUID) -> None:
    summary = await build_version_summary(connection, dataset_id, version_id)
    assets = await list_active_assets(connection, dataset_id, version_id)
    manifest_dir = dataset_manifest_dir(runtime_paths, dataset_id)
    manifest_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = manifest_dir / f"{version_id}.json"
    manifest_path.write_text(
        json.dumps(
            {
                "datasetId": str(dataset_id),
                "versionId": str(version_id),
                "summary": summary,
                "assets": [
                    {
                        "id": str(item["id"]),
                        "className": item["class_name"],
                        "storagePath": item["storage_path"],
                    }
                    for item in assets
                ],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    await update_version_manifest_path(connection, version_id, manifest_path.relative_to(runtime_root).as_posix(), summary)
