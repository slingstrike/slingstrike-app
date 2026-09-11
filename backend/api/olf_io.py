"""OLF import/export REST API endpoints.

Import pipeline (per olf-format spec):
  Steps 1-4 are handled by core.olf_parser.parse_olf().
  Step 5 (UUID conflict resolution) and Step 6 (persistence) are implemented here.

Endpoints:
  POST /use-cases/import         - single .olf file
  POST /use-cases/import/batch   - ZIP of .olf files
  GET  /use-cases/{id}/export    - export use case to .olf YAML
"""

import io
import uuid as uuid_mod
import zipfile
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.olf_errors import OlfError
from core.olf_parser import OLF_MAX_FILE_SIZE, parse_olf
from core.olf_writer import write_olf
from database import get_db
from models.object_group import ObjectGroup
from models.use_case import UseCase
from schemas.olf import OlfDocument
from schemas.olf_api import (
    BatchFileResult,
    BatchImportResult,
    ConflictPolicy,
    ImportResult,
    ImportStatus,
)
from schemas.use_case import UseCaseResponse

router = APIRouter(tags=["olf"])

# Batch import resource limits (spec §Import Rules - Batch Import)
_BATCH_MAX_ENTRIES = 100
_BATCH_MAX_PER_FILE = OLF_MAX_FILE_SIZE  # 1 MB
_BATCH_MAX_TOTAL = 50 * 1_000_000  # 50 MB


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _parse_ts(ts_str: str) -> datetime:
    """Parse a spec-compliant Z-suffix ISO 8601 timestamp to a naive UTC datetime."""
    fmt = "%Y-%m-%dT%H:%M:%S.%fZ" if "." in ts_str else "%Y-%m-%dT%H:%M:%SZ"
    return datetime.strptime(ts_str, fmt)


async def _load_all_objects(db: AsyncSession) -> dict[str, list[str]]:
    """Dual-keyed {name: values, placeholder: values} map for every My Object -
    matches backend/api/send.py:_load_objects' key convention, used by
    write_olf to embed Object references as native enum variables on export.
    """
    rows = list((await db.execute(select(ObjectGroup))).scalars())
    result: dict[str, list[str]] = {}
    for row in rows:
        vals = list(row.values or [])
        result[row.name] = vals
        result[row.placeholder] = vals
    return result


def _doc_to_use_case(doc: OlfDocument, effective_uuid: str) -> UseCase:
    """Build a UseCase ORM instance from a validated OlfDocument."""
    log_source: dict[str, Any] | None = None
    if doc.log_source:
        log_source = {
            "category": doc.log_source.category.value if doc.log_source.category else None,
            "platform": doc.log_source.platform,
        }

    classification = doc.classification
    return UseCase(
        uuid=effective_uuid,
        name=doc.name,
        description=doc.description or "",
        tier="community",
        visibility=doc.visibility.value,
        created_by=doc.created_by,
        created_at=_parse_ts(doc.created_at),
        last_edited_at=_parse_ts(doc.last_edited_at),
        imported_at=datetime.now(UTC).replace(tzinfo=None),
        log_source=log_source,
        log_events=[ev.model_dump(mode="json") for ev in doc.log_events],
        mitre_tactics=classification.mitre_tactics if classification else [],
        mitre_techniques=classification.mitre_techniques if classification else [],
        tags=classification.tags if classification else [],
    )


