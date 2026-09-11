"""
Bandit plugin: Jinja2 SandboxedEnvironment enforcement (four checks).

Check 1 - check_jinja2_unsafe_environment
  Fail if jinja2.Environment() is instantiated instead of SandboxedEnvironment.
  Any Environment() call that resolves to jinja2 is a hard SSTI vector (CWE-94).

Check 2 - check_sandboxed_env_filters_not_cleared
  Fail if a function creates SandboxedEnvironment without .filters = {} in the
  same function body. Default Jinja2 filters remain active otherwise.

Check 3 - check_sandboxed_env_globals_not_cleared
  Fail if a function creates SandboxedEnvironment without .globals = {} in the
  same function body. Default globals (range, namespace, dict, etc.) remain
  accessible otherwise.

Check 4 - check_sandboxed_env_tests_not_cleared
  Fail if a function creates SandboxedEnvironment without .tests = {} in the
  same function body. Default Jinja2 tests (callable, iterable, mapping, etc.)
  remain accessible otherwise and can be used to probe object types.

All four checks are HIGH severity / HIGH confidence. Any single violation fails
the CI build. Coverage is at function-definition scope; module-level instantiation
of SandboxedEnvironment (unusual in practice) is not covered by checks 2, 3, 4.

References: CWE-94, OWASP A03:2021 Injection, olf-format.md Template Security.
"""

import ast

import bandit
from bandit.core import issue as b_issue


@bandit.checks("Call")
def check_jinja2_unsafe_environment(context: object) -> b_issue.Issue | None:
    """Check 1: jinja2.Environment() used instead of SandboxedEnvironment."""
    qual = getattr(context, "call_function_name_qual", None) or ""
    if "jinja2" in qual and qual.endswith("Environment") and "Sandboxed" not in qual:
        return b_issue.Issue(
            severity="HIGH",
            confidence="HIGH",
            text=(
                "jinja2.Environment() instantiated instead of SandboxedEnvironment. "
                "This is a Server-Side Template Injection (SSTI) vector "
                "(CWE-94, OWASP A03:2021). Use jinja2.sandbox.SandboxedEnvironment."
            ),
        )
    return None


def _has_sandboxed_env_call(func_node: ast.FunctionDef) -> bool:
    for child in ast.walk(func_node):
        if isinstance(child, ast.Call):
            func = child.func
            if isinstance(func, ast.Attribute) and func.attr == "SandboxedEnvironment":
                return True
            if isinstance(func, ast.Name) and func.id == "SandboxedEnvironment":
                return True
    return False


def _has_attribute_cleared(func_node: ast.FunctionDef, attr: str) -> bool:
    for child in ast.walk(func_node):
        if isinstance(child, ast.Assign):
            for target in child.targets:
                if (
                    isinstance(target, ast.Attribute)
                    and target.attr == attr
                    and isinstance(child.value, ast.Dict)
                    and len(child.value.keys) == 0
                ):
                    return True
    return False


@bandit.checks("FunctionDef", "AsyncFunctionDef")
def check_sandboxed_env_filters_not_cleared(context: object) -> b_issue.Issue | None:
    """Check 2: SandboxedEnvironment created without .filters = {}."""
    node = context._node  # type: ignore[attr-defined]
    if _has_sandboxed_env_call(node) and not _has_attribute_cleared(node, "filters"):
        return b_issue.Issue(
            severity="HIGH",
            confidence="HIGH",
            text=(
                "SandboxedEnvironment created without clearing .filters. "
                "Built-in Jinja2 filters remain available and can be chained to reach "
                "unsafe operations. Set env.filters = {} before any render call "
                "(CWE-94, OWASP A03:2021)."
            ),
        )
    return None


@bandit.checks("FunctionDef", "AsyncFunctionDef")
def check_sandboxed_env_globals_not_cleared(context: object) -> b_issue.Issue | None:
    """Check 3: SandboxedEnvironment created without .globals = {}."""
    node = context._node  # type: ignore[attr-defined]
    if _has_sandboxed_env_call(node) and not _has_attribute_cleared(node, "globals"):
        return b_issue.Issue(
            severity="HIGH",
            confidence="HIGH",
            text=(
                "SandboxedEnvironment created without clearing .globals. "
                "Default globals (range, namespace, dict, etc.) remain accessible "
                "and can be combined with other techniques to reach arbitrary code. "
                "Set env.globals = {} before any render call "
                "(CWE-94, OWASP A03:2021)."
            ),
        )
    return None


@bandit.checks("FunctionDef", "AsyncFunctionDef")
def check_sandboxed_env_tests_not_cleared(context: object) -> b_issue.Issue | None:
    """Check 4: SandboxedEnvironment created without .tests = {}."""
    node = context._node  # type: ignore[attr-defined]
    if _has_sandboxed_env_call(node) and not _has_attribute_cleared(node, "tests"):
        return b_issue.Issue(
            severity="HIGH",
            confidence="HIGH",
            text=(
                "SandboxedEnvironment created without clearing .tests. "
                "Default Jinja2 tests (callable, iterable, mapping, sequence, etc.) "
                "remain accessible and can be used to probe object types in templates. "
                "Set env.tests = {} before any render call "
                "(CWE-94, OWASP A03:2021, olf-format.md Template Security SAST check 4)."
            ),
        )
    return None
