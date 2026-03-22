from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import os

from omegaconf import OmegaConf


@dataclass(frozen=True, slots=True)
class Settings:
    app_host: str
    app_port: int
    app_log_level: str
    postgres_dsn: str
    redis_dsn: str
    runtime_dir: Path
    redis_queue_name: str
    redis_events_prefix: str
    executor_mode: str
    executor_python_bin: str
    executor_script_path: Path
    executor_segment_script_path: Path
    executor_segment_model_id: str


def load_settings() -> Settings:
    config_path = Path(os.getenv("APP_CONFIG_PATH", "config/app.yaml")).resolve()
    config = _load_config(config_path)
    runtime_dir = _resolve_path(
        os.getenv("APP_RUNTIME_DIR") or _get_config_value(config, ("storage", "runtime_dir"), "runtime_data"),
        config_path.parent,
    )
    return Settings(
        app_host=str(os.getenv("APP_HOST") or _get_config_value(config, ("app", "host"), "0.0.0.0")),
        app_port=int(os.getenv("APP_PORT") or _get_config_value(config, ("app", "port"), 8000)),
        app_log_level=str(os.getenv("APP_LOG_LEVEL") or _get_config_value(config, ("app", "log_level"), "INFO")),
        postgres_dsn=str(
            os.getenv("POSTGRES_DSN")
            or _get_config_value(
                config,
                ("postgres", "dsn"),
                "postgresql://tinyaugment:tinyaugment@postgres:5432/tinyaugment",
            )
        ),
        redis_dsn=str(os.getenv("REDIS_DSN") or _get_config_value(config, ("redis", "dsn"), "redis://redis:6379/0")),
        runtime_dir=runtime_dir,
        redis_queue_name=str(
            os.getenv("REDIS_QUEUE_NAME") or _get_config_value(config, ("redis", "queue_name"), "tiny_augment:tasks")
        ),
        redis_events_prefix=str(
            os.getenv("REDIS_EVENTS_PREFIX")
            or _get_config_value(config, ("redis", "events_prefix"), "tiny_augment:events")
        ),
        executor_mode=str(os.getenv("EXECUTOR_MODE") or _get_config_value(config, ("executor", "mode"), "stub")),
        executor_python_bin=str(os.getenv("EXECUTOR_PYTHON_BIN") or _get_config_value(config, ("executor", "python_bin"), "python")),
        executor_script_path=_resolve_path(
            os.getenv("EXECUTOR_SCRIPT_PATH") or _get_config_value(config, ("executor", "script_path"), "../scripts_for_gen/generate_zimage_json.py"),
            config_path.parent,
        ),
        executor_segment_script_path=_resolve_path(
            os.getenv("EXECUTOR_SEGMENT_SCRIPT_PATH") or _get_config_value(config, ("executor", "segment_script_path"), "../scripts_for_gen/segment_sam2_json.py"),
            config_path.parent,
        ),
        executor_segment_model_id=str(
            os.getenv("EXECUTOR_SEGMENT_MODEL_ID")
            or _get_config_value(config, ("executor", "segment_model_id"), "facebook/sam2.1-hiera-small")
        ),
    )


def _load_config(config_path: Path) -> dict:
    if not config_path.exists():
        return {}
    loaded = OmegaConf.to_container(OmegaConf.load(config_path), resolve=True)
    return loaded if isinstance(loaded, dict) else {}


def _get_config_value(config: dict, path: tuple[str, ...], default):
    current = config
    for part in path:
        if not isinstance(current, dict) or part not in current:
            return default
        current = current[part]
    return current if current is not None else default


def _resolve_path(raw_path: str | os.PathLike[str], base_dir: Path) -> Path:
    path = Path(raw_path)
    if path.is_absolute():
        return path.resolve()
    return (base_dir / path).resolve()
