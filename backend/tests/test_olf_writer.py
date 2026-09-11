"""Tests for core/olf_writer.py - community .olf export."""

from datetime import datetime

import pytest

from core.olf_errors import OlfError
from core.olf_parser import parse_olf
from core.olf_writer import write_olf, write_olf_from_document


# ---------------------------------------------------------------------------
# Minimal UseCase-like stub for write_olf
# ---------------------------------------------------------------------------


class _UseCase:
    def __init__(self, **kwargs: object) -> None:
        self.uuid = kwargs.get("uuid", "550e8400-e29b-41d4-a716-446655440000")
        self.name = kwargs.get("name", "SSH Brute Force")
        self.description = kwargs.get("description", "")
        self.tier = kwargs.get("tier", "community")
        self.visibility = kwargs.get("visibility", "public_readonly")
        self.created_by = kwargs.get("created_by", "Jane Smith")
        self.created_at = kwargs.get("created_at", datetime(2026, 6, 6, 12, 0, 0))
        self.last_edited_at = kwargs.get("last_edited_at", datetime(2026, 6, 6, 12, 0, 0))
        self.imported_at = kwargs.get("imported_at", None)
        self.mitre_tactics = kwargs.get("mitre_tactics", [])
        self.mitre_techniques = kwargs.get("mitre_techniques", [])
        self.tags = kwargs.get("tags", [])
        self.log_source = kwargs.get("log_source", None)
        self.log_events = kwargs.get("log_events", [])


_MINIMAL_EVENTS = [
    {
        "sequence": 1,
        "format": "syslog_rfc5424",
        "template": "<34>1 {{timestamp}} {{hostname}} sshd - - - auth failure",
        "variables": {
            "timestamp": {"type": "timestamp", "default": "2026-06-06T12:00:00Z", "source": "generated"},
            "hostname": {"type": "hostname", "default": "web-01", "source": "user_override"},
        },
        "delay_ms": 0,
        "repeat": 1,
    }
]


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


def test_write_olf_returns_bytes() -> None:
    uc = _UseCase(log_events=_MINIMAL_EVENTS)
    result = write_olf(uc)
    assert isinstance(result, bytes)
    assert len(result) > 0


def test_write_olf_is_valid_yaml() -> None:
    uc = _UseCase(log_events=_MINIMAL_EVENTS)
    raw = write_olf(uc)
    from ruamel.yaml import YAML
    y = YAML()
    doc = y.load(raw)
    assert doc is not None
    assert isinstance(doc, dict)


def test_write_olf_version_is_always_current() -> None:
    uc = _UseCase(log_events=_MINIMAL_EVENTS)
    raw = write_olf(uc)
    from ruamel.yaml import YAML
    y = YAML()
    doc = y.load(raw)
    assert doc["olf_version"] == "1.0"


def test_write_olf_tier_is_always_community() -> None:
    uc = _UseCase(log_events=_MINIMAL_EVENTS)
    raw = write_olf(uc)
    from ruamel.yaml import YAML
    y = YAML()
    doc = y.load(raw)
    assert doc["tier"] == "community"


def test_write_olf_exported_at_is_set() -> None:
    uc = _UseCase(log_events=_MINIMAL_EVENTS)
    raw = write_olf(uc)
    from ruamel.yaml import YAML
    y = YAML()
    doc = y.load(raw)
    assert "exported_at" in doc
    assert doc["exported_at"].endswith("Z")


def test_write_olf_id_matches_uuid() -> None:
    fixed = "550e8400-e29b-41d4-a716-446655440001"
    uc = _UseCase(uuid=fixed, log_events=_MINIMAL_EVENTS)
    raw = write_olf(uc)
    from ruamel.yaml import YAML
    y = YAML()
    doc = y.load(raw)
    assert doc["id"] == fixed


def test_write_olf_classification_included_when_present() -> None:
    uc = _UseCase(
        mitre_tactics=["TA0006"],
        mitre_techniques=["T1110.001"],
        tags=["linux", "ssh"],
        log_events=_MINIMAL_EVENTS,
    )
    raw = write_olf(uc)
    from ruamel.yaml import YAML
    y = YAML()
    doc = y.load(raw)
    assert "classification" in doc
    assert doc["classification"]["mitre_tactics"] == ["TA0006"]
    assert "linux" in doc["classification"]["tags"]


def test_write_olf_classification_omitted_when_empty() -> None:
    uc = _UseCase(log_events=_MINIMAL_EVENTS)
    raw = write_olf(uc)
    from ruamel.yaml import YAML
    y = YAML()
    doc = y.load(raw)
    assert "classification" not in doc


def test_write_olf_imported_at_null_when_native() -> None:
    uc = _UseCase(imported_at=None, log_events=_MINIMAL_EVENTS)
    raw = write_olf(uc)
    from ruamel.yaml import YAML
    y = YAML()
    doc = y.load(raw)
    assert doc.get("imported_at") is None


