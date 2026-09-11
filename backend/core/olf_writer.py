"""Community .olf file writer implementing the export rules from olf-format spec.

Export rules applied here:
- olf_version is always the current application version ("1.0")
- tier is always "community" (premium use cases cannot be exported)
- license_key_id, source_use_case_id, collection assignments are not exported
- visibility is exported as-is
- created_by is the stored display name (never a UUID)
- exported_at is set to the current UTC timestamp
- imported_at reflects the stored import timestamp (null if natively created)
"""

import re
from datetime import UTC, datetime
from typing import Any

from ruamel.yaml import YAML
from ruamel.yaml.scalarstring import LiteralScalarString

from core.olf_errors import OlfError
from schemas.olf import OlfDocument

_CURRENT_OLF_VERSION = "1.0"
_PLACEHOLDER_RE = re.compile(r"\{\{\s*(\w+)\s*\}\}")
_MAX_ENUM_VALUES = 256


def _make_yaml() -> YAML:
    y: YAML = YAML()
    y.version = (1, 2)
    y.default_flow_style = False
    y.width = 4096  # prevent unwanted line wrapping in templates
    # The .olf spec prohibits anchors/aliases entirely (Billion Laughs prevention -
    # see YAML Parser Requirements). Without this, the dumper emits an alias any
    # time the same Python object is written twice - e.g. two variables embedding
    # the same My Object's values list - producing self-invalidating output.
    y.representer.ignore_aliases = lambda data: True
    return y


def _utc_now() -> str:
    now = datetime.now(UTC)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"


def _build_document(
    use_case: Any, exported_at: str, objects: dict[str, list[str]] | None = None
) -> dict[str, Any]:
    """Build the raw dict that will be serialised to YAML.

    use_case must expose the following attributes (matching the UseCase ORM model):
      uuid, name, description, visibility, created_by, created_at, last_edited_at,
      imported_at, mitre_tactics, mitre_techniques, tags, log_source, log_events, tier.
    objects maps My Objects names AND placeholders (dual-keyed, matching
    backend/api/send.py:_load_objects) to their value lists - used to embed
    Object references as native enum variables (see _build_event).
    Raises OlfError if the use case tier is premium.
    """
    if getattr(use_case, "tier", "community") == "premium":
        raise OlfError(
            "OLF_INVALID_TIER",
            "Premium use cases cannot be exported to .olf format; "
            "export a community clone instead",
        )

    doc: dict[str, Any] = {
        "olf_version": _CURRENT_OLF_VERSION,
        "id": use_case.uuid,
        "name": use_case.name,
        "tier": "community",
        "visibility": use_case.visibility,
        "created_by": use_case.created_by,
        "created_at": _format_ts(use_case.created_at),
        "last_edited_at": _format_ts(use_case.last_edited_at),
        "exported_at": exported_at,
        "imported_at": _format_ts(use_case.imported_at) if use_case.imported_at else None,
    }

    if use_case.description:
        doc["description"] = use_case.description

    classification: dict[str, Any] = {}
    if use_case.mitre_tactics:
        classification["mitre_tactics"] = list(use_case.mitre_tactics)
    if use_case.mitre_techniques:
        classification["mitre_techniques"] = list(use_case.mitre_techniques)
    if use_case.tags:
        classification["tags"] = list(use_case.tags)
    if classification:
        doc["classification"] = classification

    log_source = getattr(use_case, "log_source", None)
    if log_source:
        ls: dict[str, Any] = {}
        if log_source.get("category"):
            ls["category"] = log_source["category"]
        if log_source.get("platform"):
            ls["platform"] = log_source["platform"]
        if ls:
            doc["log_source"] = ls

    log_events = getattr(use_case, "log_events", None) or []
    doc["log_events"] = [_build_event(ev, objects or {}) for ev in log_events]

    return doc


def _format_ts(ts: Any) -> str:
    """Convert a datetime object or ISO string to the required Z-suffix format."""
    if ts is None:
        return ""
    if isinstance(ts, datetime):
        return ts.strftime("%Y-%m-%dT%H:%M:%S.") + f"{ts.microsecond // 1000:03d}Z"
    # assume string already in correct format
    return str(ts)


