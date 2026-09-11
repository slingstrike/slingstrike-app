import datetime
import re
from typing import Any, Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

OBJECT_TYPES = {"ipv4", "ipv6", "hostname", "username", "port", "filepath", "url", "string"}


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
    return slug or "object"


class ObjectGroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)
    type: str = Field(default="string")
    values: list[str] = Field(default_factory=list)
    category: str = Field(default="", max_length=60)

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        if v not in OBJECT_TYPES:
            raise ValueError(f"type must be one of: {', '.join(sorted(OBJECT_TYPES))}")
        return v


class ObjectGroupUpdate(ObjectGroupCreate):
    pass


class ObjectGroupResponse(BaseModel):
    id: int
    name: str
    placeholder: str | None = None
    description: str
    type: str
    values: list[str]
    category: str
    usage_count: int = 0
    created_at: datetime.datetime
    updated_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="after")
    def _ensure_placeholder(self) -> Self:
        if not self.placeholder:
            self.placeholder = slugify(self.name)
        return self
