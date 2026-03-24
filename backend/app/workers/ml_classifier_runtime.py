from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any


def build_command(settings, config: dict[str, Any], bundle) -> list[str]:
    hparams = config.get("hparams", {})
    class_names = [str(item) for item in config.get("classNames", []) if isinstance(item, str)]
    hydra_run_dir = bundle.run_dir / "hydra_output"
    command = [
        settings.classifier_uv_bin,
        "run",
        "--frozen",
        "do-finetune",
        f"model={config['modelKey']}",
        "model.object._target_=backend.app.services.classifier_head_override.build_model",
        f"model.object.num_classes={len(class_names)}",
        f"dataloader.train_root={config['trainRoot']}",
        f"dataloader.val_root={config['valRoot']}",
        f"dataloader.train_batch_size={int(hparams.get('train_batch_size', 32))}",
        f"dataloader.val_batch_size={int(hparams.get('val_batch_size', 64))}",
        "dataloader.sampler_type=balanced",
        "dataloader.weights_root=null",
        f"dataloader.num_workers={1}",
        f"optimizer.lr={float(hparams.get('learning_rate', 3e-4))}",
        f"optimizer.weight_decay={float(hparams.get('weight_decay', 1e-6))}",
        f"train.epochs={int(hparams.get('epochs', 10))}",
        f"train.checkpoint_path={bundle.checkpoints_dir}",
        f"hydra.run.dir={hydra_run_dir}",
    ]
    pretrained_weights_path = config.get("pretrainedWeightsPath")
    if isinstance(pretrained_weights_path, str) and pretrained_weights_path:
        command.append("model.object.pretrained=false")
        command.append(f"model.model_path.local_checkpoint_path={pretrained_weights_path}")
    return command


def validate_classifier_environment(settings, env: dict[str, str]) -> str | None:
    pipeline_root = Path(settings.classifier_pipeline_root)
    pyproject_path = pipeline_root / "pyproject.toml"
    src_root = pipeline_root / "src" / "tiny_augment"
    uv_path = shutil.which(settings.classifier_uv_bin)
    compiler_path = shutil.which(Path(env.get("CC", "")).name) or (
        env.get("CC") if env.get("CC") and Path(env["CC"]).exists() else None
    )
    project_env = Path(env.get("UV_PROJECT_ENVIRONMENT", "")).resolve() if env.get("UV_PROJECT_ENVIRONMENT") else None

    if uv_path is None:
        return "Classifier environment is incomplete: uv binary is not available in ml-worker."
    if not pyproject_path.exists():
        return f"Classifier environment is incomplete: {pyproject_path} is missing."
    if not src_root.exists():
        return f"Classifier environment is incomplete: {src_root} is missing."
    if compiler_path is None:
        return "Classifier environment is incomplete: C compiler is not available in ml-worker."
    if project_env is not None and not project_env.exists():
        return f"Classifier environment is incomplete: virtualenv {project_env} is missing. Rebuild ml-worker image."
    return None


def load_json_dict(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    return payload if isinstance(payload, dict) else {}


def read_log_tail(path: Path, limit: int = 3000) -> str:
    if not path.exists():
        return ""
    content = path.read_text(encoding="utf-8", errors="ignore")
    return content[-limit:].strip()
