from jinja2 import TemplateSyntaxError, nodes
from jinja2.sandbox import SandboxedEnvironment


class TemplateValidationError(ValueError):
    pass


def _make_env() -> SandboxedEnvironment:
    env = SandboxedEnvironment()
    env.filters = {}
    env.globals = {}
    env.tests = {}
    return env


def _has_forbidden_nodes(node: nodes.Node) -> bool:
    forbidden = (
        nodes.Filter,
        nodes.If,
        nodes.For,
        nodes.Block,
        nodes.Getattr,
        nodes.Getitem,
        nodes.Call,
    )
    if isinstance(node, forbidden):
        return True
    return any(_has_forbidden_nodes(child) for child in node.iter_child_nodes())


def validate_template(
    template: str,
    declared_names: set[str] | None = None,
) -> None:
    """Two-stage template security validation per olf-format.md Template Security.

    When declared_names is provided, any variable referenced in the template that
    is not in that set is rejected (spec: undeclared variables are OLF_SCHEMA_INVALID,
    not rendered as empty strings).  Pass None to skip the undeclared-variable check
    (forger render path, where Jinja2 undefined handling applies instead).
    """
    # Stage 1: pre-parse {# scan
    if "{#" in template:
        raise TemplateValidationError("Template contains forbidden comment delimiter '{#'")

    env = _make_env()
    try:
        ast = env.parse(template)
    except TemplateSyntaxError as exc:
        raise TemplateValidationError(f"Template syntax error: {exc}") from exc

    # Stage 2: AST inspection for forbidden node types
    if _has_forbidden_nodes(ast):
        raise TemplateValidationError("Template contains forbidden Jinja2 constructs")

    # Undeclared variable check (import/schema validation path only)
    if declared_names is not None:
        referenced = {node.name for node in ast.find_all(nodes.Name)}
        undeclared = referenced - declared_names
        if undeclared:
            raise TemplateValidationError(
                f"Template references undeclared variable(s): {sorted(undeclared)}"
            )


def render_template(template: str, variables: dict[str, str]) -> str:
    """Render a validated template with provided variable overrides."""
    env = _make_env()
    return env.from_string(template).render(variables)
