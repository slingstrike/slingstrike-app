import asyncio
import uuid
from collections.abc import AsyncGenerator
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from database import Base, get_db
from main import app
from models.destination_profile import DestinationProfile
from models.use_case import UseCase

_TEMPLATE = "<34>{{timestamp}} {{hostname}} sshd: auth failure"
_LOG_EVENTS = [
    {
        "sequence": 1,
        "format": "syslog_rfc3164",
        "template": _TEMPLATE,
        "variables": {
            "timestamp": {"type": "timestamp", "source": "generated"},
            "hostname": {"type": "hostname", "source": "generated"},
        },
    }
]


@pytest.fixture
async def db_session(tmp_path: pytest.TempPathFactory) -> AsyncGenerator[AsyncSession, None]:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path}/send_test.db")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session
    await engine.dispose()


@pytest.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.fixture
async def use_case_id(client: AsyncClient) -> int:
    response = await client.post(
        "/api/v1/use-cases",
        json={
            "name": "SSH Brute Force",
            "log_events": _LOG_EVENTS,
        },
    )
    return int(response.json()["id"])


async def test_send_use_case_success(client: AsyncClient, use_case_id: int) -> None:
    with patch("api.send.send_udp", new=AsyncMock(return_value=46)):
        response = await client.post(
            f"/api/v1/use-cases/{use_case_id}/send",
            json={
                "host": "192.168.1.100",
                "port": 514,
                "variables": {"timestamp": "Jun 23 12:00:00", "hostname": "web-01"},
            },
        )
    assert response.status_code == 200
    data = response.json()
    assert data["bytes_sent"] == 46
    assert data["destination"] == "192.168.1.100:514"


async def test_send_use_case_not_found(client: AsyncClient) -> None:
    with patch("api.send.send_udp", new=AsyncMock(return_value=0)):
        response = await client.post(
            "/api/v1/use-cases/9999/send",
            json={"host": "192.168.1.100", "port": 514},
        )
    assert response.status_code == 404


async def test_send_use_case_no_variables(client: AsyncClient, use_case_id: int) -> None:
    with patch("api.send.send_udp", new=AsyncMock(return_value=10)) as mock_send:
        response = await client.post(
            f"/api/v1/use-cases/{use_case_id}/send",
            json={"host": "10.0.0.1", "port": 514},
        )
    assert response.status_code == 200
    mock_send.assert_called_once()
    assert response.json()["destination"] == "10.0.0.1:514"


