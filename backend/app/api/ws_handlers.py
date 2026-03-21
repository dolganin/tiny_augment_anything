from __future__ import annotations

import asyncio
import json

from backend.app.runtime.errors import AppError
from backend.app.services.bootstrap import RuntimeState
from backend.app.services.events import build_session_channel
from backend.app.services.sessions import parse_session_id


async def session_stream(scope, params: dict[str, str], state: object) -> None:
    runtime_state = _require_state(state)
    session_id = parse_session_id(params["session_id"])
    send = scope["send"]
    receive = scope["receive"]
    pubsub = runtime_state.redis.pubsub()
    await pubsub.subscribe(build_session_channel(runtime_state.settings, session_id))
    await send({"type": "websocket.accept"})
    try:
        while True:
            receive_task = asyncio.create_task(receive())
            message_task = asyncio.create_task(pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0))
            done, pending = await asyncio.wait({receive_task, message_task}, return_when=asyncio.FIRST_COMPLETED)
            for task in pending:
                task.cancel()
            if receive_task in done:
                message = receive_task.result()
                if message["type"] == "websocket.disconnect":
                    return
            if message_task in done:
                payload = message_task.result()
                if payload and payload.get("data"):
                    await send({"type": "websocket.send", "text": payload["data"]})
    finally:
        await pubsub.unsubscribe(build_session_channel(runtime_state.settings, session_id))
        await pubsub.aclose()


def _require_state(state: object) -> RuntimeState:
    if not isinstance(state, RuntimeState):
        raise RuntimeError("Runtime state is not available")
    return state
