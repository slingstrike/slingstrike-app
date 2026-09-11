# General Principles
- Readability over cleverness: Code should be easy to understand.
- Consistency matters: Follow the same patterns across the project.
- Explicit is better than implicit (Zen of Python).

# Python Code Style
- Follow PEP 8 as the baseline.
- Use black for automatic code formatting.
- Use isort for import ordering.
- Maximum line length: 88 characters.

## Naming conventions:
- Variables & functions: snake_case
- Classes: PascalCase
- Constants: UPPER_CASE

## Django Conventions
### Apps
Each app should have a clear, single responsibility.

### Models
- Use verbose_name and help_text for fields.
- Add __str__ methods for readability.

### Views
- Prefer class-based views over function-based views.
- Keep views thin; move business logic to services or models.

### Templates
- Use {% block %} and {% extends %} for reusability.
= Keep logic minimal in templates.

### URLs
- Use path() instead of url().
- Namespace app URLs.


# Testing
- Use pytest with pytest-django.
- Place tests in a tests/ directory inside each app.
- Follow the Arrange-Act-Assert pattern.
- Aim for meaningful test names: test_user_can_login_with_valid_credentials.


# Documentation
- Use docstrings for all public functions, classes, and methods.
- Follow PEP 257 for docstring conventions.
- Markdown files (README.md, STYLEGUIDE.md) should use clear headings and lists.

# Git & Commit Messages
- Branch naming: feature/xyz, bugfix/xyz, docs/xyz.
- Commit message format:

```
<type>(scope): short description

[optional body]
Examples:

feat(auth): add login view

fix(models): correct user profile relation

docs: update styleguide
```

# Dependencies
- Pin versions in requirements.txt.
- Use pip-tools for dependency management.
- Keep dependencies minimal.


# Code Quality Tools
- black → formatting
- isort → import sorting
- flake8 → linting
- mypy → optional static typing


# Security & Best Practices
- Never commit secrets or credentials.
- Use environment variables (.env) for sensitive settings.
- Validate all user input.
- Keep Django updated to the latest stable version.