"""Tests for core/olf_parser.py - community .olf import pipeline."""

import textwrap

import pytest

from core.olf_errors import OlfError
from core.olf_parser import OLF_MAX_FILE_SIZE, parse_olf

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_VALID_OLF = textwrap.dedent("""\
    olf_version: "1.0"
    id: "550e8400-e29b-41d4-a716-446655440000"
    name: "SSH Brute Force"
    description: "Simulates failed SSH logins."
    tier: community
    visibility: public_readonly
    created_by: "Jane Smith"
    created_at: "2026-06-06T12:00:00Z"
    last_edited_at: "2026-06-06T12:00:00Z"
    exported_at: "2026-06-27T10:00:00Z"
    imported_at: null
    classification:
      mitre_tactics:
        - TA0006
      mitre_techniques:
        - T1110.001
      tags:
        - linux
        - ssh
    log_source:
      category: os
      platform: linux
    log_events:
      - sequence: 1
        format: syslog_rfc5424
        template: |
          <34>1 {{timestamp}} {{hostname}} sshd 1234 - - Failed password for {{username}}
        variables:
          timestamp:
            type: timestamp
            default: "2026-06-06T12:00:00Z"
            source: generated
          hostname:
            type: hostname
            default: "web-prod-01"
            source: user_override
          username:
            type: string
            default: "admin"
            source: user_override
        delay_ms: 0
        repeat: 5
""").encode()


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


def test_valid_olf_parses_successfully() -> None:
    doc, warnings = parse_olf(_VALID_OLF)
    assert doc.id == "550e8400-e29b-41d4-a716-446655440000"
    assert doc.name == "SSH Brute Force"
    assert doc.tier == "community"
    assert doc.visibility.value == "public_readonly"
    assert len(doc.log_events) == 1
    assert doc.log_events[0].sequence == 1
    assert doc.log_events[0].repeat == 5


def test_valid_olf_returns_empty_warnings_for_current_version() -> None:
    _, warnings = parse_olf(_VALID_OLF)
    assert warnings == []


def test_higher_minor_version_produces_warning() -> None:
    content = _VALID_OLF.replace(b'"1.0"', b'"1.99"')
    doc, warnings = parse_olf(content)
    assert doc.olf_version == "1.99"
    assert any("1.99" in w for w in warnings)


def test_classification_fields_parsed() -> None:
    doc, _ = parse_olf(_VALID_OLF)
    assert doc.classification is not None
    assert "TA0006" in doc.classification.mitre_tactics
    assert "T1110.001" in doc.classification.mitre_techniques
    assert "linux" in doc.classification.tags


def test_log_source_parsed() -> None:
    doc, _ = parse_olf(_VALID_OLF)
    assert doc.log_source is not None
    assert doc.log_source.category is not None
    assert doc.log_source.category.value == "os"
    assert doc.log_source.platform == "linux"


def test_variables_parsed() -> None:
    doc, _ = parse_olf(_VALID_OLF)
    ev = doc.log_events[0]
    assert "timestamp" in ev.variables
    assert ev.variables["timestamp"].type.value == "timestamp"
    assert ev.variables["timestamp"].source.value == "generated"


def test_imported_at_null_is_none() -> None:
    doc, _ = parse_olf(_VALID_OLF)
    assert doc.imported_at is None


# ---------------------------------------------------------------------------
# File size limit
# ---------------------------------------------------------------------------


def test_rejects_file_exceeding_1mb() -> None:
    oversized = b"x" * (OLF_MAX_FILE_SIZE + 1)
    with pytest.raises(OlfError) as exc_info:
        parse_olf(oversized)
    assert exc_info.value.code == "OLF_SCHEMA_INVALID"


# ---------------------------------------------------------------------------
# YAML anchor / alias prohibition
# ---------------------------------------------------------------------------


