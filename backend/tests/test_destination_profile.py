from collections.abc import AsyncGenerator
from pathlib import Path

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from database import Base
from models.destination_profile import DestinationProfile
from schemas.destination_profile import (
    DestinationProfileCreate,
    DestinationProfileResponse,
    DestinationProfileUpdate,
    Protocol,
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


async def test_create_destination_profile(session: AsyncSession) -> None:
    profile = DestinationProfile(name="SIEM-1", host="192.168.1.10", port=514)
    session.add(profile)
    await session.commit()
    await session.refresh(profile)

    assert profile.id is not None
    assert profile.name == "SIEM-1"
    assert profile.host == "192.168.1.10"
    assert profile.port == 514
    assert profile.protocol == "udp"
    assert profile.description == ""
    assert profile.created_at is not None
    assert profile.updated_at is not None


def test_schema_create_valid() -> None:
    payload = DestinationProfileCreate(name="SIEM", host="10.0.0.1", port=514)
    assert payload.protocol == Protocol.UDP
    assert payload.description == ""


def test_schema_create_rejects_empty_name() -> None:
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        DestinationProfileCreate(name="", host="10.0.0.1", port=514)


def test_schema_create_rejects_port_zero() -> None:
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        DestinationProfileCreate(name="SIEM", host="10.0.0.1", port=0)


def test_schema_create_rejects_port_out_of_range() -> None:
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        DestinationProfileCreate(name="SIEM", host="10.0.0.1", port=65536)


def test_schema_update_all_optional() -> None:
    update = DestinationProfileUpdate()
    assert update.name is None
    assert update.host is None
    assert update.port is None
    assert update.protocol is None


async def test_schema_response_from_orm(session: AsyncSession) -> None:
    profile = DestinationProfile(name="QRadar", host="10.1.1.1", port=514)
    session.add(profile)
    await session.commit()
    await session.refresh(profile)

    response = DestinationProfileResponse.model_validate(profile)
    assert response.id == profile.id
    assert response.name == "QRadar"
    assert response.protocol == Protocol.UDP
    assert response.created_at is not None


def test_protocol_enum_values() -> None:
    assert Protocol.UDP == "udp"
    assert Protocol.TCP == "tcp"
    assert Protocol.TLS == "tls"


def test_schema_create_tls_with_ca_cert() -> None:
    payload = DestinationProfileCreate(
        name="TLS-SIEM",
        host="10.0.0.1",
        port=6514,
        protocol=Protocol.TLS,
        tls_ca_cert="-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----\n",
    )
    assert payload.protocol == Protocol.TLS
    assert payload.tls_ca_cert is not None


def test_schema_create_tls_ca_cert_optional() -> None:
    payload = DestinationProfileCreate(
        name="TLS-SIEM", host="10.0.0.1", port=6514, protocol=Protocol.TLS
    )
    assert payload.tls_ca_cert is None
