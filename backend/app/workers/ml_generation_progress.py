from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from backend.app.runtime.logging import get_logger, log_event
from backend.app.services.zimage import is_cancellation_requested, write_state


logger = get_logger(__name__)


async def write_progress(
    bundle,
    *,
    phase: str,
    progress: float,
    message: str,
    current_count: int,
) -> None:
    state = load_json_dict(bundle.state_path)
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


async def is_cancelled(bundle) -> bool:
    return is_cancellation_requested(bundle)


def write_terminal_state(bundle, error: RuntimeError) -> None:
    if str(error) == "cancelled":
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

    log_event(
        logger,
        40,
        "ml-worker.generation.failed",
        run_dir=str(bundle.run_dir),
        error=str(error),
    )
    write_state(
        bundle,
        {
            "status": "error",
            "phase": "failed",
            "progress": 1.0,
            "message": str(error),
        },
    )


def load_json_dict(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    return payload if isinstance(payload, dict) else {}


def load_json_list(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        return []
    return [item for item in payload if isinstance(item, dict)]
