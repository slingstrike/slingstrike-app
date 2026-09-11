"""
Bandit plugin: HKDF info parameter enforcement (check 5).

Check 5 - check_hkdf_kdf_info_fields_not_used
  Fail if the string literal "kdf_info_fields" is used as a subscript key
  anywhere in the codebase.

Rationale: olf-format.md §Activation Flow Step 4 defines the HKDF info parameter
as a hardcoded construction:

    info = license_key_fingerprint.encode('utf-8') + pack_id.encode('utf-8')

The manifest.json field `kdf_info_fields` is informational only and MUST NOT be
read to determine the info parameter. A tampered bundle that sets kdf_info_fields
to an attacker-controlled value could redirect key derivation if the implementation
naively uses that field.

This check flags any dict subscript access with the literal key "kdf_info_fields",
e.g. manifest_data["kdf_info_fields"]. To safely discard the field after parsing
(as required by the spec), use manifest_data.pop("kdf_info_fields", None) instead.

References: olf-format.md §Activation Flow Step 4, CWE-327 (use of broken/risky
cryptographic algorithm via tampered parameters).
"""

import ast

import bandit
from bandit.core import issue as b_issue


@bandit.checks("Subscript")
def check_hkdf_kdf_info_fields_not_used(context: object) -> b_issue.Issue | None:
    """Check 5: 'kdf_info_fields' must never be used as a dict subscript key."""
    node = context._node  # type: ignore[attr-defined]
    slice_node = node.slice

    # Python 3.8 wraps the slice in ast.Index; 3.9+ uses the node directly.
    if isinstance(slice_node, ast.Index):
        slice_node = slice_node.value  # type: ignore[attr-defined]

    if isinstance(slice_node, ast.Constant) and slice_node.value == "kdf_info_fields":
        return b_issue.Issue(
            severity="HIGH",
            confidence="HIGH",
            text=(
                "Subscript access on 'kdf_info_fields' is prohibited. "
                "The HKDF info parameter must be hardcoded as "
                "license_key_fingerprint.encode('utf-8') + pack_id.encode('utf-8') "
                "and must never be derived from the parsed manifest field "
                "kdf_info_fields. A tampered bundle could redirect key derivation "
                "via this field. To discard the field after Step 0 parsing, use "
                "manifest_data.pop('kdf_info_fields', None) instead of subscript "
                "access (olf-format.md §Activation Flow Step 4, SAST check 5)."
            ),
        )
    return None
