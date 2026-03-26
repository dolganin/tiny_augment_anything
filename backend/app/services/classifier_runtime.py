from __future__ import annotations

import json
import os
import shutil
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID

from backend.app.domain.enums import AssetOrigin
from backend.app.services.filesystem import RuntimePaths


@dataclass(frozen=True, slots=True)
class ClassifierRunBundle:
    run_dir: Path
    data_dir: Path
    train_dir: Path
    val_dir: Path
    weights_dir: Path
    checkpoints_dir: Path
    state_path: Path
    config_path: Path
    metrics_path: Path
    stdout_log_path: Path
    stderr_log_path: Path
    cancel_signal_path: Path


def build_classifier_bundle(paths: RuntimePaths, task_id: UUID) -> ClassifierRunBundle:
    run_dir = paths.temp / "runs" / "classifier" / str(task_id)
    return build_classifier_bundle_from_dir(run_dir)


def build_classifier_bundle_from_dir(run_dir: Path) -> ClassifierRunBundle:
    return ClassifierRunBundle(
        run_dir=run_dir,
        data_dir=run_dir / "data" / "fine_tune",
        train_dir=run_dir / "data" / "fine_tune" / "train",
        val_dir=run_dir / "data" / "fine_tune" / "val",
        weights_dir=run_dir / "weights",
        checkpoints_dir=run_dir / "checkpoints",
        state_path=run_dir / "state.json",
        config_path=run_dir / "config.json",
        metrics_path=run_dir / "metrics.json",
        stdout_log_path=run_dir / "stdout.log",
        stderr_log_path=run_dir / "stderr.log",
        cancel_signal_path=run_dir / "cancel.signal",
    )


def prepare_classifier_bundle(bundle: ClassifierRunBundle, payload: dict) -> None:
    for directory in (
        bundle.run_dir,
        bundle.data_dir,
        bundle.train_dir,
        bundle.val_dir,
        bundle.weights_dir,
        bundle.checkpoints_dir,
    ):
        directory.mkdir(parents=True, exist_ok=True)
    bundle.config_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    write_state(
        bundle,
        {"status": "pending", "phase": "queued", "progress": 0.0, "message": "queued"},
    )
    if bundle.cancel_signal_path.exists():
        bundle.cancel_signal_path.unlink()


def load_state(bundle: ClassifierRunBundle) -> dict:
    if not bundle.state_path.exists():
        return {}
    payload = json.loads(bundle.state_path.read_text(encoding="utf-8"))
    return payload if isinstance(payload, dict) else {}


def write_state(bundle: ClassifierRunBundle, payload: dict) -> None:
    bundle.state_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def request_cancellation(bundle: ClassifierRunBundle) -> None:
    bundle.cancel_signal_path.write_text("cancelled", encoding="utf-8")


def is_cancellation_requested(bundle: ClassifierRunBundle) -> bool:
    return bundle.cancel_signal_path.exists()


def save_pretrained_weights(
    bundle: ClassifierRunBundle,
    file_name: str,
    payload: bytes,
) -> Path:
    bundle.weights_dir.mkdir(parents=True, exist_ok=True)
    target_path = bundle.weights_dir / file_name
    target_path.write_bytes(payload)
    return target_path


def prepare_training_layout(
    bundle: ClassifierRunBundle,
    runtime_root: Path,
    assets: list[dict],
    *,
    val_ratio: float,
) -> dict[str, int]:
    split = analyze_training_layout(assets, val_ratio=val_ratio)
    originals_by_class = split["originalsByClass"]
    synthetic_by_class = split["syntheticsByClass"]
    class_names = split["classNames"]
    common_val_count = int(split["commonValCount"])
    train_count = 0
    val_count = 0

    for class_name in class_names:
        originals = originals_by_class[class_name]
        synthetics = synthetic_by_class[class_name]
        per_class_val_count = _resolve_per_class_val_count(len(originals), common_val_count)

        val_assets = originals[:per_class_val_count]
        train_assets = originals[per_class_val_count:] + synthetics

        if not train_assets:
            train_assets = originals[per_class_val_count:]

        for index, asset in enumerate(train_assets):
            source_path = runtime_root / Path(str(asset["storage_path"]))
            suffix = source_path.suffix or ".png"
            target_path = bundle.train_dir / class_name / f"{asset['id']}_{index}{suffix}"
            _materialize_asset(source_path, target_path)
            train_count += 1

        for index, asset in enumerate(val_assets):
            source_path = runtime_root / Path(str(asset["storage_path"]))
            suffix = source_path.suffix or ".png"
            target_path = bundle.val_dir / class_name / f"{asset['id']}_{index}{suffix}"
            _materialize_asset(source_path, target_path)
            val_count += 1

    return {"trainCount": train_count, "valCount": val_count, "classCount": len(class_names)}