def test_write_olf_log_events_serialised() -> None:
    uc = _UseCase(log_events=_MINIMAL_EVENTS)
    raw = write_olf(uc)
    from ruamel.yaml import YAML
    y = YAML()
    doc = y.load(raw)
    assert len(doc["log_events"]) == 1
    ev = doc["log_events"][0]
    assert ev["sequence"] == 1
    assert ev["format"] == "syslog_rfc5424"
    assert "timestamp" in ev["variables"]


# ---------------------------------------------------------------------------
# Premium tier rejection
# ---------------------------------------------------------------------------


def test_write_olf_rejects_premium_tier() -> None:
    uc = _UseCase(tier="premium", log_events=_MINIMAL_EVENTS)
    with pytest.raises(OlfError) as exc_info:
        write_olf(uc)
    assert exc_info.value.code == "OLF_INVALID_TIER"


# ---------------------------------------------------------------------------
# Round-trip: write then parse
# ---------------------------------------------------------------------------


def test_round_trip_write_then_parse() -> None:
    uc = _UseCase(
        mitre_tactics=["TA0006"],
        tags=["linux"],
        log_events=_MINIMAL_EVENTS,
    )
    raw = write_olf(uc)
    doc, warnings = parse_olf(raw)
    assert doc.name == "SSH Brute Force"
    assert doc.tier == "community"
    assert doc.log_events[0].sequence == 1
    assert doc.classification is not None
    assert "TA0006" in doc.classification.mitre_tactics


# ---------------------------------------------------------------------------
# Generated-variable export gap (project_olf_export_variable_gap_2026-07-15)
# ---------------------------------------------------------------------------


def test_write_olf_synthesizes_default_when_missing() -> None:
    """source: generated variables saved via the live editor never persist a
    default, but the .olf schema requires one on every variable - the writer
    must not crash (previously KeyError) and must fill in a placeholder."""
    events = [
        {
            "sequence": 1,
            "format": "custom",
            "template": "pid={{pid}} ts={{ts}}",
            "variables": {
                "pid": {"type": "integer", "source": "generated", "min": 1000, "max": 9999},
                "ts": {"type": "timestamp", "source": "generated"},
            },
        }
    ]
    uc = _UseCase(log_events=events)
    raw = write_olf(uc)
    from ruamel.yaml import YAML
    y = YAML()
    doc = y.load(raw)
    variables = doc["log_events"][0]["variables"]
    assert variables["pid"]["default"] == 1000  # falls back to min when no default stored
    assert variables["ts"]["default"]  # some non-empty placeholder, not KeyError


def test_write_olf_remaps_port_to_integer() -> None:
    events = [
        {
            "sequence": 1,
            "format": "custom",
            "template": "port={{src_port}}",
            "variables": {"src_port": {"type": "port", "source": "generated"}},
        }
    ]
    uc = _UseCase(log_events=events)
    raw = write_olf(uc)
    from ruamel.yaml import YAML
    y = YAML()
    doc = y.load(raw)
    spec = doc["log_events"][0]["variables"]["src_port"]
    assert spec["type"] == "integer"
    assert spec["min"] == 1024
    assert spec["max"] == 65535
    assert spec["default"] == 1024


def test_write_olf_remaps_ipv4_to_ip() -> None:
    events = [
        {
            "sequence": 1,
            "format": "custom",
            "template": "src={{src_ip}}",
            "variables": {"src_ip": {"type": "ipv4", "source": "generated"}},
        }
    ]
    uc = _UseCase(log_events=events)
    raw = write_olf(uc)
    from ruamel.yaml import YAML
    y = YAML()
    doc = y.load(raw)
    spec = doc["log_events"][0]["variables"]["src_ip"]
    assert spec["type"] == "ip"
    assert spec["default"]


def test_write_olf_generated_variable_gap_round_trips_through_parse_olf() -> None:
    """The actual use case shape that originally crashed export (id 13/14 in
    project_olf_export_variable_gap_2026-07-15): generated timestamp/pid/port
    variables with no stored default. Must both write without crashing AND
    pass the same strict OlfDocument validation seeder.py uses."""
    events = [
        {
            "sequence": 1,
            "format": "custom",
            "template": "<34>{{ts}} host sshd[{{pid}}]: from {{src_ip}} port {{src_port}}",
            "variables": {
                "ts": {"type": "timestamp", "source": "generated", "format": "rfc3164"},
                "pid": {"type": "integer", "source": "generated", "min": 1024, "max": 4096},
                "src_ip": {"type": "ipv4", "source": "generated"},
                "src_port": {"type": "port", "source": "generated"},
            },
        }
    ]
    uc = _UseCase(log_events=events)
    raw = write_olf(uc)
    doc, warnings = parse_olf(raw)  # raises OlfError if not spec-valid
    assert doc.log_events[0].variables["src_port"].type.value == "integer"
    assert doc.log_events[0].variables["src_ip"].type.value == "ip"


