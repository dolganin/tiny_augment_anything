from __future__ import annotations

import re

from backend.app.services.classifier_runtime import write_state
from backend.app.workers.ml_classifier_runtime import load_json_dict


EPOCH_RE = re.compile(r"Epoch\s+(?P<epoch>\d+)\s+\|\s+Val Loss:\s+(?P<loss>[0-9.]+)\s+\|\s+Val F1 Macro:\s+(?P<f1>[0-9.]+)")
EPOCH_PROGRESS_RE = re.compile(r"Epoch=(?P<epoch>\d+):\s+(?P<percent>\d+)%")
TORCH_WARNING_RE = re.compile(r"^[WE]\d{4}\s+\d{2}:\d{2}:\d{2}\.\d+")


async def consume_stdout(process, bundle, stdout_file, total_epochs: int) -> None:
    assert process.stdout is not None
    progress_state: dict[int, int] = {}
    while True:
        line = await process.stdout.readline()
        if not line:
            return
        text = line.decode("utf-8", errors="ignore")
        stdout_file.write(text)
        stdout_file.flush()
        for stripped in extract_log_chunks(text):
            match = EPOCH_RE.search(stripped)
            if match:
                epoch = int(match.group("epoch"))
                progress = min(0.95, 0.15 + 0.8 * (epoch / max(total_epochs, 1)))
                write_state(
                    bundle,
                    {
                        "status": "running",
                        "phase": "training",
                        "progress": progress,
                        "message": stripped,
                        "epoch": epoch,
                        "totalEpochs": total_epochs,
                        "valLoss": float(match.group("loss")),
                        "valF1Macro": float(match.group("f1")),
                    },
                )
                continue

            progress_update = build_epoch_progress_message(stripped, progress_state, total_epochs)
            if progress_update is not None:
                epoch, message = progress_update
                overall_progress = min(
                    0.94,
                    0.18 + 0.72 * ((epoch - 1) / max(total_epochs, 1)) + 0.04 * (progress_state[epoch] / 100),
                )
                write_runtime_line(
                    bundle,
                    "training",
                    message,
                    total_epochs,
                    progress=overall_progress,
                    epoch=epoch,
                )
                continue

            cleaned = clean_runtime_message(stripped)
            if cleaned:
                write_runtime_line(bundle, "bootstrapping", cleaned, total_epochs, progress=0.2)


async def consume_stderr(process, bundle, stderr_file, total_epochs: int) -> None:
    assert process.stderr is not None
    progress_state: dict[int, int] = {}
    while True:
        line = await process.stderr.readline()
        if not line:
            return
        text = line.decode("utf-8", errors="ignore")
        stderr_file.write(text)
        stderr_file.flush()
        for stripped in extract_log_chunks(text):
            progress_update = build_epoch_progress_message(stripped, progress_state, total_epochs)
            if progress_update is not None:
                epoch, message = progress_update
                overall_progress = min(
                    0.94,
                    0.18 + 0.72 * ((epoch - 1) / max(total_epochs, 1)) + 0.04 * (progress_state[epoch] / 100),
                )
                write_runtime_line(
                    bundle,
                    "training",
                    message,
                    total_epochs,
                    progress=overall_progress,
                    epoch=epoch,
                )
                continue
            cleaned = clean_runtime_message(stripped)
            if cleaned:
                write_runtime_line(bundle, "bootstrapping", cleaned, total_epochs, progress=0.2)


def write_runtime_line(
    bundle,
    phase: str,
    message: str,
    total_epochs: int,
    *,
    progress: float,
    epoch: int | None = None,
) -> None:
    current_state = load_json_dict(bundle.state_path)
    current_epoch = epoch if epoch is not None else int(current_state.get("epoch") or 0)
    current_progress = max(progress, float(current_state.get("progress") or 0.0))
    write_state(
        bundle,
        {
            "status": "running",
            "phase": phase,
            "progress": current_progress,
            "message": message[:4000],
            "epoch": current_epoch,
            "totalEpochs": total_epochs,
        },
    )


def extract_log_chunks(text: str) -> list[str]:
    chunks = []
    for raw_chunk in re.split(r"[\r\n]+", text):
        stripped = raw_chunk.strip()
        if stripped:
            chunks.append(stripped)
    return chunks


def build_epoch_progress_message(
    stripped: str,
    progress_state: dict[int, int],
    total_epochs: int,
) -> tuple[int, str] | None:
    match = EPOCH_PROGRESS_RE.search(stripped)
    if match is None:
        return None
    epoch = int(match.group("epoch"))
    percent = int(match.group("percent"))
    previous = progress_state.get(epoch, -1)
    if percent < 0 or percent > 100:
        return None
    if percent < 1 and previous >= 0:
        return None
    if previous >= 0 and percent < previous:
        return None
    if previous >= 0 and percent < 100 and percent - previous < 10:
        return None
    progress_state[epoch] = percent
    return epoch, f"Эпоха {epoch}/{max(total_epochs, 1)}: обработано {percent}% батчей."


def clean_runtime_message(stripped: str) -> str | None:
    if stripped.startswith("export GIT_PYTHON_REFRESH=quiet"):
        return None
    if "it/s" in stripped and "Epoch=" in stripped:
        return None
    if TORCH_WARNING_RE.match(stripped):
        if "Not enough SMs to use max_autotune_gemm mode" in stripped:
            return "Torch предупреждение: max_autotune_gemm недоступен на текущем GPU, продолжаю со стандартным режимом."
        return f"Torch предупреждение: {stripped.split(']')[-1].strip()}"
    return stripped
