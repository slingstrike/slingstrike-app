from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from database import Base, get_db
from main import app

_VALID_PAYLOAD = {"name": "Source IP", "type": "ipv4", "category": "Network"}


@pytest.fixture
async def db_session(tmp_path: pytest.TempPathFactory) -> AsyncGenerator[AsyncSession, None]:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path}/uv_test.db")
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


async def test_list_variables_empty(client: AsyncClient) -> None:
    response = await client.get("/api/v1/variables")
    assert response.status_code == 200
    data = response.json()
    assert data["items"] == []
    assert data["total_count"] == 0
    assert data["next_cursor"] is None


async def test_create_variable(client: AsyncClient) -> None:
    response = await client.post("/api/v1/variables", json=_VALID_PAYLOAD)
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Source IP"
    assert data["type"] == "ipv4"
    assert data["placeholder"] == "_source_ip"
    assert data["category"] == "Network"
    assert "id" in data
    assert "created_at" in data
    assert "updated_at" in data


async def test_create_variable_auto_placeholder_slug(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/variables", json={"name": "My   Weird--Name!", "type": "uuid"}
    )
    assert response.status_code == 201
    assert response.json()["placeholder"].startswith("_")


async def test_create_variable_placeholder_collision_resolved(client: AsyncClient) -> None:
    await client.post("/api/v1/variables", json={"name": "Source IP", "type": "ipv4"})
    response = await client.post(
        "/api/v1/variables", json={"name": "Source  IP", "type": "ipv4"}
    )
    assert response.status_code == 201
    placeholder = response.json()["placeholder"]
    assert placeholder == "_source_ip_2"


async def test_create_variable_rejects_invalid_type(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/variables", json={"name": "Bad", "type": "not_a_type"}
    )
    assert response.status_code == 422


async def test_create_variable_rejects_empty_name(client: AsyncClient) -> None:
    response = await client.post("/api/v1/variables", json={"name": "", "type": "ipv4"})
    assert response.status_code == 422


async def test_create_variable_duplicate_name_conflict(client: AsyncClient) -> None:
    await client.post("/api/v1/variables", json=_VALID_PAYLOAD)
    response = await client.post("/api/v1/variables", json=_VALID_PAYLOAD)
    assert response.status_code == 409


async def test_get_variable(client: AsyncClient) -> None:
    created = (await client.post("/api/v1/variables", json=_VALID_PAYLOAD)).json()
    response = await client.get(f"/api/v1/variables/{created['id']}")
    assert response.status_code == 200
    assert response.json()["name"] == "Source IP"


async def test_get_variable_not_found(client: AsyncClient) -> None:
    response = await client.get("/api/v1/variables/9999")
    assert response.status_code == 404


async def test_list_variables_ordered_by_name(client: AsyncClient) -> None:
    for name in ("Zebra", "Alpha", "Middle"):
        await client.post("/api/v1/variables", json={"name": name, "type": "ipv4"})
    response = await client.get("/api/v1/variables")
    names = [v["name"] for v in response.json()["items"]]
    assert names == ["Alpha", "Middle", "Zebra"]


async def test_list_variables_pagination_cursor(client: AsyncClient) -> None:
    for i in range(5):
        await client.post("/api/v1/variables", json={"name": f"Var {i:02d}", "type": "port"})
    first = await client.get("/api/v1/variables", params={"limit": 3})
    page1 = first.json()
    assert len(page1["items"]) == 3
    assert page1["total_count"] == 5
    assert page1["next_cursor"] is not None

    second = await client.get("/api/v1/variables", params={"cursor": page1["next_cursor"], "limit": 3})
    page2 = second.json()
    assert len(page2["items"]) == 2
    assert page2["next_cursor"] is None


async def test_list_variables_invalid_cursor(client: AsyncClient) -> None:
    response = await client.get("/api/v1/variables", params={"cursor": "!!!bad!!!"})
    assert response.status_code == 422


async def test_update_variable(client: AsyncClient) -> None:
    created = (await client.post("/api/v1/variables", json=_VALID_PAYLOAD)).json()
    response = await client.put(
        f"/api/v1/variables/{created['id']}",
        json={"name": "Source IP", "type": "ipv4", "description": "Updated desc", "category": "Network"},
    )
    assert response.status_code == 200
    assert response.json()["description"] == "Updated desc"


async def test_update_variable_name_change_updates_placeholder(client: AsyncClient) -> None:
    created = (await client.post("/api/v1/variables", json=_VALID_PAYLOAD)).json()
    response = await client.put(
        f"/api/v1/variables/{created['id']}",
        json={"name": "Destination IP", "type": "ipv4", "category": "Network"},
    )
    assert response.status_code == 200
    assert response.json()["placeholder"] == "_destination_ip"


async def test_update_variable_not_found(client: AsyncClient) -> None:
    response = await client.put(
        "/api/v1/variables/9999",
        json={"name": "X", "type": "ipv4"},
    )
    assert response.status_code == 404


async def test_update_variable_duplicate_name_conflict(client: AsyncClient) -> None:
    v1 = (await client.post("/api/v1/variables", json=_VALID_PAYLOAD)).json()
    await client.post("/api/v1/variables", json={"name": "Other Var", "type": "uuid"})
    response = await client.put(
        f"/api/v1/variables/{v1['id']}",
        json={"name": "Other Var", "type": "ipv4"},
    )
    assert response.status_code == 409


async def test_delete_variable(client: AsyncClient) -> None:
    created = (await client.post("/api/v1/variables", json=_VALID_PAYLOAD)).json()
    response = await client.delete(f"/api/v1/variables/{created['id']}")
    assert response.status_code == 204

    get_resp = await client.get(f"/api/v1/variables/{created['id']}")
    assert get_resp.status_code == 404


async def test_delete_variable_not_found(client: AsyncClient) -> None:
    response = await client.delete("/api/v1/variables/9999")
    assert response.status_code == 404


async def test_create_variable_with_params(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/variables",
        json={"name": "Request Count", "type": "integer", "params": {"min": 1, "max": 1000}},
    )
    assert response.status_code == 201
    assert response.json()["params"] == {"min": 1, "max": 1000}