async def test_send_use_case_no_log_events(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    uc = UseCase(name="Empty Events", uuid=str(uuid.uuid4()), log_events=[])
    db_session.add(uc)
    await db_session.commit()
    await db_session.refresh(uc)

    with patch("api.send.send_udp", new=AsyncMock(return_value=0)):
        response = await client.post(
            f"/api/v1/use-cases/{uc.id}/send",
            json={"host": "192.168.1.100", "port": 514},
        )
    assert response.status_code == 422


async def test_send_use_case_invalid_template(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    uc = UseCase(
        name="Bad Template",
        uuid=str(uuid.uuid4()),
        log_events=[{"sequence": 1, "format": "custom", "template": "{{ var | upper }}"}],
    )
    db_session.add(uc)
    await db_session.commit()
    await db_session.refresh(uc)

    with patch("api.send.send_udp", new=AsyncMock(return_value=0)):
        response = await client.post(
            f"/api/v1/use-cases/{uc.id}/send",
            json={"host": "192.168.1.100", "port": 514},
        )
    assert response.status_code == 422


async def test_send_rejects_port_zero(client: AsyncClient, use_case_id: int) -> None:
    response = await client.post(
        f"/api/v1/use-cases/{use_case_id}/send",
        json={"host": "192.168.1.100", "port": 0},
    )
    assert response.status_code == 422


async def test_send_rejects_port_out_of_range(client: AsyncClient, use_case_id: int) -> None:
    response = await client.post(
        f"/api/v1/use-cases/{use_case_id}/send",
        json={"host": "192.168.1.100", "port": 65536},
    )
    assert response.status_code == 422


async def test_send_rejects_empty_host(client: AsyncClient, use_case_id: int) -> None:
    response = await client.post(
        f"/api/v1/use-cases/{use_case_id}/send",
        json={"host": "", "port": 514},
    )
    assert response.status_code == 422


async def test_send_rejects_no_destination_no_inline(client: AsyncClient, use_case_id: int) -> None:
    response = await client.post(
        f"/api/v1/use-cases/{use_case_id}/send",
        json={"variables": {}},
    )
    assert response.status_code == 422


async def test_send_via_destination_profile(
    client: AsyncClient, use_case_id: int, db_session: AsyncSession
) -> None:
    profile = DestinationProfile(name="QRadar", host="10.0.0.50", port=514)
    db_session.add(profile)
    await db_session.commit()
    await db_session.refresh(profile)

    with patch("api.send.send_udp", new=AsyncMock(return_value=20)):
        response = await client.post(
            f"/api/v1/use-cases/{use_case_id}/send",
            json={"destination_id": profile.id},
        )
    assert response.status_code == 200
    assert response.json()["destination"] == "10.0.0.50:514"


async def test_send_destination_profile_not_found(client: AsyncClient, use_case_id: int) -> None:
    with patch("api.send.send_udp", new=AsyncMock(return_value=0)):
        response = await client.post(
            f"/api/v1/use-cases/{use_case_id}/send",
            json={"destination_id": 9999},
        )
    assert response.status_code == 404


async def test_send_via_tcp_destination_profile(
    client: AsyncClient, use_case_id: int, db_session: AsyncSession
) -> None:
    profile = DestinationProfile(name="TCP-SIEM", host="10.0.0.60", port=6514, protocol="tcp")
    db_session.add(profile)
    await db_session.commit()
    await db_session.refresh(profile)

    with patch("api.send.send_tcp", new=AsyncMock(return_value=30)):
        response = await client.post(
            f"/api/v1/use-cases/{use_case_id}/send",
            json={"destination_id": profile.id},
        )
    assert response.status_code == 200
    assert response.json()["destination"] == "10.0.0.60:6514"


async def test_send_via_tls_destination_profile(
    client: AsyncClient, use_case_id: int, db_session: AsyncSession
) -> None:
    profile = DestinationProfile(
        name="TLS-SIEM",
        host="10.0.0.70",
        port=6514,
        protocol="tls",
        tls_ca_cert="-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----\n",
    )
    db_session.add(profile)
    await db_session.commit()
    await db_session.refresh(profile)

    with patch("api.send.send_tls", new=AsyncMock(return_value=40)):
        response = await client.post(
            f"/api/v1/use-cases/{use_case_id}/send",
            json={"destination_id": profile.id},
        )
    assert response.status_code == 200
    assert response.json()["destination"] == "10.0.0.70:6514"


async def test_send_use_case_cancel_mid_flight(client: AsyncClient, use_case_id: int) -> None:
    # 5 repeats separated by a delay long enough to cancel between two of them.
    await client.put(
        f"/api/v1/use-cases/{use_case_id}",
        json={"log_events": [{**_LOG_EVENTS[0], "repeat": 5, "delay_ms": 2000}]},
    )

    with patch("api.send.send_udp", new=AsyncMock(return_value=10)):
        send_task = asyncio.create_task(
            client.post(
                f"/api/v1/use-cases/{use_case_id}/send",
                json={"host": "192.168.1.100", "port": 514},
            )
        )
        await asyncio.sleep(0.1)  # let the first send happen and enter the inter-repeat delay
        cancel_response = await client.post(f"/api/v1/use-cases/{use_case_id}/send/cancel")
        response = await send_task

    assert cancel_response.status_code == 204
    assert response.status_code == 200
    data = response.json()
    assert data["cancelled"] is True
    assert data["bytes_sent"] < 50  # fewer than all 5 repeats got through


async def test_cancel_use_case_send_when_not_running(
    client: AsyncClient, use_case_id: int
) -> None:
    response = await client.post(f"/api/v1/use-cases/{use_case_id}/send/cancel")
    assert response.status_code == 404


async def test_send_use_case_multiline_template_split(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    # Blank line in the middle should be dropped, not sent as an empty message.
    template = "line one {{ n }}\nline two {{ n }}\n\nline three {{ n }}"
    uc = UseCase(
        name="Multi-line",
        uuid=str(uuid.uuid4()),
        log_events=[
            {
                "sequence": 1,
                "format": "custom",
                "template": template,
                "repeat": 2,
                "variables": {
                    "n": {"type": "integer", "source": "generated", "min": 1, "max": 9999}
                },
            }
        ],
    )
    db_session.add(uc)
    await db_session.commit()
    await db_session.refresh(uc)

    sent: list[bytes] = []

    async def _record_send(host: str, port: int, data: bytes) -> int:
        sent.append(data)
        return len(data)

    with patch("api.send.send_udp", new=AsyncMock(side_effect=_record_send)):
        response = await client.post(
            f"/api/v1/use-cases/{uc.id}/send",
            json={"host": "192.168.1.100", "port": 514},
        )

    assert response.status_code == 200
    # 3 non-blank lines x repeat=2 = 6 individual messages, not one combined payload.
    assert len(sent) == 6
    for payload in sent:
        assert b"\n" not in payload
    assert sent[0].startswith(b"line one ")
    assert sent[1].startswith(b"line two ")
    assert sent[2].startswith(b"line three ")
    assert sent[3].startswith(b"line one ")  # repeat replays the whole line set


async def test_send_use_case_template_comment_lines_skipped(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    template = (
        "# recon phase, ignore for now\n"
        "line one\n"
        "  # indented comment\n"
        "line two\n"
        "#line three - disabled\n"
    )
    uc = UseCase(
        name="Commented",
        uuid=str(uuid.uuid4()),
        log_events=[{"sequence": 1, "format": "custom", "template": template}],
    )
    db_session.add(uc)
    await db_session.commit()
    await db_session.refresh(uc)

    sent: list[bytes] = []

    async def _record_send(host: str, port: int, data: bytes) -> int:
        sent.append(data)
        return len(data)

    with patch("api.send.send_udp", new=AsyncMock(side_effect=_record_send)):
        response = await client.post(
            f"/api/v1/use-cases/{uc.id}/send",
            json={"host": "192.168.1.100", "port": 514},
        )

    assert response.status_code == 200
    assert sent == [b"line one", b"line two"]


async def test_send_use_case_all_comment_lines_sends_nothing(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    uc = UseCase(
        name="All commented",
        uuid=str(uuid.uuid4()),
        log_events=[
            {"sequence": 1, "format": "custom", "template": "# just a note\n# another note"}
        ],
    )
    db_session.add(uc)
    await db_session.commit()
    await db_session.refresh(uc)

    with patch("api.send.send_udp", new=AsyncMock(return_value=0)) as mock_send:
        response = await client.post(
            f"/api/v1/use-cases/{uc.id}/send",
            json={"host": "192.168.1.100", "port": 514},
        )

    assert response.status_code == 200
    mock_send.assert_not_called()
    assert response.json()["bytes_sent"] == 0


async def test_send_use_case_repeat_zero_skips_block(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    uc = UseCase(
        name="Repeat zero",
        uuid=str(uuid.uuid4()),
        log_events=[
            {"sequence": 1, "format": "custom", "template": "skip me", "repeat": 0},
            {"sequence": 2, "format": "custom", "template": "send me"},
        ],
    )
    db_session.add(uc)
    await db_session.commit()
    await db_session.refresh(uc)

    sent: list[bytes] = []

    async def _record_send(host: str, port: int, data: bytes) -> int:
        sent.append(data)
        return len(data)

    with patch("api.send.send_udp", new=AsyncMock(side_effect=_record_send)):
        response = await client.post(
            f"/api/v1/use-cases/{uc.id}/send",
            json={"host": "192.168.1.100", "port": 514},
        )

    assert response.status_code == 200
    assert sent == [b"send me"]


async def test_send_use_case_generated_ipv6(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    import ipaddress

    uc = UseCase(
        name="IPv6 test",
        uuid=str(uuid.uuid4()),
        log_events=[
            {
                "sequence": 1,
                "format": "custom",
                "template": "src={{ src_ip }}",
                "variables": {"src_ip": {"type": "ipv6", "source": "generated"}},
            }
        ],
    )
    db_session.add(uc)
    await db_session.commit()
    await db_session.refresh(uc)

    sent: list[bytes] = []

    async def _record_send(host: str, port: int, data: bytes) -> int:
        sent.append(data)
        return len(data)

    with patch("api.send.send_udp", new=AsyncMock(side_effect=_record_send)):
        response = await client.post(
            f"/api/v1/use-cases/{uc.id}/send",
            json={"host": "192.168.1.100", "port": 514},
        )

    assert response.status_code == 200
    assert len(sent) == 1
    rendered = sent[0].decode()
    assert rendered.startswith("src=")
    ipaddress.IPv6Address(rendered.removeprefix("src="))  # raises if not a valid IPv6 address


async def test_send_use_case_generated_enum_picks_from_values(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """enum + source: generated is documented in the .olf spec (Generated Value
    Behavior table: "random item from values") but was never wired up in
    _resolve_var until the My Objects .olf-embedding fix - this is what makes
    a re-imported embedded-object use case actually replay correctly."""
    uc = UseCase(
        name="Enum generated test",
        uuid=str(uuid.uuid4()),
        log_events=[
            {
                "sequence": 1,
                "format": "custom",
                "template": "host={{ host }}",
                "variables": {
                    "host": {
                        "type": "enum",
                        "source": "generated",
                        "values": ["WS-ALPHA", "WS-BETA"],
                    }
                },
                "repeat": 20,
            }
        ],
    )
    db_session.add(uc)
    await db_session.commit()
    await db_session.refresh(uc)

    sent: list[bytes] = []

    async def _record_send(host: str, port: int, data: bytes) -> int:
        sent.append(data)
        return len(data)

    with patch("api.send.send_udp", new=AsyncMock(side_effect=_record_send)):
        response = await client.post(
            f"/api/v1/use-cases/{uc.id}/send",
            json={"host": "192.168.1.100", "port": 514},
        )

    assert response.status_code == 200
    rendered = {d.decode() for d in sent}
    assert rendered <= {"host=WS-ALPHA", "host=WS-BETA"}
    # 20 repeats from a 2-item list: astronomically unlikely to land on only one value
    assert len(rendered) == 2


async def test_send_use_case_rejects_unresolvable_placeholder(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """A placeholder with no declared variable and no matching Object must
    reject the send before anything is transmitted - a use case that renders
    fine in the editor's live preview must not silently send blanks (e.g. if
    edited via direct API access, bypassing the editor's own resolution)."""
    uc = UseCase(
        name="Unresolvable placeholder",
        uuid=str(uuid.uuid4()),
        log_events=[
            {
                "sequence": 1,
                "format": "custom",
                "template": "port={{ mystery_placeholder }}",
            }
        ],
    )
    db_session.add(uc)
    await db_session.commit()
    await db_session.refresh(uc)

    with patch("api.send.send_udp", new=AsyncMock(return_value=0)) as mock_send:
        response = await client.post(
            f"/api/v1/use-cases/{uc.id}/send",
            json={"host": "192.168.1.100", "port": 514},
        )

    assert response.status_code == 422
    assert "mystery_placeholder" in response.json()["error"]["message"]
    mock_send.assert_not_called()


async def test_send_use_case_allows_unresolvable_placeholder_via_payload_override(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """payload.variables is a legitimate third resolution path (caller-supplied
    override at send time) - the pre-flight check must not reject it."""
    uc = UseCase(
        name="Payload override",
        uuid=str(uuid.uuid4()),
        log_events=[
            {
                "sequence": 1,
                "format": "custom",
                "template": "user={{ caller_supplied }}",
            }
        ],
    )
    db_session.add(uc)
    await db_session.commit()
    await db_session.refresh(uc)

    sent: list[bytes] = []

    async def _record_send(host: str, port: int, data: bytes) -> int:
        sent.append(data)
        return len(data)

    with patch("api.send.send_udp", new=AsyncMock(side_effect=_record_send)):
        response = await client.post(
            f"/api/v1/use-cases/{uc.id}/send",
            json={
                "host": "192.168.1.100",
                "port": 514,
                "variables": {"caller_supplied": "jsmith"},
            },
        )

    assert response.status_code == 200
    assert sent == [b"user=jsmith"]
