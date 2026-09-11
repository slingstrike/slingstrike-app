from collections.abc import AsyncGenerator
from pathlib import Path

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from database import Base
from models.use_case import UseCase
from schemas.use_case import (
    UseCaseCreate,
    UseCaseResponse,
    UseCaseUpdate,
)


@pytest.fixture
async def session(tmp_path: Path) -> AsyncGenerator[AsyncSession, None]:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path}/test.db")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as sess:
        yield sess
    await engine.dispose()


# --- model tests ---


async def test_create_use_case(session: AsyncSession) -> None:
    import uuid

    uc = UseCase(name="SSH Brute Force", uuid=str(uuid.uuid4()))
    session.add(uc)
    await session.commit()
    await session.refresh(uc)

    assert uc.id is not None
    assert uc.name == "SSH Brute Force"
    assert uc.tier == "community"
    assert uc.visibility == "private"
    assert uc.mitre_tactics == []
    assert uc.mitre_techniques == []
    assert uc.tags == []
    assert uc.target_ids == []
    assert uc.log_events == []
    assert uc.log_source is None
    assert uc.template_encrypted is None
    assert uc.owner_id is None
    assert uc.created_at is not None
    assert uc.updated_at is not None
    assert uc.last_edited_at is not None
    assert uc.imported_at is None


async def test_use_case_with_json_fields(session: AsyncSession) -> None:
    import uuid

    uc = UseCase(
        name="Lateral Movement",
        uuid=str(uuid.uuid4()),
        mitre_tactics=["TA0008"],
        mitre_techniques=["T1021"],
        tags=["windows", "smb"],
        target_ids=["target-1"],
    )
    session.add(uc)
    await session.commit()
    await session.refresh(uc)

    assert uc.mitre_tactics == ["TA0008"]
    assert uc.mitre_techniques == ["T1021"]
    assert uc.tags == ["windows", "smb"]
    assert uc.target_ids == ["target-1"]


async def test_use_case_log_events_stored(session: AsyncSession) -> None:
    import uuid

    events = [
        {
            "sequence": 1,
            "format": "syslog_rfc5424",
            "template": "<34>1 {{timestamp}} {{hostname}} sshd - - - auth failure",
            "variables": {
                "timestamp": {"type": "timestamp", "default": "2026-06-27T10:00:00Z", "source": "generated"},
                "hostname": {"type": "hostname", "default": "web-01", "source": "user_override"},
            },
            "delay_ms": 0,
            "repeat": 1,
        }
    ]
    uc = UseCase(name="Test Events", uuid=str(uuid.uuid4()), log_events=events)
    session.add(uc)
    await session.commit()
    await session.refresh(uc)

    assert len(uc.log_events) == 1
    assert uc.log_events[0]["sequence"] == 1
    assert uc.log_events[0]["format"] == "syslog_rfc5424"


# --- schema tests ---


def test_use_case_create_valid() -> None:
    payload = UseCaseCreate(name="Test Use Case")
    assert payload.name == "Test Use Case"
    assert payload.tier == "community"
    assert payload.visibility == "private"
    assert payload.mitre_tactics == []
    assert payload.log_events == []


def test_use_case_create_rejects_empty_name() -> None:
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        UseCaseCreate(name="")


def test_use_case_create_rejects_name_over_120() -> None:
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        UseCaseCreate(name="x" * 121)


def test_use_case_update_all_optional() -> None:
    update = UseCaseUpdate()
    assert update.name is None
    assert update.log_events is None


def test_use_case_create_accepts_repeat_in_range() -> None:
    payload = UseCaseCreate(
        name="Test",
        log_events=[{"sequence": 1, "format": "custom", "template": "x", "repeat": 0}],
    )
    assert payload.log_events[0]["repeat"] == 0

    payload = UseCaseCreate(
        name="Test",
        log_events=[{"sequence": 1, "format": "custom", "template": "x", "repeat": 128}],
    )
    assert payload.log_events[0]["repeat"] == 128


def test_use_case_create_rejects_repeat_over_128() -> None:
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        UseCaseCreate(
            name="Test",
            log_events=[{"sequence": 1, "format": "custom", "template": "x", "repeat": 129}],
        )


def test_use_case_create_rejects_negative_repeat() -> None:
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        UseCaseCreate(
            name="Test",
            log_events=[{"sequence": 1, "format": "custom", "template": "x", "repeat": -1}],
        )


def test_use_case_update_rejects_repeat_over_128() -> None:
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        UseCaseUpdate(
            log_events=[{"sequence": 1, "format": "custom", "template": "x", "repeat": 500}],
        )


async def test_use_case_response_from_orm(session: AsyncSession) -> None:
    import uuid

    uc = UseCase(name="ORM Test", uuid=str(uuid.uuid4()))
    session.add(uc)
    await session.commit()
    await session.refresh(uc)

    response = UseCaseResponse.model_validate(uc)
    assert response.id == uc.id
    assert response.name == "ORM Test"
    assert response.tier == "community"
    assert response.created_at is not None
    assert response.last_edited_at is not None
    assert response.imported_at is None
    assert response.uuid == uc.uuid
