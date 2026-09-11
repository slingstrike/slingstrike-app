# Contributing to openLogForge

Thank you for your interest in contributing. This document covers everything you need to know before submitting your first pull request.

---

## Contributor License Agreement (CLA)

**Before any pull request can be merged, you must accept the Contributor License Agreement.**

### What the CLA is

The CLA is a lightweight agreement that gives the openLogForge project the right to distribute your contribution. It is required because openLogForge has both a free Community edition and paid premium content packs.

### What rights you grant

By accepting the CLA you grant the project dual-licensing rights over your contribution:

- **CC-BY-4.0** - for distribution in the free Community edition
- **Commercial license** - for potential inclusion in paid premium content packs (e.g. Forge Pack: Initial Access & Execution)

This means a community use case you contribute could be selected for inclusion in a premium pack. If that happens, your contribution is still credited and you retain full copyright - you are only granting distribution rights, not ownership.

### What you keep

You retain full copyright over your contribution. The CLA grants distribution rights only. You can continue to use, publish, and build on your own work without restriction.

### A note on the project license

openLogForge is licensed under the **Apache License 2.0** - a true, OSI-approved open source license. You are free to use, modify, and distribute the application, including in production, at no cost. Your contribution will be subject to this license. Premium content packs are commercial content licensed separately and are not part of the open source code base. Read `LICENSE.txt` before contributing if you have any questions.

CLA acceptance is recorded automatically when you submit a pull request. A bot will prompt you if you have not yet accepted.

---

## What We Accept

| Type | Target repository | Notes |
| --- | --- | --- |
| Bug fix | `openlogforge/openlogforge` | Must include a failing test that the fix resolves |
| New feature (in-roadmap) | `openlogforge/openlogforge` | Must align to a milestone in the roadmap |
| Community use case | `openlogforge/community-usecases` | Must meet the acceptance criteria below |
| Documentation improvement | `openlogforge/openlogforge` | Covers `/docs`, README, API reference |
| Bug report | GitHub Issues | No PR required - use the issue template |

**Not accepted without prior approval:**

- Off-roadmap features - open a GitHub Discussion first; do not write code until the Senior Project Lead explicitly approves
- Native cloud deployment automation (Helm, Terraform) - planned for v1.1
- SIEM-native rule authoring or parsing (SPL, KQL)
- Windows / macOS native installers
- Custom theme engine - planned for v1.1

---

## Code Quality Standards

### CI grows with the codebase

The CI pipeline starts minimal and expands as code is added. At project inception it runs three jobs - backend lint, frontend lint, and Docker build - each of which skips gracefully if the corresponding files do not exist yet. Jobs for type checking, tests, coverage enforcement, and SAST are added to the pipeline as the relevant code lands. This means CI is always green and always meaningful, rather than a wall of failing jobs against an empty repository.

The full target pipeline is documented in the Senior Core Developer skill. If you are adding a new layer (e.g. the first test file, the first Alembic migration), open a PR that also adds the corresponding CI job.

All CI jobs must pass before a pull request will be reviewed. Do not open a PR with known CI failures.

### Python backend

| Tool | Command | Notes |
| --- | --- | --- |
| Linting + formatting | `ruff check . && ruff format --check .` | Replaces black, isort, flake8 |
| Type checking | `mypy .` | Strict mode - no implicit `any` |
| Tests | `pytest` | Unit + integration against real SQLite |
| Coverage | `pytest --cov` | Must stay >= 80% line coverage |
| SAST | `bandit -r app/` | Fails on unsafe `jinja2.Environment()` |
| Dependency scan | `safety check` | Fails on known CVEs |

### Frontend (React + TypeScript)

```bash
npm run lint      # ESLint + Prettier check
npm run build     # Vite production build - fails on TypeScript errors
```

### Security hard rules - these are build-failing violations

- Never use `jinja2.Environment()` - always use `jinja2.SandboxedEnvironment`
- Never hard-code secrets, credentials, or keys
- Never run Docker containers as root
- Never expose premium use case template content to non-admin users in any API response
- Never write derived decryption keys to disk or any log
- All database access via SQLAlchemy ORM - no raw SQL without explicit justification

---

## Git Workflow

### Branch naming

```text
feature/short-description    - new features
bugfix/short-description     - bug fixes
docs/short-description       - documentation only
```

### Commit message format

```text
type(scope): short description

feat(forger): add TCP TLS syslog transport
fix(auth): enforce account lockout after 10 failed attempts
docs(contributing): add CLA plain-language explanation
test(api): add integration tests for use case tier enforcement
```

---

## Pull Request Process

1. Fork the repository and create your branch from `main`
2. Make your changes following the code quality standards above
3. Ensure all CI jobs pass locally before opening the PR
4. Open a pull request against `main` with:
   - What the change does and why it is needed
   - Which roadmap milestone or GitHub Issue it addresses
   - Test evidence (screenshot or test output) for non-trivial changes
5. One approval from the Senior Core Developer is required to merge

---

## Community Use Case Contributions

Community use cases are submitted to `openlogforge/community-usecases` as `.olf` files. Each `.olf` file is a single YAML 1.2 document - one file, one use case. The format is human-readable and diffs clearly on GitHub. See the full schema at `docs/spec/olf-format.md`.

### Acceptance criteria

Every community use case PR must satisfy all of the following:

| Criterion | Requirement |
| --- | --- |
| MITRE mapping | At least one tactic ID (e.g. `TA0001`) and one technique ID (e.g. `T1059.001`) |
| Log format | At least one of: CEF, LEEF, JSON, RFC 3164/5424, WinEvtXML, Custom |
| Template quality | No hard-coded real IP addresses, hostnames, or credentials |
| Description | Minimum 2 sentences explaining the simulated scenario |
| Format version | `olf_version` must match the current value published in `docs/spec/olf-format.md` |
| CLA | Contributor must have accepted the project CLA |

---

## Off-Roadmap Feature Proposals

If you want to propose a feature that is not on the current roadmap:

1. Open a **GitHub Discussion** with a clear problem statement and proposed solution
2. Wait for a response from the Senior Project Architect (technical review) and Senior Project Lead (scheduling decision)
3. Do not write any code until the Senior Project Lead explicitly approves the proposal

Pull requests for unapproved off-roadmap features will be closed without review.

---

## Reporting Security Vulnerabilities

**Do not open a public GitHub Issue for security vulnerabilities.**

Read `SECURITY.md` for the full coordinated disclosure policy and instructions for submitting a private report via GitHub Security Advisories.

---

## Using AI Assistants

We welcome contributors to use AI-powered tools to assist their workflow - code generation, refactoring suggestions, test drafting, and documentation. Guidelines:

- Treat AI output as a draft, not final code - review and test thoroughly
- Ensure generated code meets the project's quality standards above
- Do not bypass CI checks with AI-generated code - the same rules apply
- Human oversight is expected - maintainers will review the reasoning behind changes, not just the output

---

## Community Guidelines

- Be respectful and constructive
- Assume good intent
- Help keep the project welcoming for everyone
- Follow the Code of Conduct [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
