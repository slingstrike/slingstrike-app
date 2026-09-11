"""Pydantic schemas representing the .olf community file format (olf-format spec v1.0)."""

import ipaddress
import re
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator

_UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
_TIMESTAMP_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$")
_TIMESTAMP_RFC3164_RE = re.compile(r"^[A-Z][a-z]{2}\s{1,2}\d{1,2} \d{2}:\d{2}:\d{2}$")
_RFC3164_MONTHS = frozenset(
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
)
_TAG_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")
_VAR_NAME_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_MAC_RE = re.compile(r"^([0-9a-f]{2}:){5}[0-9a-f]{2}$")
_HASH_HEX_RE = re.compile(r"^[0-9a-f]+$")
_HASH_ALGORITHM_LENGTHS = {"md5": 32, "sha1": 40, "sha256": 64}


def _validate_uuid(v: Any) -> str:
    if not isinstance(v, str) or not _UUID_RE.match(v):
        raise ValueError("must be a valid UUIDv4")
    return v


def _validate_timestamp(v: Any, field_name: str = "field") -> str:
    if not isinstance(v, str) or not _TIMESTAMP_RE.match(v):
        raise ValueError(f"{field_name} must be YYYY-MM-DDTHH:MM:SS[.sss]Z")
    return v


def _is_valid_rfc3164_timestamp(v: Any) -> bool:
    return (
        isinstance(v, str)
        and bool(_TIMESTAMP_RFC3164_RE.match(v))
        and v[:3] in _RFC3164_MONTHS
    )


class OlfLogFormat(str, Enum):
    CEF = "cef"
    LEEF = "leef"
    JSON = "json"
    SYSLOG_RFC3164 = "syslog_rfc3164"
    SYSLOG_RFC5424 = "syslog_rfc5424"
    WINDOWS_EVTXML = "windows_evtxml"
    CUSTOM = "custom"


class OlfVisibility(str, Enum):
    PUBLIC_READONLY = "public_readonly"
    PUBLIC_COLLABORATIVE = "public_collaborative"
    PRIVATE = "private"


class OlfLogSourceCategory(str, Enum):
    OS = "os"
    APPLICATION = "application"
    SECURITY_DEVICE = "security_device"
    NETWORK_DEVICE = "network_device"
    CLOUD = "cloud"


class OlfVariableType(str, Enum):
    STRING = "string"
    IP = "ip"
    IPV6 = "ipv6"
    HOSTNAME = "hostname"
    TIMESTAMP = "timestamp"
    INTEGER = "integer"
    UUID = "uuid"
    ENUM = "enum"
    MAC_ADDRESS = "mac_address"
    HASH = "hash"
    USERNAME = "username"


class OlfVariableSource(str, Enum):
    USER_OVERRIDE = "user_override"
    STATIC = "static"
    GENERATED = "generated"
    SEQUENCE = "sequence"