async def _resolve_and_persist(
    doc: OlfDocument,
    warnings: list[str],
    conflict_policy: ConflictPolicy,
    db: AsyncSession,
) -> tuple[ImportStatus, UseCase]:
    """Implement Step 5 (UUID conflict) and Step 6 (persistence).

    Returns (status, persisted_use_case).
    """
    # Step 5: UUID conflict resolution
    result = await db.execute(select(UseCase).where(UseCase.uuid == doc.id))
    existing: UseCase | None = result.scalar_one_or_none()

    if existing is not None:
        if conflict_policy == ConflictPolicy.SKIP:
            return ImportStatus.SKIPPED, existing

        if conflict_policy == ConflictPolicy.IMPORT_AS_NEW:
            effective_uuid = str(uuid_mod.uuid4())
            import_status = ImportStatus.IMPORTED
        else:  # OVERWRITE
            effective_uuid = doc.id
            import_status = ImportStatus.OVERWRITTEN
    else:
        effective_uuid = doc.id
        import_status = ImportStatus.IMPORTED

    # Step 6: persistence
    if existing is not None and conflict_policy == ConflictPolicy.OVERWRITE:
        # Update the existing record in place
        existing.name = doc.name
        existing.description = doc.description or ""
        existing.visibility = doc.visibility.value
        existing.created_by = doc.created_by
        existing.created_at = _parse_ts(doc.created_at)
        existing.last_edited_at = _parse_ts(doc.last_edited_at)
        existing.imported_at = datetime.now(UTC).replace(tzinfo=None)
        if doc.log_source:
            existing.log_source = {
                "category": doc.log_source.category.value if doc.log_source.category else None,
                "platform": doc.log_source.platform,
            }
        else:
            existing.log_source = None
        existing.log_events = [ev.model_dump(mode="json") for ev in doc.log_events]
        cl = doc.classification
        existing.mitre_tactics = cl.mitre_tactics if cl else []
        existing.mitre_techniques = cl.mitre_techniques if cl else []
        existing.tags = cl.tags if cl else []
        await db.commit()
        await db.refresh(existing)
        return import_status, existing
    else:
        uc = _doc_to_use_case(doc, effective_uuid)
        db.add(uc)
        await db.commit()
        await db.refresh(uc)
        return import_status, uc


# ---------------------------------------------------------------------------
# Single .olf import
# ---------------------------------------------------------------------------


@router.post(
    "/use-cases/import",
    response_model=ImportResult,
    status_code=status.HTTP_200_OK,
    summary="Import a single community .olf use case file",
)
async def import_olf(
    file: UploadFile,
    conflict_policy: ConflictPolicy = Query(default=ConflictPolicy.SKIP),
    db: AsyncSession = Depends(get_db),
) -> ImportResult:
    raw = await file.read()

    # File size check - HTTP 413 before YAML parsing (spec §Import Rules)
    if len(raw) > OLF_MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File exceeds the 1 MB limit for a single .olf file",
        )

    try:
        doc, warnings = parse_olf(raw)
    except OlfError as exc:
        raise HTTPException(
            status_code=_olf_error_status(exc.code),
            detail={"error": {"code": exc.code, "message": exc.message, "details": exc.details}},
        ) from exc

    import_status, uc = await _resolve_and_persist(doc, warnings, conflict_policy, db)
    return ImportResult(
        status=import_status,
        use_case=UseCaseResponse.model_validate(uc),
        warnings=warnings,
    )


# ---------------------------------------------------------------------------
# Batch .zip import
# ---------------------------------------------------------------------------


@router.post(
    "/use-cases/import/batch",
    response_model=BatchImportResult,
    status_code=status.HTTP_200_OK,
    summary="Import a ZIP archive of community .olf use case files",
)
async def import_olf_batch(
    file: UploadFile,
    conflict_policy: ConflictPolicy = Query(default=ConflictPolicy.SKIP),
    db: AsyncSession = Depends(get_db),
) -> BatchImportResult:
    raw = await file.read()

    # Validate ZIP structure - central directory read first (spec requirement)
    try:
        zf = zipfile.ZipFile(io.BytesIO(raw))
    except zipfile.BadZipFile as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": {
                    "code": "OLF_PACKAGE_INVALID",
                    "message": "Not a valid ZIP archive",
                    "details": {},
                }
            },
        ) from exc

    with zf:
        entries = zf.infolist()

        # Path traversal check - all entries, before extension filtering (spec requirement)
        for entry in entries:
            name = entry.filename
            if ".." in name or name.startswith("/"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "error": {
                            "code": "OLF_PACKAGE_INVALID",
                            "message": f"ZIP entry '{name}' contains path traversal sequence",
                            "details": {},
                        }
                    },
                )

        # Count .olf entries from the central directory before reading any content
        olf_entries = [e for e in entries if e.filename.lower().endswith(".olf")]

        if len(olf_entries) > _BATCH_MAX_ENTRIES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": {
                        "code": "OLF_PACKAGE_INVALID",
                        "message": (
                            f"Batch ZIP exceeds maximum of {_BATCH_MAX_ENTRIES} .olf entries"
                        ),
                        "details": {},
                    }
                },
            )

        results: list[BatchFileResult] = []
        total_uncompressed = 0

        for entry in olf_entries:
            filename = entry.filename

            # Per-file size limit enforced on bytes read, not declared size
            if entry.file_size > _BATCH_MAX_PER_FILE:
                results.append(
                    BatchFileResult(
                        filename=filename,
                        error="File exceeds the 1 MB per-file limit",
                        error_code="OLF_PACKAGE_INVALID",
                    )
                )
                # Abort entire batch on first oversized file (HTTP 413)
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail={
                        "error": {
                            "code": "OLF_PACKAGE_INVALID",
                            "message": f"Entry '{filename}' exceeds the 1 MB per-file limit",
                            "details": {},
                        }
                    },
                )

            raw_entry = zf.read(filename)
            actual_size = len(raw_entry)

            # Enforce per-file limit on actual decompressed bytes
            if actual_size > _BATCH_MAX_PER_FILE:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail={
                        "error": {
                            "code": "OLF_PACKAGE_INVALID",
                            "message": (
                                f"Entry '{filename}' exceeds the 1 MB per-file limit"
                                " after decompression"
                            ),
                            "details": {},
                        }
                    },
                )

            total_uncompressed += actual_size
            if total_uncompressed > _BATCH_MAX_TOTAL:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail={
                        "error": {
                            "code": "OLF_PACKAGE_INVALID",
                            "message": "Batch ZIP total uncompressed size exceeds 50 MB limit",
                            "details": {},
                        }
                    },
                )

            try:
                doc, warnings = parse_olf(raw_entry)
            except OlfError as exc:
                results.append(
                    BatchFileResult(
                        filename=filename,
                        error=exc.message,
                        error_code=exc.code,
                    )
                )
                continue

            import_status, uc = await _resolve_and_persist(doc, warnings, conflict_policy, db)
            results.append(
                BatchFileResult(
                    filename=filename,
                    status=import_status,
                    use_case=UseCaseResponse.model_validate(uc),
                    warnings=warnings,
                )
            )

    counts = _tally(results)
    return BatchImportResult(results=results, total=len(olf_entries), **counts)


