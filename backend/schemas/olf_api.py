"""Response schemas for the .olf import/export API endpoints."""

from enum import Enum

from pydantic import BaseModel

from schemas.use_case import UseCaseResponse


class ConflictPolicy(str, Enum):
    SKIP = "skip"
    OVERWRITE = "overwrite"
    IMPORT_AS_NEW = "import_as_new"


class ImportStatus(str, Enum):
    IMPORTED = "imported"
    OVERWRITTEN = "overwritten"
    SKIPPED = "skipped"


class ImportResult(BaseModel):
    status: ImportStatus
    use_case: UseCaseResponse | None = None
    warnings: list[str] = []


class BatchFileResult(BaseModel):
    filename: str
    status: ImportStatus | None = None
    use_case: UseCaseResponse | None = None
    warnings: list[str] = []
    error: str | None = None
    error_code: str | None = None


class BatchImportResult(BaseModel):
    results: list[BatchFileResult]
    total: int
    imported: int
    overwritten: int
    skipped: int
    failed: int
