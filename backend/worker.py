from __future__ import annotations

import asyncio


async def main() -> None:
    while True:
        await asyncio.sleep(3600)


if __name__ == "__main__":
    asyncio.run(main())
