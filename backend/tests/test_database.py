from sqlalchemy import text

import database


async def test_engine_connects() -> None:
    async with database.engine.connect() as conn:
        result = await conn.execute(text("SELECT 1"))
        assert result.scalar_one() == 1


async def test_get_db_yields_session() -> None:
    async for session in database.get_db():
        result = await session.execute(text("SELECT 1"))
        assert result.scalar_one() == 1
