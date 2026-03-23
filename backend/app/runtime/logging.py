from __future__ import annotations

import json
import logging
import os
from datetime import datetime
from zoneinfo import ZoneInfo


NOVOSIBIRSK_TZ = ZoneInfo("Asia/Novosibirsk")


class NovosibirskFormatter(logging.Formatter):
    def formatTime(self, record: logging.LogRecord, datefmt: str | None = None) -> str:
        dt = datetime.fromtimestamp(record.created, NOVOSIBIRSK_TZ)
        if datefmt:
            return dt.strftime(datefmt)
        return dt.isoformat(timespec="milliseconds")


def configure_logging(level_name: str) -> None:
    level = getattr(logging, level_name.upper(), logging.INFO)
    handler = logging.StreamHandler()
    handler.setFormatter(NovosibirskFormatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    logging.basicConfig(level=level, handlers=[handler], force=True)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)


def log_event(logger: logging.Logger, level: int, event: str, **fields: object) -> None:
    payload = {
        "ts": datetime.now(NOVOSIBIRSK_TZ).isoformat(),
        "event": event,
        **{key: value for key, value in fields.items() if value is not None},
    }
    logger.log(level, json.dumps(payload, ensure_ascii=False, default=_serialize_value))


def _serialize_value(value: object) -> object:
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, os.PathLike):
        return os.fspath(value)
    return str(value)