def test_rejects_yaml_anchor_alias() -> None:
    content = textwrap.dedent("""\
        olf_version: "1.0"
        id: "550e8400-e29b-41d4-a716-446655440000"
        name: &anchor "SSH Brute Force"
        tier: community
        visibility: public_readonly
        created_by: "Jane"
        created_at: "2026-06-06T12:00:00Z"
        last_edited_at: "2026-06-06T12:00:00Z"
        exported_at: "2026-06-27T10:00:00Z"
        log_events:
          - sequence: 1
            format: custom
            template: "{{msg}}"
            variables:
              msg:
                type: string
                default: "hello"
    """).encode()
    with pytest.raises(OlfError) as exc_info:
        parse_olf(content)
    assert exc_info.value.code == "OLF_SCHEMA_INVALID"
    assert "alias" in exc_info.value.message.lower() or "anchor" in exc_info.value.message.lower()


def test_rejects_yaml_alias_reference() -> None:
    content = textwrap.dedent("""\
        olf_version: "1.0"
        id: "550e8400-e29b-41d4-a716-446655440000"
        name: "SSH Brute Force"
        tier: community
        visibility: public_readonly
        created_by: &author "Jane"
        created_at: "2026-06-06T12:00:00Z"
        last_edited_at: *author
        exported_at: "2026-06-27T10:00:00Z"
        log_events:
          - sequence: 1
            format: custom
            template: "msg"
    """).encode()
    with pytest.raises(OlfError) as exc_info:
        parse_olf(content)
    assert exc_info.value.code == "OLF_SCHEMA_INVALID"


# ---------------------------------------------------------------------------
# Version check (Step 2)
# ---------------------------------------------------------------------------


def test_rejects_missing_olf_version() -> None:
    content = _VALID_OLF.replace(b'olf_version: "1.0"\n', b"")
    with pytest.raises(OlfError) as exc_info:
        parse_olf(content)
    assert exc_info.value.code == "OLF_VERSION_UNSUPPORTED"


def test_rejects_malformed_olf_version() -> None:
    content = _VALID_OLF.replace(b'"1.0"', b'"not-a-version"')
    with pytest.raises(OlfError) as exc_info:
        parse_olf(content)
    assert exc_info.value.code == "OLF_VERSION_UNSUPPORTED"


def test_rejects_higher_major_version() -> None:
    content = _VALID_OLF.replace(b'"1.0"', b'"2.0"')
    with pytest.raises(OlfError) as exc_info:
        parse_olf(content)
    assert exc_info.value.code == "OLF_VERSION_UNSUPPORTED"
    assert "newer" in exc_info.value.message.lower()


def test_rejects_lower_major_version() -> None:
    content = _VALID_OLF.replace(b'"1.0"', b'"0.9"')
    with pytest.raises(OlfError) as exc_info:
        parse_olf(content)
    assert exc_info.value.code == "OLF_VERSION_UNSUPPORTED"


# ---------------------------------------------------------------------------
# Tier check (Step 4)
# ---------------------------------------------------------------------------


def test_rejects_premium_tier() -> None:
    content = _VALID_OLF.replace(b"tier: community", b"tier: premium")
    with pytest.raises(OlfError) as exc_info:
        parse_olf(content)
    assert exc_info.value.code == "OLF_INVALID_TIER"


# ---------------------------------------------------------------------------
# Schema validation (Step 3) - field constraints
# ---------------------------------------------------------------------------


def test_rejects_invalid_uuid() -> None:
    content = _VALID_OLF.replace(
        b'"550e8400-e29b-41d4-a716-446655440000"', b'"not-a-uuid"'
    )
    with pytest.raises(OlfError) as exc_info:
        parse_olf(content)
    assert exc_info.value.code == "OLF_SCHEMA_INVALID"


def test_rejects_whitespace_only_name() -> None:
    content = _VALID_OLF.replace(b'name: "SSH Brute Force"', b'name: "   "')
    with pytest.raises(OlfError) as exc_info:
        parse_olf(content)
    assert exc_info.value.code == "OLF_SCHEMA_INVALID"


def test_rejects_name_over_120_chars() -> None:
    long_name = "x" * 121
    content = _VALID_OLF.replace(b'"SSH Brute Force"', f'"{long_name}"'.encode())
    with pytest.raises(OlfError) as exc_info:
        parse_olf(content)
    assert exc_info.value.code == "OLF_SCHEMA_INVALID"


