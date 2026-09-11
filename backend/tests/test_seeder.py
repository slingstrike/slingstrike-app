"""Tests for the community use case seeder."""

from collections.abc import AsyncGenerator

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from database import Base
from models.use_case import UseCase
from seeder import seed_community_use_cases


@pytest.fixture
async def db_session(tmp_path: pytest.TempPathFactory) -> AsyncGenerator[AsyncSession, None]:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path}/seeder_test.db")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session
    await engine.dispose()


async def test_seeds_all_community_use_cases(db_session: AsyncSession) -> None:
    await seed_community_use_cases(db_session)
    result = await db_session.execute(select(UseCase))
    use_cases = result.scalars().all()
    assert len(use_cases) == 13


async def test_seeder_is_idempotent(db_session: AsyncSession) -> None:
    await seed_community_use_cases(db_session)
    await seed_community_use_cases(db_session)
    result = await db_session.execute(select(UseCase))
    use_cases = result.scalars().all()
    assert len(use_cases) == 13


async def test_seeder_skips_existing_uuid(db_session: AsyncSession) -> None:
    # Pre-insert the first use case by its known UUID
    pre = UseCase(
        uuid="f47ac10b-58cc-4372-a567-000000000001",
        name="Pre-existing",
        log_events=[],
    )
    db_session.add(pre)
    await db_session.commit()

    await seed_community_use_cases(db_session)
    result = await db_session.execute(select(UseCase))
    use_cases = result.scalars().all()
    # 12 seeded + 1 pre-existing = 13 total; the duplicate UUID was skipped
    assert len(use_cases) == 13


async def test_seeder_sets_community_tier(db_session: AsyncSession) -> None:
    await seed_community_use_cases(db_session)
    result = await db_session.execute(select(UseCase).where(UseCase.tier != "community"))
    non_community = result.scalars().all()
    assert non_community == []


async def test_seeder_sets_imported_at_null(db_session: AsyncSession) -> None:
    await seed_community_use_cases(db_session)
    result = await db_session.execute(
        select(UseCase).where(UseCase.imported_at.is_not(None))
    )
    with_imported_at = result.scalars().all()
    assert with_imported_at == []


async def test_seeder_use_cases_have_log_events(db_session: AsyncSession) -> None:
    await seed_community_use_cases(db_session)
    result = await db_session.execute(select(UseCase))
    for uc in result.scalars().all():
        assert len(uc.log_events) >= 1