def _build_event(ev: dict[str, Any], objects: dict[str, list[str]]) -> dict[str, Any]:
    out: dict[str, Any] = {
        "sequence": ev["sequence"],
        "format": ev["format"],
        "template": LiteralScalarString(ev["template"]),
    }

    declared: dict[str, Any] = dict(ev.get("variables") or {})

    # My Objects can be referenced directly in a template with no declared
    # variable at all (backend/api/send.py:_load_objects resolves these by
    # scanning the template). The .olf spec has no concept of an external
    # object reference, so embed the object's value list inline as a native
    # enum variable - this is the only way such a use case can be exported
    # as a valid, self-contained file.
    for placeholder in _PLACEHOLDER_RE.findall(ev["template"]):
        if placeholder in declared:
            continue
        values = objects.get(placeholder)
        if values:
            declared[placeholder] = {"type": "enum", "source": "generated", "values": values}

    if declared:
        out["variables"] = {name: _build_variable(var, objects) for name, var in declared.items()}
    if ev.get("delay_ms", 0):
        out["delay_ms"] = ev["delay_ms"]
    repeat = ev.get("repeat", 1)
    if repeat != 1:
        out["repeat"] = repeat
    if ev.get("comment"):
        out["comment"] = ev["comment"]
    return out


_GENERATED_PLACEHOLDER_DEFAULTS: dict[str, Any] = {
    "timestamp": "2026-06-27T00:00:00Z",
    "uuid": "00000000-0000-4000-8000-000000000000",
    "hostname": "host-01",
    "username": "user01",
    "mac_address": "02:00:00:00:00:00",
    "ip": "192.168.1.100",
    "ipv6": "2001:db8::1",
    "string": "",
}

_GENERATED_RFC3164_TIMESTAMP_DEFAULT = "Jun 27 00:00:00"

_HASH_ALGORITHM_LENGTHS: dict[str, int] = {"md5": 32, "sha1": 40, "sha256": 64}


def _build_variable(var: dict[str, Any], objects: dict[str, list[str]]) -> dict[str, Any]:
    """Convert an internal variable spec to its .olf-exportable form.

    Two internal-only types are remapped to spec-legal equivalents here:
    - port -> integer: identical generation logic (backend/api/send.py:_resolve_var),
      min/max preserved, so this is lossless.
    - ipv4 -> ip: the spec's canonical name for an IPv4 address. Only safe because
      _resolve_var treats "ip" as an alias for "ipv4" generation - without that,
      a re-imported file would render a frozen default forever instead of a fresh
      random value each send.
    mac_address, hash, username and ipv6 are native spec types (schemas/olf.py)
    and pass through unchanged.

    An explicit "From My Objects" reference (source: group/object, referencing
    an object by name) is embedded inline as a native enum variable - the .olf
    spec has no concept of an external object reference (group/object are not
    legal OlfVariableSource values), so this is the only way to export such a
    variable as valid, self-contained .olf. Raises OlfError if the referenced
    object has no values or more than 256 (the spec's enum limit).

    A literal default is synthesized when absent, since the .olf schema requires
    one on every variable but source: generated never reads it at render time -
    so any schema-valid placeholder is safe here with zero behavioural effect.
    type: timestamp is the one exception where "schema-valid" depends on format:
    an rfc3164 timestamp variable needs an rfc3164-style synthesized default, or
    schema validation on re-import would reject the ISO 8601 placeholder default.
    """
    var_type = str(var["type"])
    source = var.get("source", "user_override")
    min_val = var.get("min")
    max_val = var.get("max")
    algorithm = var.get("algorithm")
    values = var.get("values")

    if var_type == "port":
        var_type = "integer"
        if min_val is None:
            min_val = 1024
        if max_val is None:
            max_val = 65535
    elif var_type == "ipv4":
        var_type = "ip"
    elif source in ("group", "object"):
        obj_name = str(var.get("group") or var.get("object") or "")
        values = objects.get(obj_name) or []
        if not values:
            raise OlfError(
                "OLF_SCHEMA_INVALID",
                f"Object '{obj_name}' referenced by a variable has no values to export",
            )
        if len(values) > _MAX_ENUM_VALUES:
            raise OlfError(
                "OLF_SCHEMA_INVALID",
                f"Object '{obj_name}' has {len(values)} values, exceeding the "
                f"{_MAX_ENUM_VALUES}-item limit for an exported enum variable",
            )
        var_type = "enum"
        source = "generated"

    default = var.get("default")
    if default is None:
        if var_type == "integer":
            default = min_val if min_val is not None else 0
        elif var_type == "hash":
            length = _HASH_ALGORITHM_LENGTHS.get(str(algorithm), 64)
            default = "0" * length
        elif var_type == "enum":
            default = values[0] if values else ""
        elif var_type == "timestamp" and var.get("format") == "rfc3164":
            default = _GENERATED_RFC3164_TIMESTAMP_DEFAULT
        else:
            default = _GENERATED_PLACEHOLDER_DEFAULTS.get(var_type, "")

    out: dict[str, Any] = {
        "type": var_type,
        "default": default,
    }
    if source != "user_override":
        out["source"] = source
    if min_val is not None:
        out["min"] = min_val
    if max_val is not None:
        out["max"] = max_val
    if values is not None:
        out["values"] = values
    if algorithm is not None:
        out["algorithm"] = algorithm
    if var_type == "timestamp":
        if var.get("format") is not None:
            out["format"] = var["format"]
        if var.get("offset_seconds") is not None:
            out["offset_seconds"] = var["offset_seconds"]
    if var_type == "ip":
        if var.get("cidr") is not None:
            out["cidr"] = var["cidr"]
        if var.get("range") is not None:
            out["range"] = var["range"]
    return out


