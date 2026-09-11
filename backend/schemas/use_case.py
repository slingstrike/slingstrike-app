from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


def _validate_log_events_repeat(log_events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Enforce the .olf spec's repeat bound (0-128) on directly-created/edited use cases.

    Unbounded repeat could otherwise be used to make the forger loop far past what
    the UI's 0-128 range allows, so this is enforced here rather than relying on
    frontend validation alone.
    """
    for idx, event in enumerate(log_events):
        repeat = event.get("repeat")
        if repeat is None:
            continue
        if not isinstance(repeat, int) or isinstance(repeat, bool) or not (0 <= repeat <= 128):
            raise ValueError(f"log_events[{idx}].repeat must be an integer between 0 and 128")
    return log_events


class Tier(str):
    COMMUNITY = "community"
    PREMIUM = "premium"


class Visibility(str):
    PRIVATE = "private"
    PUBLIC_READONLY = "public_readonly"
    PUBLIC_COLLABORATIVE = "public_collaborative"


class UseCaseBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    description: str = Field(default="")
    tier: str = Field(default="community")
    visibility: str = Field(default="private")
    created_by: str = Field(default="")
    log_source: dict[str, Any] | None = None
    log_events: list[dict[str, Any]] = Field(default_factory=list)
    mitre_tactics: list[str] = Field(default_factory=list)
    mitre_techniques: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    target_ids: list[str] = Field(default_factory=list)
    run_count: int = Field(default=1, ge=1)
    run_delay_ms: int = Field(default=1, ge=1)

    @field_validator("log_events")
    @classmethod
    def _check_repeat(cls, v: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return _validate_log_events_repeat(v)


class UseCaseCreate(UseCaseBase):
    uuid: str | None = Field(default=None)


class UseCaseUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None
    visibility: str | None = None
    created_by: str | None = None
    log_source: dict[str, Any] | None = None
    log_events: list[dict[str, Any]] | None = None
    mitre_tactics: list[str] | None = None
    mitre_techniques: list[str] | None = None
    tags: list[str] | None = None
    target_ids: list[str] | None = None
    run_count: int | None = Field(default=None, ge=1)
    run_delay_ms: int | None = Field(default=None, ge=1)

    @field_validator("log_events")
    @classmethod
    def _check_repeat(cls, v: list[dict[str, Any]] | None) -> list[dict[str, Any]] | None:
        if v is None:
            return v
        return _validate_log_events_repeat(v)


class UseCaseResponse(UseCaseBase):
    id: int
    uuid: str
    last_edited_at: datetime
    imported_at: datetime | None
    owner_id: int | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