def _is_synthetic_asset(asset: dict) -> bool:
    if asset["origin_type"] != AssetOrigin.ORIGINAL.value:
        return True

    storage_path = str(asset.get("storage_path", ""))
    preview_path = str(asset.get("preview_path", ""))

    storage_filename = Path(storage_path).name.lower() if storage_path else ""
    preview_filename = Path(preview_path).name.lower() if preview_path else ""

    return "gen" in storage_filename or "gen" in preview_filename


def analyze_training_layout(
    assets: list[dict],
    *,
    val_ratio: float,
) -> dict[str, object]:
    originals_by_class: dict[str, list[dict]] = defaultdict(list)
    synthetic_by_class: dict[str, list[dict]] = defaultdict(list)

    for asset in assets:
        class_name = str(asset["class_name"])
        is_synthetic = _is_synthetic_asset(asset)
        if is_synthetic:
            synthetic_by_class[class_name].append(asset)
        else:
            originals_by_class[class_name].append(asset)

    class_names = sorted(set(originals_by_class) | set(synthetic_by_class))
    original_counts = [len(originals_by_class[class_name]) for class_name in class_names if originals_by_class[class_name]]
    if not original_counts:
        raise RuntimeError("Для обучения классификатора не найдено ни одного исходного изображения.")

    per_class: list[dict[str, int | str]] = []
    for class_name in class_names:
        original_count = len(originals_by_class[class_name])
        synthetic_count = len(synthetic_by_class[class_name])
        total_count = original_count + synthetic_count
        if original_count == 0:
            raise RuntimeError(
                f"Класс {class_name} содержит только синтетику. Для честной валидации нужен минимум один исходный пример."
            )
        if total_count < 2:
            raise RuntimeError(
                f"Класс {class_name} содержит только один пример. Для train/val split нужно минимум два изображения "
                "или одно исходное и одно синтетическое."
            )

    common_val_count = _resolve_common_val_count(original_counts, val_ratio)
    for class_name in class_names:
        original_count = len(originals_by_class[class_name])
        synthetic_count = len(synthetic_by_class[class_name])
        val_count = _resolve_per_class_val_count(original_count, common_val_count)
        train_original_count = max(0, original_count - val_count)
        train_count = train_original_count + synthetic_count
        per_class.append(
            {
                "className": class_name,
                "originalCount": original_count,
                "syntheticCount": synthetic_count,
                "trainCount": train_count,
                "valCount": val_count,
            }
        )

    return {
        "classNames": class_names,
        "originalsByClass": originals_by_class,
        "syntheticsByClass": synthetic_by_class,
        "commonValCount": common_val_count,
        "perClass": per_class,
        "trainCount": sum(int(item["trainCount"]) for item in per_class),
        "valCount": sum(int(item["valCount"]) for item in per_class),
        "classCount": len(class_names),
    }


def read_metrics(bundle: ClassifierRunBundle) -> dict:
    candidate_paths = [bundle.metrics_path, bundle.checkpoints_dir / "best_metrics.json"]
    if bundle.checkpoints_dir.exists():
        candidate_paths.extend(
            sorted(
                (
                    path
                    for path in bundle.checkpoints_dir.rglob("best_metrics.json")
                    if path.is_file()
                ),
                key=lambda path: (-path.stat().st_mtime, str(path)),
            )
        )

    for path in candidate_paths:
        if not path.exists():
            continue
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            continue
        if path != bundle.metrics_path:
            bundle.metrics_path.write_text(
                json.dumps(payload, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        return payload
    return {}


def resolve_checkpoint_path(bundle: ClassifierRunBundle) -> Path | None:
    if not bundle.checkpoints_dir.exists():
        return None
    candidates = [
        path
        for path in bundle.checkpoints_dir.rglob("*")
        if path.is_file() and path.suffix.lower() in {".ckpt", ".pt", ".pth", ".bin", ".safetensors"}
    ]
    if not candidates:
        return None
    prioritized = sorted(
        candidates,
        key=lambda path: (
            0 if "best" in path.name.lower() else 1,
            -path.stat().st_mtime,
            path.name,
        ),
    )
    return prioritized[0]


def _resolve_common_val_count(original_counts: list[int], val_ratio: float) -> int:
    min_count = min(original_counts)
    if min_count <= 1:
        return 1
    requested = max(1, int(round(min_count * val_ratio)))
    return min(requested, min_count - 1)


def _resolve_per_class_val_count(original_count: int, common_val_count: int) -> int:
    if original_count <= 1:
        return 1
    return min(common_val_count, original_count - 1)


def _materialize_asset(source_path: Path, target_path: Path) -> None:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    if target_path.exists():
        target_path.unlink()
    try:
        os.link(source_path, target_path)
    except OSError:
        shutil.copy2(source_path, target_path)