def write_olf(use_case: Any, objects: dict[str, list[str]] | None = None) -> bytes:
    """Serialise a UseCase ORM instance to .olf YAML bytes.

    objects maps My Objects names AND placeholders to their value lists
    (dual-keyed, matching backend/api/send.py:_load_objects) - pass the
    result of a full ObjectGroup query so any Object referenced by this use
    case's templates/variables can be embedded as a native enum variable.
    Omit if the use case is known not to reference any Object.

    Returns UTF-8 encoded YAML.  Raises OlfError on invalid input.
    """
    import io

    exported_at = _utc_now()
    doc = _build_document(use_case, exported_at, objects)
    y = _make_yaml()
    stream = io.BytesIO()
    y.dump(doc, stream)
    return stream.getvalue()


def write_olf_from_document(olf_doc: OlfDocument) -> bytes:
    """Serialise a validated OlfDocument (e.g. a round-trip test helper) to YAML bytes."""
    import io

    class _Adapter:
        """Thin adapter so _build_document can accept an OlfDocument."""

        def __init__(self, d: OlfDocument) -> None:
            self.uuid = d.id
            self.name = d.name
            self.description = d.description or ""
            self.tier = d.tier
            self.visibility = d.visibility.value
            self.created_by = d.created_by
            self.created_at = d.created_at
            self.last_edited_at = d.last_edited_at
            self.imported_at = d.imported_at
            self.mitre_tactics = d.classification.mitre_tactics if d.classification else []
            self.mitre_techniques = d.classification.mitre_techniques if d.classification else []
            self.tags = d.classification.tags if d.classification else []
            raw_ls = d.log_source
            self.log_source: dict[str, Any] | None = (
                {
                    "category": raw_ls.category.value if raw_ls.category else None,
                    "platform": raw_ls.platform,
                }
                if raw_ls
                else None
            )
            self.log_events = [ev.model_dump(mode="json") for ev in d.log_events]

    doc = _build_document(_Adapter(olf_doc), _utc_now())
    y = _make_yaml()
    stream = io.BytesIO()
    y.dump(doc, stream)
    return stream.getvalue()