def _tally(results: list[BatchFileResult]) -> dict[str, int]:
    imported = sum(1 for r in results if r.status == ImportStatus.IMPORTED)
    overwritten = sum(1 for r in results if r.status == ImportStatus.OVERWRITTEN)
    skipped = sum(1 for r in results if r.status == ImportStatus.SKIPPED)
    failed = sum(1 for r in results if r.error is not None)
    return {"imported": imported, "overwritten": overwritten, "skipped": skipped, "failed": failed}


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------


@router.get(
    "/use-cases/{use_case_id}/export",
    summary="Export a community use case to .olf YAML",
    responses={
        200: {
            "content": {"application/yaml": {}},
            "description": "The .olf YAML file",
        }
    },
)
async def export_olf(
    use_case_id: int,
    db: AsyncSession = Depends(get_db),
) -> Response:
    uc: UseCase | None = await db.get(UseCase, use_case_id)
    if uc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Use case not found")

    if uc.tier == "premium":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": {
                    "code": "OLF_INVALID_TIER",
                    "message": "Premium use cases cannot be exported to .olf format. "
                    "Export a community clone instead.",
                    "details": {},
                }
            },
        )

    try:
        objects = await _load_all_objects(db)
        yaml_bytes = write_olf(uc, objects)
    except OlfError as exc:
        raise HTTPException(
            status_code=_olf_error_status(exc.code),
            detail={"error": {"code": exc.code, "message": exc.message, "details": exc.details}},
        ) from exc

    filename = f"{uc.uuid}.olf"
    return Response(
        content=yaml_bytes,
        media_type="application/yaml",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# Error code -> HTTP status mapping
# ---------------------------------------------------------------------------


def _olf_error_status(code: str) -> int:
    return {
        "OLF_SCHEMA_INVALID": status.HTTP_422_UNPROCESSABLE_ENTITY,
        "OLF_VERSION_UNSUPPORTED": status.HTTP_422_UNPROCESSABLE_ENTITY,
        "OLF_INVALID_TIER": status.HTTP_422_UNPROCESSABLE_ENTITY,
        "OLF_PACKAGE_INVALID": status.HTTP_400_BAD_REQUEST,
        "OLF_ACTIVATION_FAILED": status.HTTP_422_UNPROCESSABLE_ENTITY,
        "OLF_PREMIUM_VERSION_UNSUPPORTED": status.HTTP_422_UNPROCESSABLE_ENTITY,
    }.get(code, status.HTTP_422_UNPROCESSABLE_ENTITY)