def test_write_olf_native_types_round_trip_without_remap() -> None:
    """mac_address, hash, username and ipv6 are native .olf types (2026-07-21
    spec extension) - no remap needed, unlike port/ipv4. Missing default is
    still synthesized (per-type, and per-algorithm for hash)."""
    events = [
        {
            "sequence": 1,
            "format": "custom",
            "template": "mac={{mac}} user={{user}} h1={{h1}} h2={{h2}} ip6={{ip6}}",
            "variables": {
                "mac": {"type": "mac_address", "source": "generated"},
                "user": {"type": "username", "source": "generated"},
                "h1": {"type": "hash", "source": "generated"},
                "h2": {"type": "hash", "source": "generated", "algorithm": "md5"},
                "ip6": {"type": "ipv6", "source": "generated"},
            },
        }
    ]
    uc = _UseCase(log_events=events)
    raw = write_olf(uc)
    doc, warnings = parse_olf(raw)
    variables = doc.log_events[0].variables
    assert variables["mac"].type.value == "mac_address"
    assert variables["user"].type.value == "username"
    assert variables["ip6"].type.value == "ipv6"
    assert variables["h1"].type.value == "hash"
    assert len(variables["h1"].default) == 64  # default sha256 length
    assert variables["h2"].algorithm == "md5"
    assert len(variables["h2"].default) == 32  # synthesized default matches algorithm length


# ---------------------------------------------------------------------------
# My Objects embedding (project_objects_no_olf_spec_representation)
# ---------------------------------------------------------------------------


def test_write_olf_embeds_implicit_object_placeholder_as_enum() -> None:
    """A bare {{ hostname }} placeholder with no declared variable, resolved at
    send time via an Object named/placeholder-matched "hostname" - the only
    way to make this exportable is embedding the object's values inline."""
    events = [
        {
            "sequence": 1,
            "format": "custom",
            "template": "host={{ hostname }}",
        }
    ]
    uc = _UseCase(log_events=events)
    objects = {"Endpoint Hostnames": ["WS-ALPHA", "WS-BETA"], "hostname": ["WS-ALPHA", "WS-BETA"]}
    raw = write_olf(uc, objects)
    doc, warnings = parse_olf(raw)
    spec = doc.log_events[0].variables["hostname"]
    assert spec.type.value == "enum"
    assert spec.source.value == "generated"
    assert spec.values == ["WS-ALPHA", "WS-BETA"]
    assert spec.default in spec.values


def test_write_olf_embeds_explicit_object_reference_as_enum() -> None:
    """source: group (the "From My Objects" Variable Builder option) references
    an object by name - group/object are not legal OlfVariableSource values,
    so this must also become an embedded enum."""
    events = [
        {
            "sequence": 1,
            "format": "custom",
            "template": "user={{ target_user }}",
            "variables": {
                "target_user": {"type": "string", "source": "group", "group": "Usernames"},
            },
        }
    ]
    uc = _UseCase(log_events=events)
    objects = {"Usernames": ["jsmith", "adoe"]}
    raw = write_olf(uc, objects)
    doc, warnings = parse_olf(raw)
    spec = doc.log_events[0].variables["target_user"]
    assert spec.type.value == "enum"
    assert spec.source.value == "generated"
    assert spec.values == ["jsmith", "adoe"]


def test_write_olf_raises_when_referenced_object_missing_or_empty() -> None:
    events = [
        {
            "sequence": 1,
            "format": "custom",
            "template": "user={{ target_user }}",
            "variables": {
                "target_user": {"type": "string", "source": "group", "group": "Nonexistent"},
            },
        }
    ]
    uc = _UseCase(log_events=events)
    with pytest.raises(OlfError) as exc_info:
        write_olf(uc, {})
    assert exc_info.value.code == "OLF_SCHEMA_INVALID"


def test_write_olf_raises_when_object_exceeds_256_values() -> None:
    events = [
        {
            "sequence": 1,
            "format": "custom",
            "template": "user={{ target_user }}",
            "variables": {
                "target_user": {"type": "string", "source": "group", "group": "Huge"},
            },
        }
    ]
    uc = _UseCase(log_events=events)
    with pytest.raises(OlfError) as exc_info:
        write_olf(uc, {"Huge": [f"v{i}" for i in range(300)]})
    assert exc_info.value.code == "OLF_SCHEMA_INVALID"


def test_write_olf_from_document_round_trip() -> None:
    import textwrap
    content = textwrap.dedent("""\
        olf_version: "1.0"
        id: "550e8400-e29b-41d4-a716-446655440000"
        name: "SSH Brute Force"
        tier: community
        visibility: public_readonly
        created_by: "Jane Smith"
        created_at: "2026-06-06T12:00:00Z"
        last_edited_at: "2026-06-06T12:00:00Z"
        exported_at: "2026-06-27T10:00:00Z"
        log_events:
          - sequence: 1
            format: syslog_rfc5424
            template: "static message"
    """).encode()

    doc_in, _ = parse_olf(content)
    raw_out = write_olf_from_document(doc_in)
    doc_out, _ = parse_olf(raw_out)
    assert doc_out.id == doc_in.id
    assert doc_out.name == doc_in.name
    assert doc_out.log_events[0].sequence == 1
