"""
Bandit plugin: stdlib yaml import prohibition in app/.

Prohibits both import forms of the stdlib yaml module inside app/:
  import yaml
  from yaml import ...

All YAML parsing in app/ must use ruamel.yaml in YAML 1.2 mode. The stdlib yaml
module defaults to YAML 1.1, which silently coerces bare strings (yes/no/on/off)
to booleans - corrupting log templates. It also has a longer history of unsafe
loader defaults (yaml.load() without Loader= is a code execution vector).

Scope: app/ only. bandit_plugins/ and tests/ are excluded by bandit config.

References: olf-format.md YAML Parser Requirements,
project/tasks/2026-06-12-sso-import-hardening.md.
"""

import ast

import bandit
from bandit.core import issue as b_issue

_ISSUE_TEXT = (
    "stdlib yaml imported in app/. All YAML parsing must use ruamel.yaml in "
    "YAML 1.2 mode (import ruamel.yaml). The stdlib yaml module uses YAML 1.1 "
    "by default, corrupts log templates via boolean coercion, and has a history "
    "of unsafe loader defaults."
)


@bandit.checks("Import", "ImportFrom")
def check_stdlib_yaml_import(context: object) -> b_issue.Issue | None:
    """Fail on: import yaml  OR  from yaml import ..."""
    node = context._node  # type: ignore[attr-defined]

    if isinstance(node, ast.Import):
        for alias in node.names:
            if alias.name == "yaml" or alias.name.startswith("yaml."):
                return b_issue.Issue(severity="HIGH", confidence="HIGH", text=_ISSUE_TEXT)

    elif isinstance(node, ast.ImportFrom):
        module = node.module or ""
        if module == "yaml" or module.startswith("yaml."):
            return b_issue.Issue(severity="HIGH", confidence="HIGH", text=_ISSUE_TEXT)

    return None
