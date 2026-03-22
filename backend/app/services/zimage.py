from __future__ import annotations

import asyncio
import json
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from uuid import UUID

from backend.app.config.settings import Settings
from backend.app.runtime.logging import get_logger, log_event
from backend.app.services.filesystem import RuntimePaths


logger = get_logger(__name__)


@dataclass(frozen=True, slots=True)
class ZImageRunBundle:
    run_dir: Path
    input_json_path: Path
    segmented_json_path: Path
    output_json_path: Path
    masks_dir: Path
    output_dir: Path
    stdout_log_path: Path
    stderr_log_path: Path
    segment_stdout_log_path: Path
    segment_stderr_log_path: Path


def build_run_bundle(paths: RuntimePaths, task_id: UUID) -> ZImageRunBundle:
    run_dir = paths.temp / "runs" / "zimage" / str(task_id)
    return ZImageRunBundle(
        run_dir=run_dir,
        input_json_path=run_dir / "input.json",
        segmented_json_path=run_dir / "segmented.json",
        output_json_path=run_dir / "output.json",
        masks_dir=run_dir / "masks",
        output_dir=run_dir / "generated",
        stdout_log_path=run_dir / "stdout.log",
        stderr_log_path=run_dir / "stderr.log",
        segment_stdout_log_path=run_dir / "segment_stdout.log",
        segment_stderr_log_path=run_dir / "segment_stderr.log",
    )


def prepare_run_bundle(bundle: ZImageRunBundle, records: list[dict[str, Any]]) -> None:
    bundle.run_dir.mkdir(parents=True, exist_ok=True)
    bundle.masks_dir.mkdir(parents=True, exist_ok=True)
    bundle.output_dir.mkdir(parents=True, exist_ok=True)
    bundle.input_json_path.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")


def build_records(
    source_path: Path,
    class_names: list[str],
    prompt: str,
    sample_count: int,
    config: dict[str, Any],
    area_box: list[float] | None = None,
) -> list[dict[str, Any]]:
    negative_prompt = str(config.get("negative_prompt", "")).strip()
    base_seed = int(_get_number(config, "seed", 42))
    strength = _get_number(config, "strength", 0.6)
    steps = int(_get_number(config, "num_inference_steps", 9))
    guidance = _get_number(config, "guidance_scale", 0.0)
    records: list[dict[str, Any]] = []
    for index in range(sample_count):
        class_name = class_names[index % len(class_names)]
        record: dict[str, Any] = {
            "id": f"sample-{index + 1}",
            "org_img": str(source_path),
            "gen_prompt": prompt,
            "strength": strength,
            "num_inference_steps": steps,
            "guidance_scale": guidance,
            "seed": base_seed + index,
            "class_name": class_name,
        }
        if negative_prompt:
            record["negative_prompt"] = negative_prompt
        if area_box is not None:
            record["area_box"] = [int(round(value)) for value in area_box]
        records.append(record)
    return records


def build_segment_command(settings: Settings, bundle: ZImageRunBundle) -> list[str]:
    return [
        settings.executor_python_bin,
        str(settings.executor_segment_script_path),
        "--input-json",
        str(bundle.input_json_path),
        "--output-json",
        str(bundle.segmented_json_path),
        "--mask-dir",
        str(bundle.masks_dir),
        "--model-id",
        settings.executor_segment_model_id,
    ]


def build_command(
    settings: Settings,
    bundle: ZImageRunBundle,
    config: dict[str, Any],
    lora_path: Path | None,
    input_json_path: Path,
) -> list[str]:
    command = [
        settings.executor_python_bin,
        str(settings.executor_script_path),
        "--input-json",
        str(input_json_path),
        "--output-json",
        str(bundle.output_json_path),
        "--output-dir",
        str(bundle.output_dir),
        "--model-id",
        str(config.get("model_id", "Tongyi-MAI/Z-Image-Turbo")),
        "--size",
        str(int(_get_number(config, "size", 1024))),
        "--default-strength",
        str(_get_number(config, "strength", 0.6)),
        "--default-inpaint-strength",
        str(_get_number(config, "inpaint_strength", 1.0)),
        "--default-steps",
        str(int(_get_number(config, "num_inference_steps", 9))),
        "--default-guidance-scale",
        str(_get_number(config, "guidance_scale", 0.0)),
        "--seed",
        str(int(_get_number(config, "seed", 42))),
    ]
    if lora_path is not None:
        command.extend(["--lora-path", str(lora_path), "--lora-scale", str(_get_number(config, "lora_scale", 1.0))])
    return command


async def run_command(
    command: list[str],
    bundle: ZImageRunBundle,
    *,
    expected_outputs: int,
    is_cancelled: Callable[[], Awaitable[bool]],
    on_progress: Callable[[int, int], Awaitable[None]],
    stdout_log_path: Path | None = None,
    stderr_log_path: Path | None = None,
    watch_dir: Path | None = None,
) -> None:
    stdout_path = stdout_log_path or bundle.stdout_log_path
    stderr_path = stderr_log_path or bundle.stderr_log_path
    progress_dir = watch_dir or bundle.output_dir
    with stdout_path.open("w", encoding="utf-8") as stdout_file, stderr_path.open("w", encoding="utf-8") as stderr_file:
        process = await asyncio.create_subprocess_exec(*command, stdout=stdout_file, stderr=stderr_file)
        last_count = -1
        while True:
            if process.returncode is not None:
                break
            if await is_cancelled():
                process.terminate()
                await process.wait()
                raise RuntimeError("cancelled")
            current_count = len(list(progress_dir.glob("*.png")))
            if current_count != last_count:
                last_count = current_count
                await on_progress(current_count, expected_outputs)
            try:
                await asyncio.wait_for(process.wait(), timeout=1)
            except TimeoutError:
                continue
        if process.returncode != 0:
            stderr_tail = read_log_tail(stderr_path)
            stdout_tail = read_log_tail(stdout_path)
            log_event(
                logger,
                40,
                "executor.zimage.failed",
                command=command,
                return_code=process.returncode,
                stderr=stderr_tail,
                stdout=stdout_tail,
            )
            raise RuntimeError(stderr_tail or stdout_tail or f"Процесс генерации завершился с кодом {process.returncode}.")


def load_results(bundle: ZImageRunBundle) -> list[dict[str, Any]]:
    if not bundle.output_json_path.exists():
        raise RuntimeError("После выполнения генератора не найден output.json.")
    payload = json.loads(bundle.output_json_path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise RuntimeError("output.json должен содержать список записей.")
    return [item for item in payload if isinstance(item, dict)]


def has_mask_records(bundle: ZImageRunBundle) -> bool:
    if not bundle.segmented_json_path.exists():
        return False
    payload = json.loads(bundle.segmented_json_path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        return False
    for item in payload:
        if not isinstance(item, dict):
            continue
        mask_path = item.get("mask_path")
        mask_paths = item.get("mask_paths")
        if isinstance(mask_path, str) and mask_path:
            return True
        if isinstance(mask_paths, list) and any(isinstance(path, str) and path for path in mask_paths):
            return True
    return False


def read_log_tail(path: Path, limit: int = 3000) -> str:
    if not path.exists():
        return ""
    content = path.read_text(encoding="utf-8", errors="ignore")
    return content[-limit:].strip()


def _get_number(config: dict[str, Any], key: str, default: float) -> float:
    value = config.get(key, default)
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        return float(value)
    return float(default)
