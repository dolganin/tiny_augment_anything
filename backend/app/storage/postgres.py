from __future__ import annotations

from contextlib import asynccontextmanager

from psycopg import AsyncConnection
from psycopg.rows import dict_row

from backend.app.storage.schema import SCHEMA_SQL


class Database:
    def __init__(self, dsn: str) -> None:
        self.dsn = dsn

    @asynccontextmanager
    async def connection(self):
        connection = await AsyncConnection.connect(self.dsn, row_factory=dict_row)
        try:
            yield connection
            await connection.commit()
        except Exception:
            await connection.rollback()
            raise
        finally:
            await connection.close()

    async def initialize(self) -> None:
        async with self.connection() as connection:
            await connection.execute(SCHEMA_SQL)
