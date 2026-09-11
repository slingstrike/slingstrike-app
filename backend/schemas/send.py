from typing import Self

from pydantic import BaseModel, Field, model_validator


class SendRequest(BaseModel):
    destination_id: int | None = None
    host: str | None = Field(default=None, min_length=1, max_length=253)
    port: int | None = Field(default=None, ge=1, le=65535)
    variables: dict[str, str] = Field(default_factory=dict)

    @model_validator(mode="after")
    def check_destination_or_inline(self) -> Self:
        if self.destination_id is None and (self.host is None or self.port is None):
            raise ValueError("Either destination_id or both host and port must be provided")
        return self


class SendResponse(BaseModel):
    bytes_sent: int
    destination: str
    cancelled: bool = False
