from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import os


@dataclass(frozen=True, slots=True)
class Settings:
    app_host: str
    app_port: int
    postgres_dsn: str
    redis_dsn: str
    runtime_dir: Path
    redis_queue_name: str
    redis_events_prefix: str


def load_settings() -> Settings:
    runtime_dir = Path(os.getenv("APP_RUNTIME_DIR", "runtime_data")).resolve()
    return Settings(
        app_host=os.getenv("APP_HOST", "0.0.0.0"),
        app_port=int(os.getenv("APP_PORT", "8000")),
        postgres_dsn=os.getenv(
            "POSTGRES_DSN",
            "postgresql://tinyaugment:tinyaugment@postgres:5432/tinyaugment",
        ),
        redis_dsn=os.getenv("REDIS_DSN", "redis://redis:6379/0"),
        runtime_dir=runtime_dir,
        redis_queue_name=os.getenv("REDIS_QUEUE_NAME", "tiny_augment:tasks"),
        redis_events_prefix=os.getenv("REDIS_EVENTS_PREFIX", "tiny_augment:events"),
    )
