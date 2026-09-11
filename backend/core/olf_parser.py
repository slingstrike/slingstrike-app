"""Community .olf file parser implementing the import pipeline from olf-format spec.

Import steps (must run in order):
  1. YAML parse with pre-construction anchor/alias scan
  2. Version check
  3. Schema validation (includes template security)
  4. Tier check
  Step 5 (UUID conflict resolution) and Step 6 (persistence) are API-layer concerns.

File size check (1 MB) must be performed by the caller before passing bytes here;
parse_olf() enforces it as a defence-in-depth guard.
"""

import io
import re
from typing import Any

from pydantic import ValidationError
from ruamel.yaml import YAML
from ruamel.yaml.nodes import MappingNode, SequenceNode

from core.olf_errors import OlfError
from forger.renderer import TemplateValidationError, validate_template
from schemas.olf import OlfDocument, OlfLogEvent

OLF_MAX_FILE_SIZE = 1_000_000  # 1 MB

_SUPPORTED_MAJOR = 1
_OLF_VERSION_RE = re.compile(r"^(\d+)\.(\d+)$")


def _make_yaml() -> YAML:
    y: YAML = YAML()
    y.version = (1, 2)
    return y


# ---------------------------------------------------------------------------
# Anchor / alias detection
# ---------------------------------------------------------------------------


def _walk_for_aliases(node: Any, visited: set[int] | None = None) -> None:
    """Walk a ruamel.yaml node tree; raise OlfError on any anchor definition or alias reference.

    In ruamel.yaml >=0.15, compose() resolves aliases immediately - an alias
    becomes the same Python node object referenced from multiple places.
    Two detection passes run together:
      - anchor definition: any node with a non-None .anchor attribute
      - alias reference: any node id seen more than once in the walk
    """
    if visited is None:
        visited = set()

    # Detect anchor definition (&name)
    anchor_val = getattr(node, "anchor", None)
    if anchor_val is not None:
        raise OlfError(
            "OLF_SCHEMA_INVALID",
            "YAML anchors and aliases are not permitted in .olf files",
        )

    node_id = id(node)
    # A node seen for the second time = it was referenced via an alias
    if node_id in visited:
        raise OlfError(
            "OLF_SCHEMA_INVALID",
            "YAML anchors and aliases are not permitted in .olf files",
        )
    visited.add(node_id)

    if isinstance(node, SequenceNode):
        for child in node.value:
            _walk_for_aliases(child, visited)
    elif isinstance(node, MappingNode):
        for key_node, val_node in node.value:
            _walk_for_aliases(key_node, visited)
            _walk_for_aliases(val_node, visited)
    # ScalarNode has no children


def _post_construction_alias_check(obj: Any, _seen: set[int] | None = None) -> None:
    """Walk the constructed Python object for any surviving anchor/alias artifact."""
    if _seen is None:
        _seen = set()
    obj_id = id(obj)
    if isinstance(obj, dict | list) and obj_id in _seen:
        raise OlfError(
            "OLF_SCHEMA_INVALID",
            "YAML anchors and aliases are not permitted in .olf files",
        )
    _seen.add(obj_id)
    if isinstance(obj, dict):
        for v in obj.values():
            _post_construction_alias_check(v, _seen)
    elif isinstance(obj, list):
        for item in obj:
            _post_construction_alias_check(item, _seen)


# ---------------------------------------------------------------------------
# Version check (Step 2)
# ---------------------------------------------------------------------------


