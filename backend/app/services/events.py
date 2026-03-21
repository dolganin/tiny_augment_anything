from __future__ import annotations

import json
from uuid import UUID

from backend.app.config.settings import Settings


def build_session_channel(settings: Settings, session_id: UUID) -> str:
    return f"{settings.redis_events_prefix}:{session_id}"


async def publish_session_event(redis, settings: Settings, session_id: UUID, event: dict) -> None:
    await redis.publish(build_session_channel(settings, session_id), json.dumps(event, ensure_ascii=False))
