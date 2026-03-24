from __future__ import annotations

from pathlib import Path
from uuid import UUID

from backend.app.domain.enums import AssetOrigin, WorkflowStage
from backend.app.repositories.workflow_assets import create_asset_link, create_candidate_asset
from backend.app.services.filesystem import dataset_generated_dir, dataset_modified_dir, make_relative_path
from backend.app.services.zimage import load_results
from backend.app.workers.shared import checksum_bytes, load_binary


async def index_generated_results(
    *,
    connection,
    runtime_state,
    run_id: UUID,
    task_id: UUID,
    mode: str,
    dataset_id: UUID,
    parent_asset_id: UUID,
    class_pool: list[str],
    bundle,
) -> int:
    results = load_results(bundle)
    output_root = (
        dataset_generated_dir(runtime_state.runtime_paths, dataset_id)
        if mode == WorkflowStage.GENERATE.value
        else dataset_modified_dir(runtime_state.runtime_paths, dataset_id)
    )
    output_root.mkdir(parents=True, exist_ok=True)
    produced_count = 0
    for item in results:
        class_name = str(item.get("class_name") or class_pool[0])
        result_paths = item.get("result_paths")
        if not isinstance(result_paths, list):
            continue
        target_dir = output_root / class_name
        target_dir.mkdir(parents=True, exist_ok=True)
        for raw_path in result_paths:
            result_path = Path(str(raw_path))
            if not result_path.exists():
                continue
            produced_count += 1
            target_path = target_dir / f"{task_id}-{parent_asset_id}-{produced_count}{result_path.suffix or '.png'}"
            target_path.write_bytes(result_path.read_bytes())
            target_bytes = load_binary(target_path)
            relative_path = make_relative_path(runtime_state.settings.runtime_dir, target_path)
            asset_id = await create_candidate_asset(
                connection,
                dataset_id=dataset_id,
                class_name=class_name,
                origin_type=AssetOrigin.GENERATED if mode == WorkflowStage.GENERATE.value else AssetOrigin.MODIFIED,
                storage_path=relative_path,
                preview_path=relative_path,
                checksum=checksum_bytes(target_bytes),
                source_run_id=run_id,
            )
            await create_asset_link(connection, asset_id, parent_asset_id)
    return produced_count
