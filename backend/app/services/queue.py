from __future__ import annotations

import json
from typing import Any

from backend.app.config.settings import Settings


async def enqueue_core_task(redis, settings: Settings, payload: dict[str, Any]) -> None:
    await _enqueue(redis, settings.redis_core_queue_name, payload)


async def enqueue_ml_task(redis, settings: Settings, payload: dict[str, Any]) -> None:
    await _enqueue(redis, settings.redis_ml_queue_name, payload)


async def dequeue_core_task(redis, settings: Settings) -> dict[str, Any] | None:
    return await _dequeue(redis, settings.redis_core_queue_name)


async def dequeue_ml_task(redis, settings: Settings) -> dict[str, Any] | None:
    return await _dequeue(redis, settings.redis_ml_queue_name)


async def remove_core_queued_task(redis, settings: Settings, payload: dict[str, Any]) -> None:
    await _remove(redis, settings.redis_core_queue_name, payload)


async def remove_ml_queued_task(redis, settings: Settings, payload: dict[str, Any]) -> None:
    await _remove(redis, settings.redis_ml_queue_name, payload)


async def _enqueue(redis, queue_name: str, payload: dict[str, Any]) -> None:
    await redis.rpush(queue_name, json.dumps(payload, ensure_ascii=False))


async def _dequeue(redis, queue_name: str) -> dict[str, Any] | None:
    item = await redis.blpop(queue_name, timeout=5)
    if item is None:
        return None
    _, raw_payload = item
    return json.loads(raw_payload)


async def _remove(redis, queue_name: str, payload: dict[str, Any]) -> None:
    await redis.lrem(queue_name, 0, json.dumps(payload, ensure_ascii=False))