def test_rejects_invalid_timestamp_format() -> None:
    content = _VALID_OLF.replace(b'"2026-06-06T12:00:00Z"', b'"2026-06-06"', 1)
    with pytest.raises(OlfError) as exc_info:
        parse_olf(content)
    assert exc_info.value.code == "OLF_SCHEMA_INVALID"


def test_rejects_timestamp_with_offset_notation() -> None:
    content = _VALID_OLF.replace(b'"2026-06-06T12:00:00Z"', b'"2026-06-06T12:00:00+00:00"', 1)
    with pytest.raises(OlfError) as exc_info:
        parse_olf(content)
    assert exc_info.value.code == "OLF_SCHEMA_INVALID"


def test_rejects_duplicate_sequence_values() -> None:
    content = textwrap.dedent("""\
        olf_version: "1.0"
        id: "550e8400-e29b-41d4-a716-446655440000"
        name: "Test"
        tier: community
        visibility: private
        created_by: "Jane"
        created_at: "2026-06-06T12:00:00Z"
        last_edited_at: "2026-06-06T12:00:00Z"
        exported_at: "2026-06-27T10:00:00Z"
        log_events:
          - sequence: 1
            format: custom
            template: "msg"
          - sequence: 1
            format: custom
            template: "msg2"
    """).encode()
    with pytest.raises(OlfError) as exc_info:
        parse_olf(content)
    assert exc_info.value.code == "OLF_SCHEMA_INVALID"


def test_rejects_empty_log_events() -> None:
    content = textwrap.dedent("""\
        olf_version: "1.0"
        id: "550e8400-e29b-41d4-a716-446655440000"
        name: "Test"
        tier: community
        visibility: private
        created_by: "Jane"
        created_at: "2026-06-06T12:00:00Z"
        last_edited_at: "2026-06-06T12:00:00Z"
        exported_at: "2026-06-27T10:00:00Z"
        log_events: []
    """).encode()
    with pytest.raises(OlfError) as exc_info:
        parse_olf(content)
    assert exc_info.value.code == "OLF_SCHEMA_INVALID"


# ---------------------------------------------------------------------------
# Template security validation (part of Step 3)
# ---------------------------------------------------------------------------


def _olf_with_template(template_str: str) -> bytes:
    return textwrap.dedent(f"""\
        olf_version: "1.0"
        id: "550e8400-e29b-41d4-a716-446655440000"
        name: "Test"
        tier: community
        visibility: private
        created_by: "Jane"
        created_at: "2026-06-06T12:00:00Z"
        last_edited_at: "2026-06-06T12:00:00Z"
        exported_at: "2026-06-27T10:00:00Z"
        log_events:
          - sequence: 1
            format: custom
            template: "{template_str}"
    """).encode()


def test_rejects_template_with_comment_tag() -> None:
    with pytest.raises(OlfError) as exc_info:
        parse_olf(_olf_with_template("{# hidden #}"))
    assert exc_info.value.code == "OLF_SCHEMA_INVALID"


def test_rejects_template_with_filter() -> None:
    with pytest.raises(OlfError) as exc_info:
        parse_olf(_olf_with_template("{{ msg | upper }}"))
    assert exc_info.value.code == "OLF_SCHEMA_INVALID"


def test_rejects_template_with_getattr() -> None:
    with pytest.raises(OlfError) as exc_info:
        parse_olf(_olf_with_template("{{ obj.attr }}"))
    assert exc_info.value.code == "OLF_SCHEMA_INVALID"


def test_rejects_template_undeclared_variable() -> None:
    content = textwrap.dedent("""\
        olf_version: "1.0"
        id: "550e8400-e29b-41d4-a716-446655440000"
        name: "Test"
        tier: community
        visibility: private
        created_by: "Jane"
        created_at: "2026-06-06T12:00:00Z"
        last_edited_at: "2026-06-06T12:00:00Z"
        exported_at: "2026-06-27T10:00:00Z"
        log_events:
          - sequence: 1
            format: custom
            template: "{{declared}} {{undeclared}}"
            variables:
              declared:
                type: string
                default: "val"
    """).encode()
    with pytest.raises(OlfError) as exc_info:
        parse_olf(content)
    assert exc_info.value.code == "OLF_SCHEMA_INVALID"
    assert "undeclared" in exc_info.value.message


