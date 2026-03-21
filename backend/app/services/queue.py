from __future__ import annotations

import json
from typing import Any
from uuid import UUID

from backend.app.config.settings import Settings


async def enqueue_task(redis, settings: Settings, payload: dict[str, Any]) -> None:
    await redis.rpush(settings.redis_queue_name, json.dumps(payload, ensure_ascii=False))


async def dequeue_task(redis, settings: Settings) -> dict[str, Any] | None:
    item = await redis.blpop(settings.redis_queue_name, timeout=5)
    if item is None:
        return None
    _, raw_payload = item
    return json.loads(raw_payload)


async def remove_queued_task(redis, settings: Settings, payload: dict[str, Any]) -> None:
    await redis.lrem(settings.redis_queue_name, 0, json.dumps(payload, ensure_ascii=False))
