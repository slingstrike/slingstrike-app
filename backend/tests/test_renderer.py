import pytest

from forger.renderer import TemplateValidationError, render_template, validate_template


def test_validate_template_simple_variable() -> None:
    validate_template("{{hostname}} auth failure")


def test_validate_template_empty() -> None:
    validate_template("")


def test_validate_template_static_text() -> None:
    validate_template("<34>Jun 23 12:00:00 web-01 sshd: connection accepted")


def test_validate_template_rejects_comment_delimiter() -> None:
    with pytest.raises(TemplateValidationError, match="comment"):
        validate_template("{# this is a comment #}")


def test_validate_template_rejects_comment_delimiter_inline() -> None:
    with pytest.raises(TemplateValidationError, match="comment"):
        validate_template("message {# hidden #} suffix")


def test_validate_template_rejects_filter() -> None:
    with pytest.raises(TemplateValidationError):
        validate_template("{{ hostname | upper }}")


def test_validate_template_rejects_if_block() -> None:
    with pytest.raises(TemplateValidationError):
        validate_template("{% if True %}bad{% endif %}")


def test_validate_template_rejects_for_loop() -> None:
    with pytest.raises(TemplateValidationError):
        validate_template("{% for i in x %}{{i}}{% endfor %}")


def test_validate_template_rejects_getattr() -> None:
    with pytest.raises(TemplateValidationError):
        validate_template("{{ obj.attr }}")


def test_validate_template_rejects_getitem() -> None:
    with pytest.raises(TemplateValidationError):
        validate_template("{{ obj['key'] }}")


def test_validate_template_rejects_call() -> None:
    with pytest.raises(TemplateValidationError):
        validate_template("{{ func() }}")


def test_validate_template_rejects_syntax_error() -> None:
    with pytest.raises(TemplateValidationError, match="syntax"):
        validate_template("{{ unclosed")


def test_render_template_substitutes_variables() -> None:
    result = render_template(
        "<34>{{timestamp}} {{hostname}} sshd: auth failure",
        {"timestamp": "Jun 23 12:00:00", "hostname": "web-01"},
    )
    assert result == "<34>Jun 23 12:00:00 web-01 sshd: auth failure"


def test_render_template_no_variables() -> None:
    result = render_template("static message", {})
    assert result == "static message"


def test_render_template_partial_override() -> None:
    result = render_template("{{a}} and {{b}}", {"a": "hello"})
    assert result == "hello and "


def test_render_template_undefined_renders_empty() -> None:
    result = render_template("{{missing}}", {})
    assert result == ""


def test_render_template_multiple_variables() -> None:
    result = render_template(
        "<{{pri}}>{{ts}} {{host}} {{app}}: {{msg}}",
        {"pri": "34", "ts": "Jun 23 12:00:00", "host": "srv", "app": "sshd", "msg": "login ok"},
    )
    assert result == "<34>Jun 23 12:00:00 srv sshd: login ok"
