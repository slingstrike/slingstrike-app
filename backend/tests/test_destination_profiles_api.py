from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from database import Base, get_db
from main import app

_VALID_PAYLOAD = {"name": "SIEM-Primary", "host": "192.168.1.10", "port": 514}


@pytest.fixture
async def db_session(tmp_path: pytest.TempPathFactory) -> AsyncGenerator[AsyncSession, None]:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path}/dp_test.db")
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


async def test_list_destination_profiles_empty(client: AsyncClient) -> None:
    response = await client.get("/api/v1/destination-profiles")
    assert response.status_code == 200
    data = response.json()
    assert data["items"] == []
    assert data["total_count"] == 0
    assert data["next_cursor"] is None


async def test_create_destination_profile(client: AsyncClient) -> None:
    response = await client.post("/api/v1/destination-profiles", json=_VALID_PAYLOAD)
    assert response.status_code == 201
    data = response.json()
    assert data["id"] == 1
    assert data["name"] == "SIEM-Primary"
    assert data["host"] == "192.168.1.10"
    assert data["port"] == 514
    assert data["protocol"] == "udp"


async def test_create_destination_profile_rejects_empty_name(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/destination-profiles", json={"name": "", "host": "10.0.0.1", "port": 514}
    )
    assert response.status_code == 422


async def test_create_destination_profile_rejects_duplicate_name(client: AsyncClient) -> None:
    await client.post("/api/v1/destination-profiles", json=_VALID_PAYLOAD)
    response = await client.post("/api/v1/destination-profiles", json=_VALID_PAYLOAD)
    assert response.status_code == 409


async def test_get_destination_profile(client: AsyncClient) -> None:
    create_resp = await client.post("/api/v1/destination-profiles", json=_VALID_PAYLOAD)
    profile_id = create_resp.json()["id"]

    response = await client.get(f"/api/v1/destination-profiles/{profile_id}")
    assert response.status_code == 200
    assert response.json()["name"] == "SIEM-Primary"


async def test_get_destination_profile_not_found(client: AsyncClient) -> None:
    response = await client.get("/api/v1/destination-profiles/9999")
    assert response.status_code == 404


async def test_list_destination_profiles_ordered_by_name(client: AsyncClient) -> None:
    seeds = [("Zebra-SIEM", "10.0.0.3"), ("Alpha-SIEM", "10.0.0.1"), ("Mid-SIEM", "10.0.0.2")]
    for name, host in seeds:
        await client.post(
            "/api/v1/destination-profiles", json={"name": name, "host": host, "port": 514}
        )
    response = await client.get("/api/v1/destination-profiles")
    names = [p["name"] for p in response.json()["items"]]
    assert names == ["Alpha-SIEM", "Mid-SIEM", "Zebra-SIEM"]


async def test_update_destination_profile(client: AsyncClient) -> None:
    create_resp = await client.post("/api/v1/destination-profiles", json=_VALID_PAYLOAD)
    profile_id = create_resp.json()["id"]

    response = await client.put(
        f"/api/v1/destination-profiles/{profile_id}",
        json={"host": "10.0.0.99", "port": 6514},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["host"] == "10.0.0.99"
    assert data["port"] == 6514
    assert data["name"] == "SIEM-Primary"


async def test_update_destination_profile_not_found(client: AsyncClient) -> None:
    response = await client.put("/api/v1/destination-profiles/9999", json={"host": "x"})
    assert response.status_code == 404


async def test_update_destination_profile_duplicate_name(client: AsyncClient) -> None:
    await client.post("/api/v1/destination-profiles", json=_VALID_PAYLOAD)
    resp2 = await client.post(
        "/api/v1/destination-profiles",
        json={"name": "Other-SIEM", "host": "10.0.0.2", "port": 514},
    )
    profile_id = resp2.json()["id"]

    response = await client.put(
        f"/api/v1/destination-profiles/{profile_id}",
        json={"name": "SIEM-Primary"},
    )
    assert response.status_code == 409


async def test_delete_destination_profile(client: AsyncClient) -> None:
    create_resp = await client.post("/api/v1/destination-profiles", json=_VALID_PAYLOAD)
    profile_id = create_resp.json()["id"]

    response = await client.delete(f"/api/v1/destination-profiles/{profile_id}")
    assert response.status_code == 204

    get_resp = await client.get(f"/api/v1/destination-profiles/{profile_id}")
    assert get_resp.status_code == 404


async def test_delete_destination_profile_not_found(client: AsyncClient) -> None:
    response = await client.delete("/api/v1/destination-profiles/9999")
    assert response.status_code == 404


async def test_create_tls_destination_profile(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/destination-profiles",
        json={
            "name": "TLS-SIEM",
            "host": "10.0.0.1",
            "port": 6514,
            "protocol": "tls",
            "tls_ca_cert": "-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----\n",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["protocol"] == "tls"
    assert data["tls_ca_cert"] is not None


async def test_create_tls_destination_profile_without_ca_cert(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/destination-profiles",
        json={"name": "TLS-No-CA", "host": "10.0.0.2", "port": 6514, "protocol": "tls"},
    )
    assert response.status_code == 201
    assert response.json()["tls_ca_cert"] is None


async def test_list_destination_profiles_pagination_cursor(client: AsyncClient) -> None:
    seeds = [
        ("AAAA-SIEM", "10.0.0.1"),
        ("BBBB-SIEM", "10.0.0.2"),
        ("CCCC-SIEM", "10.0.0.3"),
        ("DDDD-SIEM", "10.0.0.4"),
        ("EEEE-SIEM", "10.0.0.5"),
    ]
    for name, host in seeds:
        await client.post(
            "/api/v1/destination-profiles", json={"name": name, "host": host, "port": 514}
        )
    first = await client.get("/api/v1/destination-profiles", params={"limit": 3})
    assert first.status_code == 200
    page1 = first.json()
    assert len(page1["items"]) == 3
    assert page1["total_count"] == 5
    assert page1["next_cursor"] is not None
    assert [p["name"] for p in page1["items"]] == ["AAAA-SIEM", "BBBB-SIEM", "CCCC-SIEM"]

    second = await client.get(
        "/api/v1/destination-profiles", params={"cursor": page1["next_cursor"], "limit": 3}
    )
    assert second.status_code == 200
    page2 = second.json()
    assert len(page2["items"]) == 2
    assert page2["total_count"] == 5
    assert page2["next_cursor"] is None
    assert [p["name"] for p in page2["items"]] == ["DDDD-SIEM", "EEEE-SIEM"]


async def test_list_destination_profiles_invalid_cursor(client: AsyncClient) -> None:
    response = await client.get("/api/v1/destination-profiles", params={"cursor": "!!!bad!!!"})
    assert response.status_code == 422


async def test_error_envelope_not_found(client: AsyncClient) -> None:
    response = await client.get("/api/v1/destination-profiles/9999")
    assert response.status_code == 404
    body = response.json()
    assert body["error"]["code"] == "NOT_FOUND"
    assert "message" in body["error"]
    assert "details" in body["error"]


async def test_error_envelope_conflict(client: AsyncClient) -> None:
    await client.post("/api/v1/destination-profiles", json=_VALID_PAYLOAD)
    response = await client.post("/api/v1/destination-profiles", json=_VALID_PAYLOAD)
    assert response.status_code == 409
    body = response.json()
    assert body["error"]["code"] == "CONFLICT"
