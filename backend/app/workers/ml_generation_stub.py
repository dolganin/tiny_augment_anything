from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from backend.app.runtime.logging import get_logger, log_event
from backend.app.services.zimage import is_cancellation_requested, write_state


logger = get_logger(__name__)


async def run_stub(bundle, source_path: Path, class_pool: list[str], sample_count: int) -> None:
    log_event(
        logger,
        20,
        "ml_worker.stub.begin",
        run_dir=bundle.run_dir,
        source_path=source_path,
        sample_count=sample_count,
    )
    if not source_path.exists():
        write_state(
            bundle,
            {
                "status": "error",
                "phase": "preparing",
                "progress": 1.0,
                "message": "Source image is missing.",
            },
        )
        return

    payload = source_path.read_bytes()
    results: list[dict[str, Any]] = []
    suffix = source_path.suffix or ".png"

    write_state(
        bundle,
        {
            "status": "running",
            "phase": "runtime_ready",
            "progress": 0.1,
            "message": "Stub runtime готов, начинаю копирование результатов.",
            "generatedCount": 0,
        },
    )

    for index in range(sample_count):
        if is_cancellation_requested(bundle):
            write_state(
                bundle,
                {
                    "status": "cancelled",
                    "phase": "cancelled",
                    "progress": 1.0,
                    "message": "cancelled",
                },
            )
            return
        output_path = bundle.output_dir / f"sample-{index + 1}{suffix}"
        output_path.write_bytes(payload)
        results.append(
            {
                "id": f"sample-{index + 1}",
                "class_name": class_pool[index % len(class_pool)],
                "result_paths": [str(output_path)],
            },
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

    bundle.output_json_path.write_text(
        json.dumps(results, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    log_event(
        logger,
        20,
        "ml_worker.stub.completed",
        run_dir=bundle.run_dir,
        generated_count=sample_count,
    )
    write_state(
        bundle,
        {
            "status": "success",
            "phase": "images_ready",
            "progress": 1.0,
            "message": f"Изображения готовы: {sample_count} файлов.",
            "generatedCount": sample_count,
        },
    )
