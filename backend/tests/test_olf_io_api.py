"""Tests for api/olf_io.py - .olf import/export endpoints."""

import io
import textwrap
import zipfile
from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from database import Base, get_db
from main import app

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
async def db_session(tmp_path: pytest.TempPathFactory) -> AsyncGenerator[AsyncSession, None]:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path}/olf_io_test.db")
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


# ---------------------------------------------------------------------------
# Minimal valid .olf bytes fixture
# ---------------------------------------------------------------------------

_VALID_OLF = textwrap.dedent("""\
    olf_version: "1.0"
    id: "550e8400-e29b-41d4-a716-446655440000"
    name: "SSH Brute Force"
    description: "Test description"
    tier: community
    visibility: public_readonly
    created_by: "Jane Smith"
    created_at: "2026-06-06T12:00:00Z"
    last_edited_at: "2026-06-06T12:00:00Z"
    exported_at: "2026-06-27T10:00:00Z"
    imported_at: null
    classification:
      mitre_tactics:
        - TA0006
      tags:
        - linux
    log_events:
      - sequence: 1
        format: syslog_rfc5424
        template: "static message"
""").encode()

_OTHER_OLF = textwrap.dedent("""\
    olf_version: "1.0"
    id: "660e8400-e29b-41d4-a716-446655440001"
    name: "RDP Password Spray"
    tier: community
    visibility: private
    created_by: "Bob"
    created_at: "2026-06-07T10:00:00Z"
    last_edited_at: "2026-06-07T10:00:00Z"
    exported_at: "2026-06-27T10:00:00Z"
    log_events:
      - sequence: 1
        format: custom
        template: "rdp attempt"
""").encode()


