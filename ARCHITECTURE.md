# Architecture

## Repository Layout

This is the canonical source of truth for the SlingStrike directory structure. No other document may restate or copy this tree - reference this section by link instead.

```text
SlingStrike/
├── backend/                      # Python 3.12 + FastAPI backend (Docker: app service)
│   ├── api/                      # FastAPI routers (/api/v1/*)
│   ├── core/                     # Config, auth, JWT, crypto, RBAC
│   ├── forger/                   # Async log forger engine (asyncio sockets)
│   ├── models/                   # SQLAlchemy ORM models
│   ├── schemas/                  # Pydantic request/response schemas
│   ├── alembic/                  # Alembic DB migrations
│   ├── tests/                    # pytest suite
│   ├── Dockerfile
│   ├── pyproject.toml
│   ├── requirements.txt
│   └── main.py                   # ASGI entrypoint
├── frontend/                     # React 18 + TypeScript frontend (Docker: web service)
│   ├── src/
│   │   ├── components/           # shadcn/ui component library
│   │   ├── pages/                # Route-level page components
│   │   ├── features/editor/      # Monaco log template editor
│   │   ├── features/session/     # Live SSE send-session view
│   │   └── api/                  # Typed API client
│   ├── Caddyfile                 # Serves SPA static files; proxies /api/* to app:8000
│   ├── Dockerfile
│   ├── index.html
│   └── package.json
├── bandit_plugins/               # Custom Bandit SAST plugins (CI hard gate)
├── docs/                         # MkDocs documentation site (published at v1.0 GA)
│   ├── content/
│   │   └── spec/olf-format.md    # Canonical .olf / .olf-premium format spec
│   └── mkdocs.yml
├── project/                      # Internal governance artefacts (not shipped)
│   ├── adr/                      # Architecture Decision Records
│   ├── rfcs/                     # Request for Comments
│   ├── meetings/                 # Meeting minutes
│   └── tasks/                    # Scoped task documents
├── scripts/                      # Operational scripts: install.sh, backup.sh
├── docker-compose.yml
├── Makefile
└── .github/workflows/            # GitHub Actions CI/CD pipeline
```

> Early development note: subdirectories not yet populated (`backend/api/`, `backend/core/`, `backend/forger/`, `backend/models/`, `backend/schemas/`, `backend/alembic/`, `frontend/src/components/`, `scripts/`) contain `.gitkeep` placeholders and represent the target layout that all new code must follow. Current `backend/routers/` will migrate to `backend/api/` as the router surface grows.

---

## Technology Stack

This is the canonical technology stack. No other document may restate or copy this table - reference this section by link instead. Changes require an RFC approved by the Senior Project Architect and Senior Project Lead.

| Layer | Technology | Rationale |
| ----- | ---------- | --------- |
| Frontend (SPA) | React 18 + TypeScript + Vite | Scoped to two hard UI problems only: Monaco log template editor and live SSE session stream. All other pages are standard REST calls to FastAPI. Contributors who only know Python never need to touch this layer. |
| UI Components | shadcn/ui + Tailwind CSS | Headless, accessible components. Keeps the React layer thin and consistent without a heavy design system. |
| Log Editor | Monaco Editor (React wrapper) | VS Code-grade editor with syntax highlighting for CEF, LEEF, JSON, syslog, and XML log templates. No viable Python-native equivalent for in-browser code editing. |
| Backend API | Python 3.12 + FastAPI | Python-native, fully async, auto-generates OpenAPI/Swagger docs. The primary contributor surface - security engineers know Python. Handles all business logic, RBAC, and DB access. |
| Log Forger | Python asyncio + socket (stdlib) | UDP/TCP sockets are first-class in Python asyncio. Runs as an async background task inside the FastAPI process - no extra service or runtime needed. |
| Database | SQLite via SQLAlchemy 2.0 | Single file, zero ops, ships as a volume mount inside the app container. SQLAlchemy is widely known across the Python/security community. Alembic handles migrations. |
| Auth | python-jose + passlib (bcrypt) | Pure Python JWT issuance and bcrypt password hashing. No external service or runtime dependency. |
| Crypto (DRM) | Python cryptography library (ECDSA P-256, AES-256-GCM) | Industry-standard Python crypto library, widely used in security tooling. Handles offline license key validation and premium bundle encryption entirely in Python. |
| Reverse Proxy | Caddy 2 | Serves the pre-built React SPA as static files and proxies `/api/*` to FastAPI. Automatic TLS when internet is available. Single Caddyfile - far simpler than nginx. |
| Containers | Docker + Docker Compose v2 - 2 services | `app` (Python FastAPI + forger, port 8000) and `web` (Caddy, ports 80/443). SQLite lives as a named volume inside app. Single `docker compose up` brings everything online. |
| CI/CD | GitHub Actions | Free for public repos. Runs pytest, ruff (linting), mypy (type checking), Bandit (SAST), and Docker multi-arch build on every PR. |
| Licence / OSS | Apache License 2.0 | True open-source licence (OSI-approved); free to use, modify, and distribute, including production use. The commercial model is content-based: premium content packs are licensed separately, per instance (§3.6.1). Resolved 2026-06-12 - supersedes the earlier BSL 1.1 classification. |

---

## Two-service Docker topology

```text
┌──────────────────────────────────────────┐
│  web  (Caddy + compiled React dist)      │
│  :80  - static SPA                       │
│  :80/api/*  - reverse proxy to app:8000  │
└──────────────────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────┐
│  app  (FastAPI + asyncio forger engine)  │
│  :8000  - internal only                  │
│  SQLite volume (persistent)              │
└──────────────────────────────────────────┘
```

SQLite is the only and permanent database.

---

## Format of .olf file

The `.olf` format specification lives at `docs/content/spec/olf-format.md` and is the authoritative contract for the community use case file format.
