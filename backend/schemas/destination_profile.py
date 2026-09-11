from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class Protocol(str, Enum):
    UDP = "udp"
    TCP = "tcp"
    TLS = "tls"


class DestinationProfileBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str = Field(default="")
    host: str = Field(..., min_length=1, max_length=253)
    port: int = Field(..., ge=1, le=65535)
    protocol: Protocol = Field(default=Protocol.UDP)
    tls_ca_cert: str | None = None


class DestinationProfileCreate(DestinationProfileBase):
    pass


class DestinationProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    host: str | None = Field(default=None, min_length=1, max_length=253)
    port: int | None = Field(default=None, ge=1, le=65535)
    protocol: Protocol | None = None
    tls_ca_cert: str | None = None


class DestinationProfileResponse(DestinationProfileBase):
    id: int
    uuid: str | None
    visibility: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