def _check_version(doc: dict[str, Any], warnings: list[str]) -> None:
    raw = doc.get("olf_version")
    if raw is None:
        raise OlfError("OLF_VERSION_UNSUPPORTED", "olf_version field is missing")
    if not isinstance(raw, str):
        raise OlfError("OLF_VERSION_UNSUPPORTED", "olf_version must be a string")
    m = _OLF_VERSION_RE.match(raw)
    if not m:
        raise OlfError(
            "OLF_VERSION_UNSUPPORTED",
            f"olf_version '{raw}' is not in <major>.<minor> format",
        )
    major, minor = int(m.group(1)), int(m.group(2))
    if major != _SUPPORTED_MAJOR:
        if major > _SUPPORTED_MAJOR:
            raise OlfError(
                "OLF_VERSION_UNSUPPORTED",
                f"This use case requires a newer version of SlingStrike "
                f"(olf_version {raw}; supported major: {_SUPPORTED_MAJOR})",
            )
        raise OlfError(
            "OLF_VERSION_UNSUPPORTED",
            f"olf_version major {major} is not supported; "
            f"no prior major format version exists at v1.0 GA",
        )
    if minor > 0:
        warnings.append(
            f"olf_version {raw} is newer than this implementation (1.0); "
            "unknown fields from the higher minor are ignored"
        )


# ---------------------------------------------------------------------------
# Template security validation (part of Step 3)
# ---------------------------------------------------------------------------


def _validate_event_templates(events: list[OlfLogEvent]) -> None:
    for event in events:
        declared_names = set(event.variables.keys())
        try:
            validate_template(event.template, declared_names=declared_names)
        except TemplateValidationError as exc:
            raise OlfError(
                "OLF_SCHEMA_INVALID",
                f"Template security violation in event sequence {event.sequence}: {exc}",
            ) from exc


# ---------------------------------------------------------------------------
# Schema validation (Step 3)
# ---------------------------------------------------------------------------


def _validate_schema(doc: dict[str, Any]) -> OlfDocument:
    try:
        olf_doc = OlfDocument.model_validate(doc)
    except ValidationError as exc:
        first = exc.errors(include_url=False)[0]
        loc = " -> ".join(str(p) for p in first["loc"])
        raise OlfError(
            "OLF_SCHEMA_INVALID",
            f"Schema validation failed at {loc}: {first['msg']}",
            {"validation_errors": list(exc.errors(include_url=False))},
        ) from exc

    _validate_event_templates(olf_doc.log_events)
    return olf_doc


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def parse_olf(raw_bytes: bytes) -> tuple[OlfDocument, list[str]]:
    """Parse and fully validate a community .olf file.

    Returns (OlfDocument, warnings).  Raises OlfError on any failure.
    The caller is responsible for Steps 5 (UUID conflict) and 6 (persistence).
    """
    # Defence-in-depth size guard (caller must also check before this call)
    if len(raw_bytes) > OLF_MAX_FILE_SIZE:
        raise OlfError("OLF_SCHEMA_INVALID", "File exceeds 1 MB limit")

    warnings: list[str] = []
    y = _make_yaml()

    # Step 1a - pre-construction anchor/alias scan
    try:
        node_tree = y.compose(io.BytesIO(raw_bytes))
    except (UnicodeDecodeError, Exception) as exc:
        raise OlfError("OLF_SCHEMA_INVALID", f"YAML parse error: {exc}") from exc
    if node_tree is not None:
        _walk_for_aliases(node_tree)

    # Step 1b - construct Python document
    try:
        doc = y.load(io.BytesIO(raw_bytes))
    except (UnicodeDecodeError, Exception) as exc:
        raise OlfError("OLF_SCHEMA_INVALID", f"YAML parse error: {exc}") from exc

    if doc is None:
        raise OlfError("OLF_SCHEMA_INVALID", "YAML document is empty")
    if not isinstance(doc, dict):
        raise OlfError("OLF_SCHEMA_INVALID", "YAML document must be a mapping")

    # Step 1c - post-construction alias verification
    _post_construction_alias_check(doc)

    # Step 2 - version check
    _check_version(doc, warnings)

    # Step 3 - schema validation + template security
    olf_doc = _validate_schema(doc)

    # Step 4 - tier check
    if doc.get("tier") != "community":
        raise OlfError("OLF_INVALID_TIER", "Only community tier .olf files are accepted on import")

    return olf_doc, warnings
