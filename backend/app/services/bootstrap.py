from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Awaitable, Callable

from redis.asyncio import Redis

from backend.app.config.settings import Settings
from backend.app.runtime.logging import get_logger, log_event
from backend.app.services.filesystem import RuntimePaths, build_runtime_paths, ensure_runtime_layout


logger = get_logger(__name__)


@dataclass(slots=True)
class RuntimeState:
    settings: Settings
    database: Database
    redis: Redis
    runtime_paths: RuntimePaths


@dataclass(slots=True)
class MLRuntimeState:
    settings: Settings
    redis: Redis
    runtime_paths: RuntimePaths


async def _retry_async(label: str, operation: Callable[[], Awaitable[None]], *, attempts: int = 30, delay_seconds: float = 1.0) -> None:
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            await operation()
            if attempt > 1:
                log_event(logger, 20, "bootstrap.retry.succeeded", target=label, attempt=attempt)
            return
        except Exception as error:
            last_error = error
            log_event(
                logger,
                30,
                "bootstrap.retry.failed",
                target=label,
                attempt=attempt,
                attempts=attempts,
                delaySeconds=delay_seconds,
                error=str(error),
            )
            if attempt >= attempts:
                break
            await asyncio.sleep(delay_seconds)
    assert last_error is not None
    raise last_error


async def bootstrap_runtime(settings: Settings) -> RuntimeState:
    from backend.app.storage.postgres import Database

    runtime_paths = build_runtime_paths(settings)
    ensure_runtime_layout(runtime_paths)
    database = Database(settings.postgres_dsn)
    await _retry_async("postgres.initialize", database.initialize)
    redis = Redis.from_url(settings.redis_dsn, decode_responses=True)
    await _retry_async("redis.ping", redis.ping)
    return RuntimeState(
        settings=settings,
        database=database,
        redis=redis,
        runtime_paths=runtime_paths,
    )


async def bootstrap_ml_runtime(settings: Settings) -> MLRuntimeState:
    runtime_paths = build_runtime_paths(settings)
    ensure_runtime_layout(runtime_paths)
    redis = Redis.from_url(settings.redis_dsn, decode_responses=True)
    await _retry_async("redis.ping", redis.ping)
    return MLRuntimeState(
        settings=settings,
        redis=redis,
        runtime_paths=runtime_paths,
    )


async def shutdown_runtime(state: RuntimeState) -> None:
    await state.redis.aclose()


async def shutdown_ml_runtime(state: MLRuntimeState) -> None:
    await state.redis.aclose()
