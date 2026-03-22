from __future__ import annotations

from dataclasses import dataclass

from redis.asyncio import Redis

from backend.app.config.settings import Settings
from backend.app.services.filesystem import RuntimePaths, build_runtime_paths, ensure_runtime_layout


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


async def bootstrap_runtime(settings: Settings) -> RuntimeState:
    from backend.app.storage.postgres import Database

    runtime_paths = build_runtime_paths(settings)
    ensure_runtime_layout(runtime_paths)
    database = Database(settings.postgres_dsn)
    await database.initialize()
    redis = Redis.from_url(settings.redis_dsn, decode_responses=True)
    await redis.ping()
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
    await redis.ping()
    return MLRuntimeState(
        settings=settings,
        redis=redis,
        runtime_paths=runtime_paths,
    )


async def shutdown_runtime(state: RuntimeState) -> None:
    await state.redis.aclose()


async def shutdown_ml_runtime(state: MLRuntimeState) -> None:
    await state.redis.aclose()
