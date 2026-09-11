from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from database import Base, get_db
from main import app


@pytest.fixture
async def db_session(tmp_path: pytest.TempPathFactory) -> AsyncGenerator[AsyncSession, None]:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path}/api_test.db")
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


async def test_list_use_cases_empty(client: AsyncClient) -> None:
    response = await client.get("/api/v1/use-cases")
    assert response.status_code == 200
    data = response.json()
    assert data["items"] == []
    assert data["total_count"] == 0
    assert data["next_cursor"] is None


async def test_create_use_case(client: AsyncClient) -> None:
    payload = {"name": "SSH Brute Force"}
    response = await client.post("/api/v1/use-cases", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["id"] == 1
    assert data["name"] == "SSH Brute Force"
    assert data["tier"] == "community"
    assert data["visibility"] == "private"
    assert data["mitre_tactics"] == []
    assert data["log_events"] == []
    assert "uuid" in data
    assert len(data["uuid"]) == 36  # UUIDv4 format


async def test_create_use_case_auto_generates_uuid(client: AsyncClient) -> None:
    r1 = await client.post("/api/v1/use-cases", json={"name": "UC-1"})
    r2 = await client.post("/api/v1/use-cases", json={"name": "UC-2"})
    assert r1.status_code == 201
    assert r2.status_code == 201
    assert r1.json()["uuid"] != r2.json()["uuid"]


async def test_create_use_case_accepts_explicit_uuid(client: AsyncClient) -> None:
    fixed_uuid = "550e8400-e29b-41d4-a716-446655440000"
    response = await client.post("/api/v1/use-cases", json={"name": "Fixed", "uuid": fixed_uuid})
    assert response.status_code == 201
    assert response.json()["uuid"] == fixed_uuid


async def test_create_use_case_rejects_empty_name(client: AsyncClient) -> None:
    payload = {"name": ""}
    response = await client.post("/api/v1/use-cases", json=payload)
    assert response.status_code == 422


async def test_get_use_case(client: AsyncClient) -> None:
    create_resp = await client.post("/api/v1/use-cases", json={"name": "Lateral Movement"})
    use_case_id = create_resp.json()["id"]

    response = await client.get(f"/api/v1/use-cases/{use_case_id}")
    assert response.status_code == 200
    assert response.json()["name"] == "Lateral Movement"


async def test_get_use_case_not_found(client: AsyncClient) -> None:
    response = await client.get("/api/v1/use-cases/9999")
    assert response.status_code == 404


async def test_list_use_cases_returns_all(client: AsyncClient) -> None:
    for name in ("UC-1", "UC-2", "UC-3"):
        await client.post("/api/v1/use-cases", json={"name": name})
    response = await client.get("/api/v1/use-cases")
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 3
    assert data["total_count"] == 3
    assert data["next_cursor"] is None


async def test_update_use_case(client: AsyncClient) -> None:
    create_resp = await client.post("/api/v1/use-cases", json={"name": "Initial Name"})
    use_case_id = create_resp.json()["id"]

    response = await client.put(
        f"/api/v1/use-cases/{use_case_id}",
        json={"name": "Updated Name", "tags": ["tag1", "tag2"]},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Updated Name"
    assert data["tags"] == ["tag1", "tag2"]


async def test_update_use_case_not_found(client: AsyncClient) -> None:
    response = await client.put("/api/v1/use-cases/9999", json={"name": "X"})
    assert response.status_code == 404


async def test_delete_use_case(client: AsyncClient) -> None:
    create_resp = await client.post("/api/v1/use-cases", json={"name": "To Delete"})
    use_case_id = create_resp.json()["id"]

    response = await client.delete(f"/api/v1/use-cases/{use_case_id}")
    assert response.status_code == 204

    get_resp = await client.get(f"/api/v1/use-cases/{use_case_id}")
    assert get_resp.status_code == 404


async def test_delete_use_case_not_found(client: AsyncClient) -> None:
    response = await client.delete("/api/v1/use-cases/9999")
    assert response.status_code == 404


async def test_list_use_cases_pagination_cursor(client: AsyncClient) -> None:
    for i in range(5):
        await client.post("/api/v1/use-cases", json={"name": f"UC-{i}"})
    first = await client.get("/api/v1/use-cases", params={"limit": 3})
    assert first.status_code == 200
    page1 = first.json()
    assert len(page1["items"]) == 3
    assert page1["total_count"] == 5
    assert page1["next_cursor"] is not None

    second = await client.get(
        "/api/v1/use-cases", params={"cursor": page1["next_cursor"], "limit": 3}
    )
    assert second.status_code == 200
    page2 = second.json()
    assert len(page2["items"]) == 2
    assert page2["total_count"] == 5
    assert page2["next_cursor"] is None

    ids1 = {item["id"] for item in page1["items"]}
    ids2 = {item["id"] for item in page2["items"]}
    assert ids1.isdisjoint(ids2)


async def test_list_use_cases_invalid_cursor(client: AsyncClient) -> None:
    response = await client.get("/api/v1/use-cases", params={"cursor": "notvalidbase64!!"})
    assert response.status_code == 422


async def test_error_envelope_not_found(client: AsyncClient) -> None:
    response = await client.get("/api/v1/use-cases/9999")
    assert response.status_code == 404
    body = response.json()
    assert body["error"]["code"] == "NOT_FOUND"
    assert "message" in body["error"]
    assert "details" in body["error"]


async def test_error_envelope_validation_error(client: AsyncClient) -> None:
    response = await client.post("/api/v1/use-cases", json={"name": ""})
    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert "errors" in body["error"]["details"]


async def test_partial_update_preserves_other_fields(client: AsyncClient) -> None:
    create_resp = await client.post(
        "/api/v1/use-cases",
        json={
            "name": "Original",
            "mitre_tactics": ["TA0001"],
            "description": "Keep this",
        },
    )
    use_case_id = create_resp.json()["id"]

    response = await client.put(f"/api/v1/use-cases/{use_case_id}", json={"name": "Renamed"})
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Renamed"
    assert data["mitre_tactics"] == ["TA0001"]
    assert data["description"] == "Keep this"