# ---------------------------------------------------------------------------
# Variable schema constraints
# ---------------------------------------------------------------------------


def test_rejects_min_max_on_non_integer() -> None:
    content = textwrap.dedent("""\
        olf_version: "1.0"
        id: "550e8400-e29b-41d4-a716-446655440000"
        name: "Test"
        tier: community
        visibility: private
        created_by: "Jane"
        created_at: "2026-06-06T12:00:00Z"
        last_edited_at: "2026-06-06T12:00:00Z"
        exported_at: "2026-06-27T10:00:00Z"
        log_events:
          - sequence: 1
            format: custom
            template: "{{hostname}}"
            variables:
              hostname:
                type: hostname
                default: "web-01"
                min: 1
    """).encode()
    with pytest.raises(OlfError) as exc_info:
        parse_olf(content)
    assert exc_info.value.code == "OLF_SCHEMA_INVALID"


def test_rejects_max_less_than_min() -> None:
    content = textwrap.dedent("""\
        olf_version: "1.0"
        id: "550e8400-e29b-41d4-a716-446655440000"
        name: "Test"
        tier: community
        visibility: private
        created_by: "Jane"
        created_at: "2026-06-06T12:00:00Z"
        last_edited_at: "2026-06-06T12:00:00Z"
        exported_at: "2026-06-27T10:00:00Z"
        log_events:
          - sequence: 1
            format: custom
            template: "{{port}}"
            variables:
              port:
                type: integer
                default: 80
                min: 100
                max: 50
    """).encode()
    with pytest.raises(OlfError) as exc_info:
        parse_olf(content)
    assert exc_info.value.code == "OLF_SCHEMA_INVALID"


def test_rejects_sequence_source_on_non_integer() -> None:
    content = textwrap.dedent("""\
        olf_version: "1.0"
        id: "550e8400-e29b-41d4-a716-446655440000"
        name: "Test"
        tier: community
        visibility: private
        created_by: "Jane"
        created_at: "2026-06-06T12:00:00Z"
        last_edited_at: "2026-06-06T12:00:00Z"
        exported_at: "2026-06-27T10:00:00Z"
        log_events:
          - sequence: 1
            format: custom
            template: "{{counter}}"
            variables:
              counter:
                type: string
                default: "val"
                source: sequence
    """).encode()
    with pytest.raises(OlfError) as exc_info:
        parse_olf(content)
    assert exc_info.value.code == "OLF_SCHEMA_INVALID"


# ---------------------------------------------------------------------------
# New variable types: ipv6, mac_address, hash, username
# ---------------------------------------------------------------------------


def _doc_with_variable(name: str, var_yaml: str) -> bytes:
    return textwrap.dedent(f"""\
        olf_version: "1.0"
        id: "550e8400-e29b-41d4-a716-446655440000"
        name: "Test"
        tier: community
        visibility: private
        created_by: "Jane"
        created_at: "2026-06-06T12:00:00Z"
        last_edited_at: "2026-06-06T12:00:00Z"
        exported_at: "2026-06-27T10:00:00Z"
        log_events:
          - sequence: 1
            format: custom
            template: "{{{{{name}}}}}"
            variables:
              {name}:
{var_yaml}
    """).encode()


def test_accepts_ipv6_variable() -> None:
    content = _doc_with_variable(
        "addr",
        '                type: ipv6\n'
        '                default: "2001:db8::1"\n'
        "                source: generated",
    )
    doc, _ = parse_olf(content)
    assert doc.log_events[0].variables["addr"].type.value == "ipv6"


def test_rejects_invalid_ipv6_default() -> None:
    content = _doc_with_variable(
        "addr",
        '                type: ipv6\n'
        '                default: "not-an-ip"',
    )
    with pytest.raises(OlfError) as exc_info:
        parse_olf(content)
    assert exc_info.value.code == "OLF_SCHEMA_INVALID"


