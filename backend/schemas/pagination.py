import base64
import json
from typing import Any, Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    next_cursor: str | None
    total_count: int


def encode_cursor(data: dict[str, Any]) -> str:
    return base64.urlsafe_b64encode(json.dumps(data).encode()).decode()


def decode_cursor(cursor: str) -> dict[str, Any]:
    try:
        result: dict[str, Any] = json.loads(base64.urlsafe_b64decode(cursor.encode()))
        return result
    except Exception as exc:
        raise ValueError(f"Invalid cursor: {exc}") from exc