class OlfVariable(BaseModel):
    type: OlfVariableType
    default: Any
    source: OlfVariableSource = OlfVariableSource.USER_OVERRIDE
    min: int | None = None
    max: int | None = None
    values: list[str] | None = None
    algorithm: str | None = None
    format: str | None = None
    offset_seconds: int | None = None
    cidr: str | None = None
    range: str | None = None

    @field_validator("type", mode="before")
    @classmethod
    def _normalize_ipv4_alias(cls, v: Any) -> Any:
        # "ipv4" is accepted on import as an alias for the spec's canonical "ip"
        # (an IPv4 address) - kept symmetric with "ipv6" so hand-authored files
        # can use either name. The writer always emits "ip" on export.
        if v == "ipv4":
            return "ip"
        return v

    @model_validator(mode="after")
    def _validate_constraints(self) -> "OlfVariable":
        t = self.type
        # min/max only valid for integer type
        if self.min is not None and t != OlfVariableType.INTEGER:
            raise ValueError("min is only valid for type: integer")
        if self.max is not None and t != OlfVariableType.INTEGER:
            raise ValueError("max is only valid for type: integer")
        if self.min is not None and self.max is not None and self.max < self.min:
            raise ValueError("max must be >= min")
        # values required for enum type
        if t == OlfVariableType.ENUM:
            if not self.values or len(self.values) == 0:
                raise ValueError("values is required for type: enum")
            if len(self.values) > 256:
                raise ValueError("values may have at most 256 items")
            if len(self.values) != len(set(self.values)):
                raise ValueError("values must be unique")
            for val in self.values:
                if len(val) > 256:
                    raise ValueError("each value in values must be <= 256 characters")
        # algorithm only valid for hash type
        if self.algorithm is not None and t != OlfVariableType.HASH:
            raise ValueError("algorithm is only valid for type: hash")
        if t == OlfVariableType.HASH and self.algorithm is not None:
            if self.algorithm not in _HASH_ALGORITHM_LENGTHS:
                raise ValueError("algorithm for type: hash must be one of: md5, sha1, sha256")
        # format/offset_seconds only valid for timestamp type
        if self.format is not None and t != OlfVariableType.TIMESTAMP:
            raise ValueError("format is only valid for type: timestamp")
        if self.offset_seconds is not None and t != OlfVariableType.TIMESTAMP:
            raise ValueError("offset_seconds is only valid for type: timestamp")
        if self.format is not None and self.format not in ("rfc3164", "rfc5424"):
            raise ValueError("format for type: timestamp must be one of: rfc3164, rfc5424")
        # cidr/range only valid for type: ip (random IPv4 constrained to a subnet or range)
        if self.cidr is not None and t != OlfVariableType.IP:
            raise ValueError("cidr is only valid for type: ip")
        if self.range is not None and t != OlfVariableType.IP:
            raise ValueError("range is only valid for type: ip")
        # source: sequence requires type: integer
        if self.source == OlfVariableSource.SEQUENCE and t != OlfVariableType.INTEGER:
            raise ValueError("source: sequence requires type: integer")
        # validate default per type (skip range check for source: sequence)
        self._validate_default()
        return self

    def _validate_default(self) -> None:
        t = self.type
        d = self.default
        if t == OlfVariableType.IP:
            if not isinstance(d, str):
                raise ValueError("default for type: ip must be a string")
            parts = d.split(".")
            if len(parts) != 4 or not all(p.isdigit() and 0 <= int(p) <= 255 for p in parts):
                raise ValueError("default for type: ip must be a valid IPv4 address")
        elif t == OlfVariableType.INTEGER:
            if not isinstance(d, int):
                raise ValueError("default for type: integer must be an integer")
            if self.source != OlfVariableSource.SEQUENCE:
                if self.min is not None and d < self.min:
                    raise ValueError("default is below min")
                if self.max is not None and d > self.max:
                    raise ValueError("default exceeds max")
        elif t == OlfVariableType.ENUM:
            if self.values and d not in self.values:
                raise ValueError("default must be one of values")
        elif t == OlfVariableType.TIMESTAMP:
            # default's format follows the declared render `format` (rfc5424's
            # ISO 8601 is the implicit default, matching the generator's fallback
            # in backend/api/send.py:_resolve_var) so a human reading the file sees
            # the default in the same style the generator will actually render.
            if self.format == "rfc3164":
                if not _is_valid_rfc3164_timestamp(d):
                    raise ValueError(
                        "default for type: timestamp with format: rfc3164 must be "
                        "'Mon D HH:MM:SS' (e.g. 'Jun 27 00:00:00')"
                    )
            elif not isinstance(d, str) or not _TIMESTAMP_RE.match(d):
                raise ValueError("default for type: timestamp must be YYYY-MM-DDTHH:MM:SS[.sss]Z")
        elif t == OlfVariableType.UUID:
            if not isinstance(d, str) or not _UUID_RE.match(d):
                raise ValueError("default for type: uuid must be a valid UUIDv4")
        elif t == OlfVariableType.HOSTNAME:
            if not isinstance(d, str) or len(d) == 0 or len(d) > 253:
                raise ValueError("default for type: hostname must be non-empty, max 253 chars")
        elif t == OlfVariableType.STRING:
            if not isinstance(d, str) or len(d) > 256:
                raise ValueError("default for type: string must be a string, max 256 chars")
        elif t == OlfVariableType.IPV6:
            if not isinstance(d, str):
                raise ValueError("default for type: ipv6 must be a string")
            try:
                ipaddress.IPv6Address(d)
            except ValueError as exc:
                raise ValueError("default for type: ipv6 must be a valid IPv6 address") from exc
        elif t == OlfVariableType.MAC_ADDRESS:
            if not isinstance(d, str) or not _MAC_RE.match(d):
                raise ValueError(
                    "default for type: mac_address must match xx:xx:xx:xx:xx:xx (lowercase hex)"
                )
        elif t == OlfVariableType.USERNAME:
            if not isinstance(d, str) or len(d) == 0 or len(d) > 64:
                raise ValueError("default for type: username must be non-empty, max 64 chars")
        elif t == OlfVariableType.HASH:
            algo = self.algorithm or "sha256"
            expected_len = _HASH_ALGORITHM_LENGTHS[algo]
            if (
                not isinstance(d, str)
                or len(d) != expected_len
                or not _HASH_HEX_RE.match(d)
            ):
                raise ValueError(
                    f"default for type: hash must be a {expected_len}-character lowercase "
                    f"hex string for algorithm {algo}"
                )


