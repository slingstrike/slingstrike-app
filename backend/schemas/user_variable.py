import datetime
import re

from pydantic import BaseModel, ConfigDict, Field, field_validator

VARIABLE_TYPES = {
    "timestamp", "ipv4", "port", "mac_address", "hostname",
    "username", "uuid", "integer", "hash",
}


def slugify_var(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
    return f"_{slug or 'var'}"


class UserVariableCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)
    type: str
    category: str = Field(default="", max_length=60)
    params: dict[str, object] = Field(default_factory=dict)

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        if v not in VARIABLE_TYPES:
            raise ValueError(f"type must be one of: {', '.join(sorted(VARIABLE_TYPES))}")
        return v


class UserVariableUpdate(UserVariableCreate):
    pass


class UserVariableResponse(BaseModel):
    id: int
    name: str
    placeholder: str
    description: str
    type: str
    category: str
    params: dict[str, object]
    usage_count: int = 0
    created_at: datetime.datetime
    updated_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)
