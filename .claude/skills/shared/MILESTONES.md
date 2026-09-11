# Milestones

## Current milestone: v0.6 Beta

All agents MUST read this file first. This is the single authoritative release roadmap for all roles. Do not duplicate this table in role SKILL.md files or the PRD - link here instead. Update the "Current milestone" header above when a milestone is completed (Senior Project Lead approval required, as for any roadmap change).

## Tier Definitions

See [README.md - Editions](../../../README.md#editions) for Community vs Premium edition definitions.

---

| Milestone | Scope |
|-----------|-------|
| v0.1 Alpha | Core data model, basic use case CRUD, single-format UDP syslog sender, SQLite, single admin user. Establish base architecture. |
| v0.2 Alpha | All 6 log formats, TCP + TLS syslog, configurable destination target profiles (named profiles per destination: IP/hostname, port, protocol, TLS certificates, and other transport parameters). Backend protocol and format completeness. No frontend changes. |
| v0.3 Alpha | Basic web GUI/frontend (single-admin web UI for CRUD, settings and Monaco editor integration), Monaco editor with live preview. No auth yet. |
| v0.4 Beta | Single-admin auth (bcrypt, account lockout, JWT, password reset) and web UI auth flows. |
| v0.5 Beta | Docker Compose stack, `.olf` import/export engine, initial community use case library (12 use cases seeded from `.olf` at first startup). |
| v0.6 Beta | Premium core, application-side only: MFA (TOTP), offline license key activation, encrypted `.olf-premium` bundles (Ed25519 + AES-256-GCM + HKDF-SHA256), multi-user RBAC (Admin / Analyst / Viewer), audit log. Fully testable end-to-end with locally generated dev Ed25519 keys - no external infrastructure dependency. |
| v0.7 Beta | Commerce layer: Keygen.sh + Lemon Squeezy integration. Lemon Squeezy webhook triggers Keygen.sh license creation; Keygen.sh issues a per-customer Ed25519-signed license file and triggers generation of the encrypted `.olf-premium` bundle; customer receives a single activation package (ZIP containing `.lic` + `.olf-premium`) via expiring download link. Customer activates fully offline in the application via Settings > License Keys. First live end-to-end purchase flow. |
| v0.8 Beta | Enterprise authentication (Premium edition): LDAP / Active Directory integration in FastAPI - LDAP bind flow, group-to-role mapping, user record sync from directory, configuration UI. Requires an active Premium edition license. |
| v0.9 RC | Air-gapped deployment hardening, bare-metal install script, backup/restore, performance profiling, security audit. |
| v1.0 GA | Documentation site, first premium use case pack (Forge Pack: Initial Access & Execution), public open-source release, container image publication. Architecture stabilised. |
| v1.1 | Helm chart (Kubernetes), session scheduling, custom theme engine (user-defined colour schemes), Redis rate limiting, Use Cases workspace folder structure (user-defined directory hierarchy for organising personal use cases). |

**Explicitly out of scope for v1.0 - reject any RFC or PR that implements these early:**

- Native cloud deployment automation (Helm charts, Terraform)
- SIEM-native rule authoring or parsing (SPL, KQL)
- Windows / macOS native installers
- Automated SIEM feedback loop (alarm confirmation)
- Custom theme engine (user-defined colour schemes)
- QRadar / Elastic-specific SIEM integrations (openLogForge is SIEM-agnostic; destination target profiles are transport-level only)