class OlfLogEvent(BaseModel):
    sequence: int = Field(..., ge=1, le=65535)
    format: OlfLogFormat
    template: str = Field(..., max_length=65536)
    variables: dict[str, OlfVariable] = Field(default_factory=dict)
    delay_ms: int = Field(default=0, ge=0, le=300000)
    repeat: int = Field(default=1, ge=0, le=128)
    comment: str | None = Field(default=None, max_length=2000)

    @field_validator("variables")
    @classmethod
    def _validate_variable_names(cls, v: dict[str, OlfVariable]) -> dict[str, OlfVariable]:
        if len(v) > 64:
            raise ValueError("at most 64 variables per event")
        for name in v:
            if not _VAR_NAME_RE.match(name):
                raise ValueError(f"variable name '{name}' must match [A-Za-z_][A-Za-z0-9_]*")
        return v


class OlfClassification(BaseModel):
    mitre_tactics: list[str] = Field(default_factory=list)
    mitre_techniques: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)

    @field_validator("tags")
    @classmethod
    def _validate_tags(cls, v: list[str]) -> list[str]:
        if len(v) > 50:
            raise ValueError("at most 50 tags")
        for tag in v:
            if len(tag) > 64 or not _TAG_RE.match(tag):
                raise ValueError(f"tag '{tag}' must match [a-z0-9][a-z0-9-]*, max 64 characters")
        return v


class OlfLogSource(BaseModel):
    category: OlfLogSourceCategory | None = None
    platform: str | None = Field(default=None, max_length=100)


class OlfDocument(BaseModel):
    """Validated in-memory representation of a community .olf YAML document."""

    olf_version: str
    id: str
    name: str = Field(..., min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=10000)
    tier: str
    visibility: OlfVisibility
    created_by: str = Field(..., min_length=1, max_length=255)
    created_at: str
    last_edited_at: str
    exported_at: str
    imported_at: str | None = None
    classification: OlfClassification | None = None
    log_source: OlfLogSource | None = None
    log_events: list[OlfLogEvent] = Field(..., min_length=1, max_length=500)

    @field_validator("id")
    @classmethod
    def _validate_id(cls, v: str) -> str:
        return _validate_uuid(v)

    @field_validator("name")
    @classmethod
    def _reject_whitespace_name(cls, v: str) -> str:
        if v.strip() == "":
            raise ValueError("name must not be whitespace-only")
        return v

    @field_validator("created_by")
    @classmethod
    def _reject_whitespace_created_by(cls, v: str) -> str:
        if v.strip() == "":
            raise ValueError("created_by must not be whitespace-only")
        return v

    @field_validator("created_at", "last_edited_at", "exported_at")
    @classmethod
    def _validate_required_timestamp(cls, v: str) -> str:
        return _validate_timestamp(v)

    @field_validator("imported_at")
    @classmethod
    def _validate_optional_timestamp(cls, v: str | None) -> str | None:
        if v is not None:
            return _validate_timestamp(v)
        return v

    @model_validator(mode="after")
    def _validate_sequence_uniqueness(self) -> "OlfDocument":
        seen: set[int] = set()
        for event in self.log_events:
            if event.sequence in seen:
                raise ValueError(
                    f"sequence value {event.sequence} appears more than once in log_events"
                )
            seen.add(event.sequence)
        return self
