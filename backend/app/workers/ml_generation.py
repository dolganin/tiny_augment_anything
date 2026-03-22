from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from backend.app.runtime.logging import get_logger, log_event
from backend.app.services.zimage import (
    build_command,
    build_run_bundle_from_dir,
    build_segment_command,
    has_mask_records,
    is_cancellation_requested,
    load_config,
    load_state,
    run_command,
    write_state,
)


logger = get_logger(__name__)


async def execute_ml_generation(runtime_state, task_payload: dict[str, Any]) -> None:
    run_dir_value = task_payload.get("runDir")
    if not isinstance(run_dir_value, str) or not run_dir_value:
        return
    bundle = build_run_bundle_from_dir(Path(run_dir_value))
    manifest = _load_json_dict(bundle.manifest_path)
    config = load_config(bundle)
    sample_count = int(manifest.get("sampleCount", 1))
    source_path = Path(str(manifest.get("sourcePath", "")))
    class_pool = [str(item) for item in manifest.get("classPool", []) if isinstance(item, str)] or ["unknown"]
    area_points = manifest.get("areaPoints")
    if is_cancellation_requested(bundle):
        write_state(bundle, {"status": "cancelled", "phase": "cancelled", "progress": 1.0, "message": "cancelled"})
        return
    if runtime_state.settings.executor_mode == "stub":
        await _run_stub(bundle, source_path, class_pool, sample_count)
        return
    await _run_zimage(runtime_state, bundle, config, sample_count, area_points)


async def _run_zimage(runtime_state, bundle, config: dict[str, Any], sample_count: int, area_points: object) -> None:
    if area_points is not None:
        write_state(bundle, {"status": "running", "phase": "segmenting", "progress": 0.15, "message": "segmenting"})
        try:
            await run_command(
                build_segment_command(runtime_state.settings, bundle),
                bundle,
                expected_outputs=1,
                is_cancelled=lambda: _is_cancelled(bundle),
                on_progress=lambda current_count, expected_count: _write_progress(
                    bundle,
                    phase="segmenting",
                    progress=0.2,
                    message=f"masks {current_count}/{expected_count}",
                    current_count=current_count,
                ),
                stdout_log_path=bundle.segment_stdout_log_path,
                stderr_log_path=bundle.segment_stderr_log_path,
                watch_dir=bundle.masks_dir,
            )
        except RuntimeError as error:
            _write_terminal_state(bundle, error)
            return
        if not has_mask_records(bundle):
            write_state(
                bundle,
                {
                    "status": "error",
                    "phase": "segmenting",
                    "progress": 1.0,
                    "message": "Не удалось построить маску по выбранной области.",
                },
            )
            return
    input_json_path = bundle.segmented_json_path if area_points is not None else bundle.input_json_path
    write_state(bundle, {"status": "running", "phase": "generating", "progress": 0.25, "message": "generating"})
    try:
        await run_command(
            build_command(runtime_state.settings, bundle, config, None, input_json_path),
            bundle,
            expected_outputs=sample_count,
            is_cancelled=lambda: _is_cancelled(bundle),
            on_progress=lambda current_count, expected_count: _write_progress(
                bundle,
                phase="generating",
                progress=min(0.95, 0.25 + current_count / max(expected_count, 1) * 0.65),
                message=f"generated {current_count}/{expected_count}",
                current_count=current_count,
            ),
        )
    except RuntimeError as error:
        _write_terminal_state(bundle, error)
        return
    generated_count = len(list(bundle.output_dir.glob("*.png")))
    write_state(
        bundle,
        {
            "status": "success",
            "phase": "completed",
            "progress": 1.0,
            "message": "completed",
            "generatedCount": generated_count,
        },
    )


async def _run_stub(bundle, source_path: Path, class_pool: list[str], sample_count: int) -> None:
    if not source_path.exists():
        write_state(bundle, {"status": "error", "phase": "preparing", "progress": 1.0, "message": "Source image is missing."})
        return
    payload = source_path.read_bytes()
    results: list[dict[str, Any]] = []
    suffix = source_path.suffix or ".png"
    for index in range(sample_count):
        if is_cancellation_requested(bundle):
            write_state(bundle, {"status": "cancelled", "phase": "cancelled", "progress": 1.0, "message": "cancelled"})
            return
        output_path = bundle.output_dir / f"sample-{index + 1}{suffix}"
        output_path.write_bytes(payload)
        results.append(
            {
                "id": f"sample-{index + 1}",
                "class_name": class_pool[index % len(class_pool)],
                "result_paths": [str(output_path)],
            }
        )
        write_state(
            bundle,
            {
                "status": "running",
                "phase": "generating",
                "progress": (index + 1) / max(sample_count, 1),
                "message": f"generated {index + 1}/{sample_count}",
                "generatedCount": index + 1,
            },
        )
    bundle.output_json_path.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    write_state(bundle, {"status": "success", "phase": "completed", "progress": 1.0, "message": "completed", "generatedCount": sample_count})


async def _write_progress(bundle, *, phase: str, progress: float, message: str, current_count: int) -> None:
    state = load_state(bundle)
    state.update(
        {
            "status": "running",
            "phase": phase,
            "progress": progress,
            "message": message,
            "generatedCount": current_count,
        }
    )
    write_state(bundle, state)


async def _is_cancelled(bundle) -> bool:
    return is_cancellation_requested(bundle)


def _write_terminal_state(bundle, error: RuntimeError) -> None:
    if str(error) == "cancelled":
        write_state(bundle, {"status": "cancelled", "phase": "cancelled", "progress": 1.0, "message": "cancelled"})
        return
    log_event(logger, 40, "ml-worker.generation.failed", run_dir=str(bundle.run_dir), error=str(error))
    write_state(bundle, {"status": "error", "phase": "failed", "progress": 1.0, "message": str(error)})


def _load_json_dict(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    return payload if isinstance(payload, dict) else {}
