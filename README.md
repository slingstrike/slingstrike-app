# SlingStrike

**Self-hosted SIEM detection rule testing platform.**

Build, manage, and replay log-based attack simulation use cases. Ship realistic log sequences directly to your SIEM over syslog to validate detection rules before attackers test them for you.

---

## What it does

SlingStrike lets security teams:

- Build reusable log simulation use cases mapped to MITRE ATT&CK techniques
- Replay them against any SIEM that accepts syslog (QRadar, Elastic, Splunk, and others)
- Share use cases with your team or the community via the GitHub-based marketplace
- Run fully offline in air-gapped environments - no log data or SIEM credentials ever leave your environment

It ships realistic log sequences - not attacks. No red team access required. No production traffic involved.

---

## Getting Started

### Prerequisites

- Docker and Docker Compose v2
- Python 3.12
- Node.js 20+ (for frontend work only)

### Local tests

```bash
make ci
```

### Local setup

```bash
# Clone your fork
git clone https://github.com/SlingStrike/SlingStrike.git
cd SlingStrike

# Start the full stack
docker compose up --build

# Backend only (for API development)
cd backend
pip install -r requirements.txt
OLF_DB_PATH=./SlingStrike.db uvicorn main:app --reload

# Frontend only (for UI development)
cd frontend
npm install
npm run dev
# Open http://localhost:5173 - proxies /api to http://localhost:8000
```

Open `http://localhost` in your browser. The onboarding wizard guides you through connecting your first SIEM target and running your first use case in under 10 minutes.

> **Note:** SlingStrike is currently in early development (pre-alpha). The Docker image is not yet published. Watch this repository for the v0.1 Alpha release.

---

## Editions

| Edition   | Who it is for                                                                           | How to get it                                |
|-----------|-----------------------------------------------------------------------------------------|----------------------------------------------|
| Community | Individual security professionals - personal labs, home environments, solo use          | Free, no license key required                |
| Premium   | Teams and companies - multi-user, networked deployments, compliance-driven environments | Per-instance license key, offline activation |

Community edition is fully functional for solo use. Premium adds team-oriented features: MFA, RBAC, LDAP/AD, and audit log. See the feature comparison below.

---

## Features

| Feature | Community tier | Premium tier |
| --- | --- | --- |
| Use case builder with Monaco log template editor | Yes | Yes |
| UDP / TCP / TLS syslog output | Yes | Yes |
| CEF, LEEF, JSON, RFC 3164/5424, WinEvtXML, Custom formats | Yes | Yes |
| MITRE ATT&CK tagging | Yes | Yes |
| Community use case library | Yes | Yes |
| Air-gapped deployment | Yes | Yes |
| Multi-user RBAC | - | Yes |
| MFA (TOTP)| - | Yes |
| Audit log | - | Yes |
| LDAP / Active Directory integration | - | Yes |
| Expert-authored, validated use case packs | - | One-time purchase |

> **Note:** Premium packs are a **perpetual license** — no expiry, no subscription. Your installation keeps working forever. Optional annual maintenance covers application updates (including new major versions), security patches, and updated versions of your already-purchased packs. New packs are always a separate one-time purchase.

---

## Self-hosted and air-gap friendly

SlingStrike runs as two Docker containers. No external services, no cloud dependencies, no phone-home.

```text
backend   - Python 3.12 + FastAPI backend + async log forger engine
frontend   - Caddy reverse proxy serving the React frontend
```

All data stays in a local SQLite volume.

---

## Community use cases

Community use cases live in [SlingStrike/community-usecases](https://github.com/SlingStrike/community-usecases). Each use case is a single `.olf` file - an open, human-readable YAML 1.2 document. The spec is published at [docs/content/spec/olf-format.md](docs/content/spec/olf-format.md).

Browse the repository on GitHub, download `.olf` files, and import them via the SlingStrike UI. To contribute, export your use case as an `.olf` file and open a pull request.

---

## Requirements

- Docker Engine 24+ and Docker Compose v2
- 2 vCPU / 8 GB RAM minimum (4 vCPU / 16 GB RAM recommended for heavy forger sessions)
- Linux, macOS, or Windows with WSL2

---

## Checkpoints

| Status | Scope |
| --- | --- |
| [ - ] | Core data model, use case CRUD, UDP syslog, SQLite, single admin |
| [ - ] | All 6 log formats, TCP + TLS syslog, destination target profiles |
| [ - ] | Web GUI, Monaco log template editor with live preview |
| [ - ] | Single-admin auth (bcrypt, account lockout, JWT, password reset) |
| [ - ] | Docker Compose stack, 12 bundled community use cases, .olf import/export |
| [ - ] | Premium core: MFA, offline license activation, encrypted bundles, RBAC, audit log |
| [ - ] | Commerce layer: license service at premium.SlingStrike.com (Lemon Squeezy), end-to-end purchase flow, offline activation via web UI |
| [ - ] | Enterprise authentication: LDAP / Active Directory integration (Premium edition) |
| [ - ] | Air-gap hardening, bare-metal install, backup/restore, security audit |
| [ - ] | Docs site, Forge Pack: Initial Access & Execution premium pack, public release |
| [ - ] | Helm chart (Kubernetes), session scheduling, custom theme engine, Redis rate limiting |

---

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a pull request. Key points:

- CLA acceptance is required before any PR is merged
- All CI jobs must pass (ruff, mypy, pytest, bandit, safety, ESLint, Docker build)
- Off-roadmap feature proposals go through GitHub Discussions first
- Security vulnerabilities: see [SECURITY.md](SECURITY.md) - do not open a public issue

---

## Security

See [SECURITY.md](SECURITY.md) for the coordinated disclosure policy and instructions for reporting vulnerabilities privately via GitHub Security Advisories.

---

## License

Apache License 2.0 - true open source, free for all use including production. See [LICENSE.txt](LICENSE.txt).

Premium content packs are sold separately under a **perpetual license** (one-time purchase, per instance). Optional annual maintenance covers application updates and security patches for the duration of the term.

---

## Links

- Website: [SlingStrike.com](https://SlingStrike.com)
- Documentation: [docs.SlingStrike.com](https://docs.SlingStrike.com)
- Community use cases: [github.com/SlingStrike/community-usecases](https://github.com/SlingStrike/community-usecases)
- Security policy: [SECURITY.md](SECURITY.md)
- Changelog: [CHANGELOG.md](CHANGELOG.md)