def test_accepts_mac_address_variable() -> None:
    content = _doc_with_variable(
        "mac",
        '                type: mac_address\n'
        '                default: "02:1a:2b:3c:4d:5e"\n'
        "                source: generated",
    )
    doc, _ = parse_olf(content)
    assert doc.log_events[0].variables["mac"].type.value == "mac_address"


def test_rejects_uppercase_mac_address_default() -> None:
    content = _doc_with_variable(
        "mac",
        '                type: mac_address\n'
        '                default: "02:1A:2b:3c:4d:5e"',
    )
    with pytest.raises(OlfError) as exc_info:
        parse_olf(content)
    assert exc_info.value.code == "OLF_SCHEMA_INVALID"


def test_rejects_malformed_mac_address_default() -> None:
    content = _doc_with_variable(
        "mac",
        '                type: mac_address\n'
        '                default: "not-a-mac"',
    )
    with pytest.raises(OlfError) as exc_info:
        parse_olf(content)
    assert exc_info.value.code == "OLF_SCHEMA_INVALID"


def test_accepts_username_variable() -> None:
    content = _doc_with_variable(
        "user",
        '                type: username\n'
        '                default: "jsmith"\n'
        "                source: generated",
    )
    doc, _ = parse_olf(content)
    assert doc.log_events[0].variables["user"].type.value == "username"


def test_rejects_empty_username_default() -> None:
    content = _doc_with_variable(
        "user",
        '                type: username\n'
        '                default: ""',
    )
    with pytest.raises(OlfError) as exc_info:
        parse_olf(content)
    assert exc_info.value.code == "OLF_SCHEMA_INVALID"


def test_rejects_username_default_over_64_chars() -> None:
    content = _doc_with_variable(
        "user",
        '                type: username\n'
        f'                default: "{"a" * 65}"',
    )
    with pytest.raises(OlfError) as exc_info:
        parse_olf(content)
    assert exc_info.value.code == "OLF_SCHEMA_INVALID"


def test_accepts_hash_variable_default_algorithm() -> None:
    content = _doc_with_variable(
        "h",
        '                type: hash\n'
        f'                default: "{"a" * 64}"\n'
        "                source: generated",
    )
    doc, _ = parse_olf(content)
    assert doc.log_events[0].variables["h"].type.value == "hash"
    assert doc.log_events[0].variables["h"].algorithm is None


def test_accepts_hash_variable_with_md5_algorithm() -> None:
    content = _doc_with_variable(
        "h",
        '                type: hash\n'
        f'                default: "{"a" * 32}"\n'
        "                algorithm: md5\n"
        "                source: generated",
    )
    doc, _ = parse_olf(content)
    assert doc.log_events[0].variables["h"].algorithm == "md5"


def test_rejects_hash_default_wrong_length_for_algorithm() -> None:
    content = _doc_with_variable(
        "h",
        '                type: hash\n'
        f'                default: "{"a" * 64}"\n'
        "                algorithm: md5",
    )
    with pytest.raises(OlfError) as exc_info:
        parse_olf(content)
    assert exc_info.value.code == "OLF_SCHEMA_INVALID"


def test_rejects_uppercase_hash_default() -> None:
    content = _doc_with_variable(
        "h",
        '                type: hash\n'
        f'                default: "{"A" * 64}"',
    )
    with pytest.raises(OlfError) as exc_info:
        parse_olf(content)
    assert exc_info.value.code == "OLF_SCHEMA_INVALID"


def test_rejects_invalid_hash_algorithm_value() -> None:
    content = _doc_with_variable(
        "h",
        '                type: hash\n'
        f'                default: "{"a" * 64}"\n'
        "                algorithm: sha512",
    )
    with pytest.raises(OlfError) as exc_info:
        parse_olf(content)
    assert exc_info.value.code == "OLF_SCHEMA_INVALID"


def test_rejects_algorithm_on_non_hash_type() -> None:
    content = _doc_with_variable(
        "s",
        '                type: string\n'
        '                default: "val"\n'
        "                algorithm: sha256",
    )
    with pytest.raises(OlfError) as exc_info:
        parse_olf(content)
    assert exc_info.value.code == "OLF_SCHEMA_INVALID"