def _make_zip(*files: tuple[str, bytes]) -> bytes:
    """Build a ZIP archive from (filename, content) pairs."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name, content in files:
            zf.writestr(name, content)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Single .olf import - happy path
# ---------------------------------------------------------------------------


async def test_import_olf_success(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/use-cases/import",
        files={"file": ("ssh.olf", _VALID_OLF, "application/yaml")},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "imported"
    assert data["use_case"]["name"] == "SSH Brute Force"
    assert data["use_case"]["uuid"] == "550e8400-e29b-41d4-a716-446655440000"
    assert data["use_case"]["visibility"] == "public_readonly"
    assert data["warnings"] == []


async def test_import_olf_populates_classification(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/use-cases/import",
        files={"file": ("ssh.olf", _VALID_OLF, "application/yaml")},
    )
    assert response.status_code == 200
    uc = response.json()["use_case"]
    assert "TA0006" in uc["mitre_tactics"]
    assert "linux" in uc["tags"]


async def test_import_olf_imported_at_is_set(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/use-cases/import",
        files={"file": ("ssh.olf", _VALID_OLF, "application/yaml")},
    )
    assert response.status_code == 200
    uc = response.json()["use_case"]
    # imported_at should be set to now, not null
    assert uc["imported_at"] is not None


# ---------------------------------------------------------------------------
# Single .olf import - conflict resolution
# ---------------------------------------------------------------------------


async def test_import_olf_default_skip_on_conflict(client: AsyncClient) -> None:
    # First import
    await client.post(
        "/api/v1/use-cases/import",
        files={"file": ("ssh.olf", _VALID_OLF, "application/yaml")},
    )
    # Second import of the same file - default policy is skip
    r2 = await client.post(
        "/api/v1/use-cases/import",
        files={"file": ("ssh.olf", _VALID_OLF, "application/yaml")},
    )
    assert r2.status_code == 200
    assert r2.json()["status"] == "skipped"


async def test_import_olf_overwrite_on_conflict(client: AsyncClient) -> None:
    await client.post(
        "/api/v1/use-cases/import",
        files={"file": ("ssh.olf", _VALID_OLF, "application/yaml")},
    )
    modified = _VALID_OLF.replace(b'"SSH Brute Force"', b'"SSH Brute Force - Updated"')
    r2 = await client.post(
        "/api/v1/use-cases/import",
        files={"file": ("ssh.olf", modified, "application/yaml")},
        params={"conflict_policy": "overwrite"},
    )
    assert r2.status_code == 200
    data = r2.json()
    assert data["status"] == "overwritten"
    assert data["use_case"]["name"] == "SSH Brute Force - Updated"


async def test_import_olf_import_as_new_on_conflict(client: AsyncClient) -> None:
    await client.post(
        "/api/v1/use-cases/import",
        files={"file": ("ssh.olf", _VALID_OLF, "application/yaml")},
    )
    r2 = await client.post(
        "/api/v1/use-cases/import",
        files={"file": ("ssh.olf", _VALID_OLF, "application/yaml")},
        params={"conflict_policy": "import_as_new"},
    )
    assert r2.status_code == 200
    data = r2.json()
    assert data["status"] == "imported"
    # New UUID was generated - must differ from the original
    assert data["use_case"]["uuid"] != "550e8400-e29b-41d4-a716-446655440000"


# ---------------------------------------------------------------------------
# Single .olf import - error cases
# ---------------------------------------------------------------------------


async def test_import_olf_rejects_oversized_file(client: AsyncClient) -> None:
    oversized = b"x" * (1_000_001)
    response = await client.post(
        "/api/v1/use-cases/import",
        files={"file": ("big.olf", oversized, "application/yaml")},
    )
    assert response.status_code == 413


async def test_import_olf_rejects_invalid_yaml(client: AsyncClient) -> None:
    bad = b": this is not valid yaml\n\x00\xff"
    response = await client.post(
        "/api/v1/use-cases/import",
        files={"file": ("bad.olf", bad, "application/yaml")},
    )
    assert response.status_code == 422


async def test_import_olf_rejects_wrong_version(client: AsyncClient) -> None:
    content = _VALID_OLF.replace(b'"1.0"', b'"2.0"')
    response = await client.post(
        "/api/v1/use-cases/import",
        files={"file": ("v2.olf", content, "application/yaml")},
    )
    assert response.status_code == 422


async def test_import_olf_rejects_premium_tier(client: AsyncClient) -> None:
    content = _VALID_OLF.replace(b"tier: community", b"tier: premium")
    response = await client.post(
        "/api/v1/use-cases/import",
        files={"file": ("premium.olf", content, "application/yaml")},
    )
    assert response.status_code == 422


async def test_import_olf_rejects_invalid_schema(client: AsyncClient) -> None:
    content = _VALID_OLF.replace(b'"SSH Brute Force"', b'"  "')
    response = await client.post(
        "/api/v1/use-cases/import",
        files={"file": ("invalid.olf", content, "application/yaml")},
    )
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Batch ZIP import
# ---------------------------------------------------------------------------


async def test_batch_import_two_files(client: AsyncClient) -> None:
    zip_bytes = _make_zip(
        ("550e8400-e29b-41d4-a716-446655440000.olf", _VALID_OLF),
        ("660e8400-e29b-41d4-a716-446655440001.olf", _OTHER_OLF),
    )
    response = await client.post(
        "/api/v1/use-cases/import/batch",
        files={"file": ("batch.zip", zip_bytes, "application/zip")},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 2
    assert data["imported"] == 2
    assert data["failed"] == 0
    assert len(data["results"]) == 2


async def test_batch_import_ignores_non_olf_entries(client: AsyncClient) -> None:
    zip_bytes = _make_zip(
        ("readme.txt", b"ignore me"),
        ("550e8400-e29b-41d4-a716-446655440000.olf", _VALID_OLF),
    )
    response = await client.post(
        "/api/v1/use-cases/import/batch",
        files={"file": ("batch.zip", zip_bytes, "application/zip")},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["imported"] == 1


async def test_batch_import_conflict_skip(client: AsyncClient) -> None:
    # Pre-import one file
    await client.post(
        "/api/v1/use-cases/import",
        files={"file": ("ssh.olf", _VALID_OLF, "application/yaml")},
    )
    zip_bytes = _make_zip(
        ("550e8400-e29b-41d4-a716-446655440000.olf", _VALID_OLF),
        ("660e8400-e29b-41d4-a716-446655440001.olf", _OTHER_OLF),
    )
    response = await client.post(
        "/api/v1/use-cases/import/batch",
        files={"file": ("batch.zip", zip_bytes, "application/zip")},
        params={"conflict_policy": "skip"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["skipped"] == 1
    assert data["imported"] == 1


async def test_batch_import_records_parse_errors(client: AsyncClient) -> None:
    invalid = _VALID_OLF.replace(b'"1.0"', b'"99.0"')
    zip_bytes = _make_zip(
        ("bad.olf", invalid),
        ("660e8400-e29b-41d4-a716-446655440001.olf", _OTHER_OLF),
    )
    response = await client.post(
        "/api/v1/use-cases/import/batch",
        files={"file": ("batch.zip", zip_bytes, "application/zip")},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["failed"] == 1
    assert data["imported"] == 1
    failed = next(r for r in data["results"] if r["error"] is not None)
    assert failed["error_code"] == "OLF_VERSION_UNSUPPORTED"


async def test_batch_import_rejects_path_traversal(client: AsyncClient) -> None:
    zip_bytes = _make_zip(("../evil.olf", _VALID_OLF))
    response = await client.post(
        "/api/v1/use-cases/import/batch",
        files={"file": ("batch.zip", zip_bytes, "application/zip")},
    )
    assert response.status_code == 400


async def test_batch_import_rejects_bad_zip(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/use-cases/import/batch",
        files={"file": ("notazip.zip", b"this is not a zip", "application/zip")},
    )
    assert response.status_code == 400


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------


async def test_export_olf_success(client: AsyncClient) -> None:
    # Import first, then export
    import_resp = await client.post(
        "/api/v1/use-cases/import",
        files={"file": ("ssh.olf", _VALID_OLF, "application/yaml")},
    )
    use_case_id = import_resp.json()["use_case"]["id"]

    response = await client.get(f"/api/v1/use-cases/{use_case_id}/export")
    assert response.status_code == 200
    assert "yaml" in response.headers["content-type"]
    assert "attachment" in response.headers["content-disposition"]
    assert ".olf" in response.headers["content-disposition"]


async def test_export_olf_is_parseable(client: AsyncClient) -> None:
    import_resp = await client.post(
        "/api/v1/use-cases/import",
        files={"file": ("ssh.olf", _VALID_OLF, "application/yaml")},
    )
    use_case_id = import_resp.json()["use_case"]["id"]

    export_resp = await client.get(f"/api/v1/use-cases/{use_case_id}/export")
    from core.olf_parser import parse_olf

    doc, _ = parse_olf(export_resp.content)
    assert doc.name == "SSH Brute Force"
    assert doc.olf_version == "1.0"
    assert doc.tier == "community"


async def test_export_olf_sets_exported_at(client: AsyncClient) -> None:
    import_resp = await client.post(
        "/api/v1/use-cases/import",
        files={"file": ("ssh.olf", _VALID_OLF, "application/yaml")},
    )
    use_case_id = import_resp.json()["use_case"]["id"]
    export_resp = await client.get(f"/api/v1/use-cases/{use_case_id}/export")

    from ruamel.yaml import YAML

    y = YAML()
    doc = y.load(export_resp.content)
    assert doc["exported_at"].endswith("Z")
    # exported_at must differ from the original (it is always set at export time)
    assert doc["exported_at"] != "2026-06-27T10:00:00Z"


async def test_export_olf_not_found(client: AsyncClient) -> None:
    response = await client.get("/api/v1/use-cases/9999/export")
    assert response.status_code == 404


async def test_export_olf_rejects_premium(client: AsyncClient, db_session: AsyncSession) -> None:
    import uuid

    from models.use_case import UseCase

    uc = UseCase(
        name="Premium UC",
        uuid=str(uuid.uuid4()),
        tier="premium",
        log_events=[{"sequence": 1, "format": "custom", "template": "msg"}],
    )
    db_session.add(uc)
    await db_session.commit()
    await db_session.refresh(uc)

    response = await client.get(f"/api/v1/use-cases/{uc.id}/export")
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Round-trip: create via CRUD then export, re-import
# ---------------------------------------------------------------------------


async def test_crud_create_then_export_then_reimport(client: AsyncClient) -> None:
    create_resp = await client.post(
        "/api/v1/use-cases",
        json={
            "name": "My Use Case",
            "created_by": "Tester",
            "visibility": "private",
            "log_events": [{"sequence": 1, "format": "custom", "template": "static log"}],
            "mitre_tactics": ["TA0001"],
        },
    )
    assert create_resp.status_code == 201
    uc_id = create_resp.json()["id"]

    export_resp = await client.get(f"/api/v1/use-cases/{uc_id}/export")
    assert export_resp.status_code == 200

    reimport_resp = await client.post(
        "/api/v1/use-cases/import",
        files={"file": ("exported.olf", export_resp.content, "application/yaml")},
        params={"conflict_policy": "overwrite"},
    )
    assert reimport_resp.status_code == 200
    data = reimport_resp.json()
    assert data["status"] in ("imported", "overwritten")
    assert data["use_case"]["name"] == "My Use Case"


async def test_export_embeds_object_reference_and_reimports_clean(client: AsyncClient) -> None:
    """End-to-end for project_objects_no_olf_spec_representation: a use case
    referencing a My Object (both implicitly via bare placeholder, and
    explicitly via source: group) must export as valid .olf and re-import
    without needing the original Object to exist."""
    obj_resp = await client.post(
        "/api/v1/objects",
        json={"name": "Test Hostnames", "type": "hostname", "values": ["WS-ALPHA", "WS-BETA"]},
    )
    assert obj_resp.status_code == 201
    placeholder = obj_resp.json()["placeholder"]

    create_resp = await client.post(
        "/api/v1/use-cases",
        json={
            "name": "Object export test",
            "created_by": "Tester",
            "visibility": "private",
            "log_events": [
                {
                    "sequence": 1,
                    "format": "custom",
                    "template": f"implicit={{{{ {placeholder} }}}} explicit={{{{ explicit }}}}",
                    "variables": {
                        "explicit": {
                            "type": "string",
                            "source": "group",
                            "group": "Test Hostnames",
                        }
                    },
                }
            ],
        },
    )
    assert create_resp.status_code == 201
    uc_id = create_resp.json()["id"]

    export_resp = await client.get(f"/api/v1/use-cases/{uc_id}/export")
    assert export_resp.status_code == 200

    from core.olf_parser import parse_olf

    doc, warnings = parse_olf(export_resp.content)
    implicit_spec = doc.log_events[0].variables[placeholder]
    explicit_spec = doc.log_events[0].variables["explicit"]
    assert implicit_spec.type.value == "enum"
    assert set(implicit_spec.values) == {"WS-ALPHA", "WS-BETA"}
    assert explicit_spec.type.value == "enum"
    assert set(explicit_spec.values) == {"WS-ALPHA", "WS-BETA"}

    # Re-import onto an instance with no matching Object at all - must still succeed,
    # since the values are now embedded rather than referenced externally.
    reimport_resp = await client.post(
        "/api/v1/use-cases/import",
        files={"file": ("exported.olf", export_resp.content, "application/yaml")},
        params={"conflict_policy": "import_as_new"},
    )
    assert reimport_resp.status_code == 200
    assert reimport_resp.json()["status"] == "imported"
