# SlingStrike

**Product Requirements Document**

*SIEM Threat Detection Testing & Correlation Rules Validation Platform*

**Classification: Open Source (Apache License 2.0)**

---

## 1. Introduction

### 1.1 Purpose

This Product Requirements Document (PRD) defines the functional and non-functional requirements for SlingStrike - an open-source web application designed to help cybersecurity analysts, SOC engineers, and SIEM consultants test and validate threat detection correlation rules by simulating realistic log data.

### 1.2 Product Vision

SlingStrike provides a self-hosted, Docker-friendly platform where security teams can build, manage, replay, and share log-based attack simulation use cases. By shipping realistic log sequences directly to SIEM platforms preferably via UDP/TCP syslog, teams can validate detection coverage before and after rule changes - closing the gap between rule authorship and real-world efficacy.

### 1.3 Background & Problem Statement

Modern SIEM correlation rules are difficult to test without production traffic or risky live simulations. Existing options - red team exercises, attack simulation tools, or manual log injection - are expensive, time-consuming, or require significant expertise. Security teams lack a simple, repeatable method to:

- Verify that a new or modified rule fires on known-bad log patterns.
- Reproduce a historical incident to regression-test rule changes.
- Share reproducible test cases across teams or with the broader community.
- Maintain a library of scenarios mapped to threat frameworks (e.g., MITRE ATT&CK).

SlingStrike addresses these gaps with a structured use-case library, a built-in log forger/sender, and a community marketplace driven by cybersecurity professionals.

### 1.4 Scope

**In scope for v1.0:**

- Use-case management (create, edit, clone, tag, organise) with first-class source-type classification as a structured field alongside free-form tags.
- Use-case organisation by log source type - a predefined taxonomy covering OS (Linux, Windows), application category (web server, database, authentication), and device type (firewall, endpoint, network device) - enabling filtered browsing alongside MITRE ATT&CK tactic/technique views.
- Log template authoring with variable substitution, patterns or objects.
- Log shipping via UDP syslog, TCP syslog (plain and TLS).
- Multi-format log output: CEF, LEEF, JSON, RFC 3164/5424 syslog, Windows Event XML, custom.
- Two strictly separated use case tiers:
  - **Community** - the default tier. SlingStrike ships with 12 out-of-the-box community use cases, seeded at first startup as ordinary community-tier use cases (§3.4); additional community use cases are imported at the user's discretion as `.olf` files (sourced from the GitHub-hosted community repository or any other exchange). Fully editable and exportable.
  - **Premium** - commercially licensed; activated via license key after purchase; encrypted and read-only; cannot be exported or edited directly; cloneable into the community tier for full customisation, with one-click rollback to the original premium version at any time; multi-user access with role-based access control (Admin, Analyst, Viewer), audit log, and LDAP / Active Directory integration.
- File-based community import/export (`.olf` bundles). The community marketplace is hosted on GitHub (`SlingStrike/community-usecases`) and accessed outside the application - the application performs no direct GitHub interaction (see §3.5.3).
- Docker Compose and bare-metal Linux deployment.
- Full offline / air-gapped operation.

**Out of scope for v1.0:**

- Native cloud deployment automation (Helm charts, Terraform) - planned for v1.1.
- SIEM-native rule authoring or parsing (SPL, KQL).
- Windows / macOS native installers.
- Automated SIEM feedback loop (alarm confirmation).
- Native SIEM API integrations (alarm confirmation, active log querying). Named SIEM target profiles (QRadar, Elastic) with format defaults are in scope as syslog delivery endpoints; see §3.3.2.
- Custom theme engine (user-defined colour schemes) - planned for v1.1.
- In-app GitHub integration (browse / pull / push from within the UI, PAT storage) - removed by design (CEO decision 2026-06-12): SlingStrike is air-gap-first and never connects to GitHub or any external service for community content; community sharing is file-based via `.olf` bundles (§3.5.3).

### 1.5 Commercial Model

The application is free and open source (Apache License 2.0). Revenue is generated through three streams:

- **Community edition** - free for all users, self-hosted, unlimited use, community support via GitHub Issues.
- **Premium packs** - curated, expert-authored use case bundles sold as a **perpetual license** (one-time, per-instance price) via Lemon Squeezy. Purchase grants permanent access to the pack and premium application features (multi-user RBAC, audit log, LDAP / Active Directory integration) at the version active at the time of purchase. License issuance and offline activation are managed through Keygen.sh. See §3.6 and §3.6.3.
- **Annual maintenance** (optional, per instance, sold in 1-, 2-, or 3-year terms) - covers all minor and major application updates released during the maintenance period, plus updates to already-purchased content packs. Without active maintenance the purchased version remains fully functional but receives no updates, including security patches. Maintenance renewal rate is a direct indicator of product value to the customer. New content packs are always a separate one-time purchase regardless of maintenance status.
- **Professional Services** - bespoke development engagements for enterprise customers requiring custom SIEM protocol connectors, proprietary log format support, or specific feature development outside the standard product roadmap. Quoted on request; promoted on the Pricing page (§11.2).

---

## 2. Stakeholders & User Personas

### 2.1 Primary Personas

#### Persona 1 - SOC Analyst

**Background:** Works daily in a SIEM console, writing and tuning detection rules. Wants to quickly replay known attack patterns to verify a new rule fires correctly without involving the red team.

**Goals:** Run a pre-built use case in under 5 minutes. See the exact log lines sent. Verify the SIEM alarm appeared.

**Pain Points:** Existing tools require CLI expertise or live infrastructure. No easy way to share test cases with colleagues.

#### Persona 2 - Cybersecurity Consultant

**Background:** Delivers SIEM engagements for multiple clients across different industries. Needs portable, repeatable test packs for common threat scenarios (credential theft, lateral movement, exfiltration).

**Goals:** Build a private library of reusable use cases. Export them as a bundle for a client handover. Purchase premium content packs mapped to MITRE ATT&CK.

**Pain Points:** Each client has a slightly different SIEM and log format. Needs multi-format output from a single test definition.

#### Persona 3 - Security Engineer / SIEM Admin

**Background:** Responsible for the SIEM platform health and onboarding new log sources. Needs to test that new parsers and correlation rules work end-to-end before promotion to production.

**Goals:** Deploy SlingStrike as an internal shared service. Configure multiple SIEM targets. Manage team access and audit who ran which test.

**Pain Points:** Onboarding a new log source requires manual log injection. No audit trail for who sent what and when.

#### Persona 4 - Threat Intelligence / Detection Engineer

**Background:** Translates threat intelligence into detection logic. Creates new use cases from IOC reports and TTPs.

**Goals:** Build a use case from scratch using real log evidence from an incident report. Tag it to MITRE ATT&CK. Export it as an `.olf` bundle and publish it to the GitHub community repository via a pull request (outside the application).

**Pain Points:** No standard format for sharing test cases with the community. Hard to diff or version-control test definitions.

---

## 3. Functional Requirements

### 3.1 Use Case Management

#### 3.1.1 Use Case Data Model

The canonical field definitions - content fields, classification, log source, log events, and variable schema - are specified in [`docs/content/spec/olf-format.md`](../../../docs/content/spec/olf-format.md). The application database stores all spec fields plus the following two app-only runtime fields that are never exported to `.olf` files:

| Field                | Type          | Description                                                                                                                       |
|----------------------|---------------|-----------------------------------------------------------------------------------------------------------------------------------|
| `license_key_id`     | UUID / null   | Reference to the license key that unlocked this use case (premium only).                                                          |
| `source_use_case_id` | UUID / null   | UUID of the originating premium use case for community clones. Enables Reset to Original (§3.1.2). Null for all other use cases.  |

The `visibility` field is defined in the spec. Its RBAC enforcement rules in multi-user (premium) deployments are covered in §3.7; in single-admin (community) deployments the field is stored at its default but not enforced and the UI hides the selector.

#### 3.1.2 Use Case Operations

The system SHALL support the following operations on use cases:

- **Create** - Analysts and Admins can create new community-tier use cases (default visibility: `public_readonly`); premium use cases are activated via license key. The 12 bundled use cases are seeded as ordinary community-tier use cases at first startup (§3.4.2).
- **Read** - All authenticated users can view public community and unlocked premium use cases. Community use cases with visibility `private` are visible only to their owner and Admins.
- **Update** - For community use cases: the owner and Admins can always edit. Any authenticated user may additionally edit use cases with visibility `public_collaborative`. Premium use cases are read-only regardless of visibility.
- **Clone** - Any authenticated user can clone a public community use case; the resulting copy is always community tier with default visibility `public_readonly`. A `private` community use case can only be cloned by its owner. Premium use cases CAN be cloned by any user holding an active license; the clone is community tier, fully editable, and retains a `source_use_case_id` reference to the originating premium use case.
- **Reset to Original** - Available only on community use cases with a non-null `source_use_case_id` (i.e. cloned from a premium source). A one-click "Reset to Original" action overwrites the clone's content (name, description, log events, tags, MITRE mappings) with the current content of the linked premium use case. The originating license key must remain active. Only the clone's owner and Admins can trigger a reset. A confirmation prompt is shown before any data is overwritten.
- **Delete** - For community use cases: the owner and Admins can always delete. Any authenticated user may additionally delete use cases with visibility `public_collaborative`. Premium use cases cannot be deleted, only deactivated. Bundled community use cases follow normal community delete rules; deleted ones can be recovered by re-import (§3.4.2).
- **Search & Filter** - Full-text search by name/description; filter by tier, visibility, MITRE tactic/technique, tag, log source category/platform, format, and SIEM target type.
- **Categorise** - Use cases are organised in a folder/collection tree (max 3 levels deep).

#### 3.1.3 Log Source Taxonomy

The `log_source_category` and `log_source_platform` fields use the following predefined taxonomy. The `platform` values listed are **recommended**; free-form strings are accepted for forward compatibility with platforms not yet in the list.

| Category | Enum Value | Suggested Platform Values |
| -------- | ---------- | ------------------------- |
| Operating System | `os` | `linux`, `windows`, `macos` |
| Application | `application` | `apache_httpd`, `nginx`, `iis`, `mysql`, `mssql`, `oracle_db`, `exchange`, `postfix`, `active_directory`, `okta`, `ftp_server` |
| Security Device | `security_device` | `palo_alto`, `fortinet`, `cisco_asa`, `check_point`, `crowdstrike`, `sentinelone`, `ids_ips`, `web_proxy`, `waf` |
| Network Device | `network_device` | `cisco_ios`, `juniper`, `aruba`, `vpn_concentrator`, `dns_resolver`, `dhcp_server` |
| Cloud | `cloud` | `aws_cloudtrail`, `azure_activity`, `gcp_audit`, `office365`, `entra_id` |

> **UI requirement:** The Use Cases filter panel SHALL expose `log_source_category` as a top-level filter group with `log_source_platform` as a drill-down within each category. Both fields SHALL be indexed for performant filtering.

### 3.2 Log Event Authoring

#### 3.2.1 Log Event Data Model

The canonical log event field definitions - types, constraints, variable schema, and the `source` enum - are specified in [`docs/content/spec/olf-format.md` - Log Event Fields](../../../docs/content/spec/olf-format.md#log-event-fields).

#### 3.2.2 Variable Substitution Engine

The system SHALL support the following variable types at render time:

- **Static** - Fixed values supplied at use-case definition time.
- **User-override** - Values the operator can change at send-time via a pre-flight form.
- **Generated** - Auto-generated values: random IPv4/IPv6, random hostname, current timestamp (ISO 8601 / UNIX epoch), UUIDv4, random integer within a range.
- **Sequence counters** - An incrementing integer for replay of multi-event bursts.

> **Security constraint - template injection:** The variable substitution engine SHALL use Jinja2's `SandboxedEnvironment` (not the default `Environment`). The sandbox MUST restrict access to Python built-ins, module imports, and attribute traversal. User-supplied template content SHALL never be evaluated outside the sandbox. The CI SAST pipeline SHALL include a rule that flags any instantiation of `jinja2.Environment()` without `SandboxedEnvironment` as a build failure.

#### 3.2.3 Built-in Log Format Templates

The editor SHALL provide starter templates for each supported format:

- **CEF** - Standard ArcSight CEF header plus extension fields.
- **LEEF** - IBM LEEF 1.0 and 2.0 header variants.
- **JSON** - Arbitrary key-value JSON object; configurable field mapping per SIEM target.
- **Syslog RFC 3164** - BSD syslog with PRI, TIMESTAMP, HOSTNAME, MSG.
- **Syslog RFC 5424** - IETF syslog with structured data (SD-ELEMENT).
- **Windows Event XML** - EVTX-style XML envelope with System and EventData blocks.
- **Custom** - Free-text template with full variable substitution support.

### 3.3 Log Forger (Transmission Engine)

#### 3.3.1 Transmission Protocols

The forger SHALL support the following transport protocols:

| Protocol | Description | Port Default | TLS Support |
|----------|-------------|--------------|-------------|
| UDP Syslog | RFC 3164 / RFC 5424 over UDP. Max datagram 65,507 bytes. | 514 | No |
| TCP Syslog | RFC 6587 octet-framing or LF-terminated over plain TCP. | 514 | No |
| TCP Syslog TLS | TCP syslog wrapped in TLS 1.2/1.3 with optional client cert. | 6514 | Yes |

#### 3.3.2 SIEM Target Profiles

A SIEM Target is a saved configuration for a destination endpoint. Each profile SHALL contain:

- Name (display label), description.
- Host / IP address, port, protocol (UDP / TCP / TCP-TLS).
- TLS settings: CA certificate, client certificate, client key (PEM), skip-verify flag (for test environments).
- Default log format override (e.g., always LEEF for QRadar targets).
- Rate limit - maximum events per second (default: unlimited).
- Enabled / disabled toggle.

Multiple SIEM targets can be configured. A use case can be sent to one or more selected targets simultaneously.

#### 3.3.3 Send Session

When a user initiates a send session:

- A pre-flight form is displayed showing all user-override variables with their defaults.
- The user selects one or more SIEM targets.
- The user optionally sets a global time offset to shift all event timestamps.
- The forger renders each log event, applies delays, and transmits in sequence.
- A live progress view shows each event as it is sent: sequence number, rendered log string (truncated), timestamp, and send status (OK / Error). This stream is delivered via Server-Sent Events (SSE) on `GET /api/v1/sessions/:id/stream`.
- Because the browser EventSource API does not support custom request headers, the SSE stream SHALL be authenticated via a short-lived one-time stream token: the client calls `POST /sessions/:id/stream-token` (Analyst+) immediately before opening the EventSource connection, receives a token valid for 30 seconds, and appends it as a `?token=` query parameter on the SSE URL. The backend validates this token against the session owner before streaming begins.
- Each SSE event SHALL include a monotonically incrementing `id` field (the log event sequence number). The client SHALL use the SSE `Last-Event-ID` header on reconnect so the server can resume the stream from the last acknowledged event.
- If the SSE connection drops mid-session (network blip, browser tab sleep), the frontend SHALL automatically reconnect with exponential back-off (initial 1 s, max 10 s, up to 3 attempts). On successful reconnect the server replays any events since `Last-Event-ID` from in-memory session state. If all reconnect attempts fail, the UI shows the error state described in Section 8.5.
- The forger session continues running on the backend regardless of whether the SSE client is connected. Session result is always persisted to the database on completion.
- On completion, a session summary is displayed and saved to the audit log.

#### 3.3.4 Replay Controls

The send session SHALL support:

- Pause and resume transmission.
- Cancel - stops remaining events immediately.
- Dry-run mode - renders and displays all events without transmitting (for preview/validation).
- Speed multiplier (0.1x to 100x) applied to all `delay_ms` values.

#### 3.3.5 SIEM Target Connectivity Test

Each SIEM target configuration page SHALL provide a **Test Connectivity** action. The test proceeds as follows:

1. The forger opens a connection to the target host/port using the configured protocol (UDP / TCP / TCP-TLS).
2. For **UDP**: sends a single minimal RFC 5424 syslog test message (`SlingStrike connectivity test`) and considers the test passed if no socket error is raised (UDP is connectionless; delivery cannot be confirmed).
3. For **TCP / TCP-TLS**: completes the TCP handshake (and TLS negotiation if applicable) and sends the same test message over the established connection. The test passes if the connection is accepted and the write succeeds.
4. For **TCP-TLS**: additionally validates the server certificate against the configured CA bundle (or system trust store if none is configured). Certificate validation failures are reported as a distinct error: `TLS certificate verification failed`.
5. The result is displayed inline on the SIEM target configuration page within 5 seconds:
   - **Success** - green indicator: `Connected successfully (protocol, latency ms)`.
   - **Failure** - red indicator with the specific error: `Connection refused`, `Timeout`, `TLS certificate verification failed`, etc.
6. The connectivity test result is **not** written to the audit log (it is a configuration utility, not a send session).

### 3.4 Use Case Library

#### 3.4.1 Bundled Community Use Cases (Out-of-the-Box)

SlingStrike SHALL ship with 12 out-of-the-box **community-tier** use cases covering high-value detection scenarios, pre-loaded at first startup (seeding policy in §3.4.2). Additional community use cases are imported as `.olf` files (§3.5). The bundled set MUST include at minimum:

| Category | Use Case Name | Log Source | Formats | MITRE Techniques |
| -------- | ------------- | ---------- | ------- | ---------------- |
| Authentication | SSH Brute Force (10 failed + 1 success) | OS / Linux | RFC5424, CEF | T1110.001 |
| Authentication | Windows RDP Brute Force | OS / Windows | LEEF, WinEvtXML | T1110.003 |
| Privilege Escalation | Linux sudo Abuse | OS / Linux | RFC3164, CEF | T1548.003 |
| Privilege Escalation | Windows Token Impersonation | OS / Windows | LEEF, WinEvtXML | T1134 |
| Lateral Movement | Pass-the-Hash via SMB | OS / Windows | LEEF, CEF | T1550.002 |
| Lateral Movement | WMI Remote Execution | OS / Windows | WinEvtXML, JSON | T1047 |
| Exfiltration | DNS Exfiltration Beaconing | Network Device / DNS Resolver | RFC5424, JSON | T1048.003 |
| Exfiltration | Large FTP Upload Anomaly | Application / FTP Server | CEF, LEEF | T1048 |
| Command & Control | Cobalt Strike Beacon HTTP Check-in | Security Device / Web Proxy | CEF, JSON | T1071.001 |
| Discovery | Network Port Scan (nmap-style) | Security Device / Firewall | RFC3164, CEF | T1046 |
| Initial Access | Phishing Link Click + Credential Harvest | Security Device / Web Proxy | CEF, JSON | T1566.002 |
| Persistence | Scheduled Task Creation (Windows) | OS / Windows | WinEvtXML, LEEF | T1053.005 |

#### 3.4.2 Seeding and Update Policy

The 12 bundled use cases are shipped as `.olf` files inside the application image (`community-usecases/`, §10.1) and seeded into the library as ordinary **community-tier** use cases on first startup (fresh install), with `created_by` set to the initial admin account and default visibility `public_readonly`. After seeding they behave exactly like any other community use case: fully editable, deletable, cloneable, and exportable.

- Application updates SHALL NOT modify, restore, or re-seed the bundled use cases - user edits and deletions are never overwritten by an upgrade.
- An edited or deleted bundled use case can be recovered at any time by re-importing the corresponding `.olf` file from the application image or from the GitHub community repository, using the standard import conflict handling (§3.5.2: Skip / Overwrite / Import as Copy).

> *Resolved 2026-06-12 (CEO): the former `built_in` tier is removed for simplicity. There are exactly two use case tiers: `community` and `premium`.*

### 3.5 Community Use Case Sharing (GitHub)

#### 3.5.1 Export

Any authenticated user MAY export one or more community use cases. A single use case is exported as a `.olf` file (single YAML 1.2 document - one file = one use case). Multiple use cases are exported as a plain `.zip` archive of individual `.olf` files (no manifest). Full export rules are specified in [`docs/content/spec/olf-format.md` - Export Rules](../../../docs/content/spec/olf-format.md#export-rules). The export SHALL **NEVER** include premium use case content; the UI MUST prevent selecting premium use cases for export.

#### 3.5.2 Import

Any Admin or Analyst MAY import a `.olf` bundle file. On import:

- The system validates `olf_version` and document schema. Full import validation rules are specified in [`docs/content/spec/olf-format.md` - Import Rules](../../../docs/content/spec/olf-format.md#import-rules).
- Conflicts (same UUID already exists) are surfaced with options: Skip, Overwrite, Import as Copy.
- All imported use cases are assigned tier `community`.
- Import source metadata (filename, imported_at, imported_by) is recorded in the audit log.

#### 3.5.3 Community Repository (GitHub-hosted, no in-app integration)

The community use case marketplace is hosted on GitHub (`SlingStrike/community-usecases`) and is accessed entirely **outside the application**. The application SHALL NOT make any connection to GitHub or any other external service for community content (CEO decision 2026-06-12: SlingStrike is air-gap-first, and security teams must never be required to expose credentials or use case content to third-party services from within the application).

- **Browse** - users browse the community catalogue on github.com (or an internal mirror) in their own browser, outside the application.
- **Download and import** - users download `.olf` bundle files from the repository and import them via the standard file-based import (§3.5.2).
- **Contribute** - users export their use cases as `.olf` bundles (§3.5.1) and submit them as a pull request to the community repository using their own GitHub tooling. Community moderation (§14.2) applies unchanged.

No GitHub Personal Access Token is ever configured, stored, or transmitted by the application. This removes the PAT credential storage surface and all application-initiated outbound GitHub traffic.

> **Air-gapped deployments:** because community sharing is file-based by design, behaviour is identical in connected and air-gapped environments - no degraded mode exists.

### 3.6 Premium Use Case Licensing

#### 3.6.1 License Key Activation

Each purchase generates a unique license key through Keygen.sh, paired with a per-customer `.olf-premium` bundle encrypted using a key derived from that license key. A bundle can only be activated with the license key it was generated for. Activation is fully offline - no network call is made. The `.olf-premium` bundle format, manifest schema, cryptographic parameters, and the mandatory activation flow (key canonicalization, fingerprint check, Ed25519 signature verification, HKDF-SHA256 key derivation, AES-256-GCM decryption, key zeroization) are specified in [`docs/content/spec/olf-format.md` - Premium Bundle](../../../docs/content/spec/olf-format.md#premium-bundle-olf-premium). License key issuance, signed license file generation, and bundle delivery are managed through the Keygen.sh and Lemon Squeezy integration (see Risk O1, §15.3).

**License scope - per instance.** Each license key authorises activation on a single SlingStrike instance. Deployments running multiple instances purchase one key per instance. Activating any premium pack license on an instance also unlocks the premium application features (multi-user RBAC, audit log access, LDAP / AD - see §3.7, §3.8) on that instance. Per-instance scope is a contractual term of the license; because activation is fully offline, technical enforcement of instance counts is not possible. This is an accepted residual risk, consistent with the self-hosted DRM posture (Risk T3).

Premium use cases are distributed as encrypted `.olf-premium` bundles. Activation proceeds as follows:

1. The administrator navigates to **Settings > License Keys** and uploads the **activation package** - a ZIP archive delivered as a single download after purchase, containing the Keygen.sh-issued license file (`.lic`) and the encrypted `.olf-premium` bundle. The app unpacks the archive and processes both files automatically.
2. The system verifies the Ed25519 signature on the license file, checks the license key fingerprint against the bundle manifest, derives the decryption key in-memory, and decrypts the use case payloads - all fully offline and in strict order (verify before derive). The embedded Keygen.sh public key is compiled into the backend at build time; its SHA-256 fingerprint is published in `SECURITY.md`. Key rotation requires a new application release. Full technical detail: [`docs/content/spec/olf-format.md` - Activation Flow](../../../docs/content/spec/olf-format.md#activation-flow).
3. Decrypted use case content is loaded into the library as read-only premium use cases and stored in the database in encrypted form (`template_encrypted` column) using the application's `OLF_SECRET_KEY` for at-rest protection.
4. The license key record stores: key fingerprint, activated_at, activated_by, unlocked use case names, and maintenance_expires_at (null if no maintenance purchased). License terms (perpetual access, maintenance model, new pack pricing) are defined in §1.5.

#### 3.6.2 Premium Use Case Restrictions

The system SHALL enforce the following restrictions on premium use cases at all layers (UI, API, and data):

- **Clone is PERMITTED** - any authenticated user holding an active license may clone a premium use case into a community-tier, fully editable copy; the original remains read-only. See §3.1.2 for full clone rules.
- **Edit is PROHIBITED** - the original premium use case is read-only; the template source is never exposed in the UI. Modifications are only possible on a cloned copy.
- **Export is PROHIBITED** - premium use cases MUST NOT appear in any export dialog or API export endpoint. Clones of premium use cases are community tier and MAY be exported.
- **Share / copy link is PROHIBITED.**
- The rendered log string in live sessions MAY be displayed for operational use but MUST NOT be copyable as a template.
- Bulk selection for export MUST skip and warn about any premium use cases included.

> *Cloning is intentionally permitted so paying customers can customise and reuse scenarios - the original premium source remains encrypted, read-only, and unexportable at all times. DRM relies on the combination of cryptographic enforcement and UI/API controls on the original; clones are community-tier and carry no DRM restrictions.*

#### 3.6.3 Premium Purchase Journey

The purchase journey is external to the application itself. The application handles only the final activation step. The full journey is:

1. **Discovery** - User browses the Pricing page at `SlingStrike.com/pricing`. Each premium pack lists its full use case manifest, MITRE ATT&CK mapping, supported formats, and price.
2. **Purchase** - User clicks "Buy Pack". They are directed to the Lemon Squeezy checkout page. Payment is one-time; no account registration is required. Lemon Squeezy acts as merchant of record and handles VAT / sales tax. On successful payment, a Lemon Squeezy webhook triggers Keygen.sh license creation; Keygen.sh issues a signed license file (Ed25519) and triggers generation of the per-customer encrypted bundle (§3.6.1).
3. **Key delivery** - On successful payment, a transactional email is sent containing:
   - A single download link for the **activation package** (a ZIP archive containing the Keygen.sh-issued signed license file and the encrypted `.olf-premium` bundle). The package is unique to this purchase and licenses a single SlingStrike instance (per-instance licensing, §3.6.1).
   - A link to the activation documentation.
4. **Package download** - User downloads the activation package (ZIP) from the provided link. The download link is valid for 30 days and allows up to 5 downloads (to support re-download after reinstall). The package is generated per-customer at purchase time; the `.olf-premium` bundle inside is encrypted with a key derived from the buyer's unique license key and cannot be activated with any other customer's key.
5. **Activation** - Admin navigates to **Settings > License Keys** and uploads the activation package (ZIP). The app unpacks it, extracts the `.lic` and `.olf-premium` files, and completes activation fully offline as described in Section 3.6.1. Both successful and failed activation attempts are written to the audit log (§3.8) regardless of outcome.
6. **Outcome**:
   - **Success** - The premium use cases appear in the library immediately. The License Keys settings page shows the pack name, activation date, and unlocked use case count. An audit log entry is created with action `license_key_activated`, recording key fingerprint, pack name, unlocked use case count, actor, and timestamp.
   - **Failure** - No partial state is saved and no use cases are loaded. An inline error message is shown (see §8.5). An audit log entry is still created with action `license_key_activation_failed`, recording key fingerprint (if parseable), error reason, actor, and timestamp.

> *The application never handles payment data. All financial transactions occur exclusively through the external payment processor.*

### 3.7 User Management & RBAC

> **Premium edition feature:** Multi-user RBAC (Admin, Analyst, and Viewer roles), audit log access (UI, search, export, retention configuration - see §3.8), and LDAP / Active Directory integration require a premium license. Premium application features are unlocked on an instance when at least one premium pack license is active on that instance (§3.6.1). The Community edition supports a single administrator account only.
>
> **Visibility in single-admin (community) deployments:** the `visibility` field (§3.1.1) is always stored on every community use case - default `public_readonly`, including the 12 seeded use cases (§3.4.2) and all imports - but has no enforcement effect while only the single administrator account exists. The UI SHALL hide the visibility selector until a premium license activates multi-user mode. On premium activation, existing use cases keep their stored visibility values, so everything created before the upgrade is `public_readonly`: visible to new team members, editable only by the owner and Admins - no migration step, no surprises. Visibility and RBAC enforcement acceptance tests target multi-user (premium) deployments.

#### 3.7.1 Roles

| Role | Description | Key Permissions |
|------|-------------|-----------------|
| Admin | Full platform control. | All Analyst permissions + manage users, configure SIEM targets, activate license keys, view full audit log, system settings. Bypasses all `visibility` restrictions - can view, edit, and delete any use case regardless of its `visibility` setting. |
| Analyst | Day-to-day use case work and log sending. | Create/edit/delete own community use cases (with configurable `visibility`), run send sessions, import/export community bundles. Can view all `public_readonly` and `public_collaborative` use cases. Cannot view other users' `private` use cases. Can edit/delete `public_collaborative` use cases owned by others. |
| Viewer | Read-only access for oversight / review. | View `public_readonly` and `public_collaborative` use cases and session history; run dry-run sessions only. Cannot view `private` use cases owned by others. Cannot send live logs, cannot import/export. Read-only access is enforced by role even on `public_collaborative` use cases. |

#### 3.7.2 Authentication

- Local username/password authentication is supported by default (bcrypt password hashing, min complexity enforced).
- Account lockout SHALL be enforced after 10 consecutive failed login attempts for a given username; the account is locked for 15 minutes or until an Admin manually unlocks it.
- Optional LDAP/Active Directory integration for enterprise deployments (Premium edition).
- Session management: JWT-based with configurable expiry (default: 8 hours).
- MFA: TOTP (RFC 6238) SHALL be supported as an optional per-user setting. Eight single-use backup codes SHALL be generated on enrollment (bcrypt-hashed; each code is nulled on use and cannot be replayed). Password reset SHALL NOT clear MFA enrollment - a user who resets their password via admin-generated token must still provide a valid TOTP code on next login (MFA secret and backup codes are preserved across password resets).
- Password reset via admin-generated one-time token (no email required, for air-gapped support).
- Emergency admin recovery SHALL be available via a recovery script executed inside the running app container (e.g. `docker exec app python scripts/reset_admin.py`), which generates a one-time reset token printed to stdout. This requires shell access to the Docker host and is intentionally not exposed via the API.

### 3.8 Audit Log

> **Tier behaviour:** Security-significant events are recorded internally in **all tiers** - capture is always on, including in community (single-admin) deployments and for license activation attempts made before any premium license exists. A premium license unlocks the audit log **feature surface**: the Admin UI (§8.1), search/filter, CSV/JSON export, and retention configuration. Community-tier deployments capture events with the default 90-day retention but do not expose them via UI or API; activating a premium license makes previously captured history visible.

The system SHALL record an immutable audit log entry for every security-significant event, including:

- User login / logout / failed login attempts.
- Use case created, updated, deleted, cloned.
- Send session started, completed, cancelled (with target, use case, operator, event count).
- Import / export operations (bundle name, use case count).
- License key activation attempt (successful and failed) and deactivation - recording key fingerprint, pack name, unlocked use case count (on success), and error reason (on failure).
- User account created, modified, deleted.
- SIEM target created, modified, deleted.

Each audit entry SHALL contain: timestamp (UTC), actor user ID, action type, resource type, resource ID, IP address, and result (success/failure).

Audit logs SHALL be exportable as CSV or JSON. Retention is configurable (default: 90 days).

---

## 4. Non-Functional Requirements

### 4.1 Performance

- The forger SHALL sustain a minimum of 50 log events per second on a host with 4 vCPU and 16 GB RAM when using UDP syslog.
- API response time for all read operations SHALL be under 300 ms at p95 with up to 10 concurrent users, **including when one or more forger sessions are actively transmitting**. Forger tasks SHALL NOT block the FastAPI event loop. Implementation MUST use `asyncio.TaskGroup` with non-blocking socket I/O (`asyncio` streams or `loop.sock_sendto`); any blocking socket call MUST be offloaded via `loop.run_in_executor`.
- The use case library SHALL support up to 10,000 use cases without degradation.
- A maximum of `OLF_MAX_SESSIONS` (default: 5) concurrent active forger sessions SHALL be enforced to prevent resource exhaustion. Attempts to start additional sessions SHALL return HTTP 429 with a clear error message.

### 4.2 Security

- All intra-service communication SHALL use TLS 1.2 minimum when deployed with TLS enabled.
- Sensitive configuration values (license key secrets, TLS client keys) SHALL be encrypted at rest using AES-256-GCM.
- The application SHALL be free of OWASP Top 10 vulnerabilities (verified by automated SAST scanning in CI).
- Log template rendering SHALL use Jinja2 `SandboxedEnvironment` to prevent Server-Side Template Injection (SSTI) - see §3.2.2 and §10.2 for the full constraint and SAST enforcement rule.
- Premium bundle decryption keys SHALL never be stored on disk; they SHALL be derived in-memory and zeroized after use. The full derivation algorithm (HKDF-SHA256, RFC 5869), verify-then-derive invariant, constant-time comparison requirement, and C5 SAST enforcement are specified in §3.6.1, §10.2, and [`docs/content/spec/olf-format.md` - Activation Flow](../../../docs/content/spec/olf-format.md#activation-flow).
- ZIP archive processing (applies to `.olf-premium` bundles and batch `.olf` import containers) SHALL enforce: maximum total decompressed size 50 MB; maximum per-entry decompressed size 10 MB; maximum compression ratio 100:1; maximum entry count 1,000. These checks are performed against ZIP metadata before any decompression begins. Path traversal (zip-slip) SHALL be prevented by resolving each entry path against the extraction root and rejecting any path that escapes it; absolute paths and `..` components are rejected unconditionally. Symlinks and non-regular-file entries SHALL be rejected. (CWE-409, CWE-22)
- YAML parsing in all import and activation code paths SHALL use `ruamel.yaml` in YAML 1.2 mode only. The stdlib `yaml` module is prohibited in `app/`. The CI SAST pipeline SHALL enforce this with a Bandit custom rule that fails the build on any import of the stdlib `yaml` module in `app/`, at HIGH severity. (CWE-502)
- Bundle validation order SHALL be enforced as follows: for an activation package (ZIP), unpack to a temporary directory and verify the Keygen.sh Ed25519 signature on the `.lic` file before touching the `.olf-premium` payload; then parse `manifest.json` and verify the SHA-256 checksum of each `.enc` entry against `payload_checksums` before decrypting it; for community `.olf` single-file import, validate `olf_version` immediately after YAML parse before schema validation and before any persistence. An integrity or schema failure at any step aborts the entire import with no partial state written to the database.
- The `.olf` single-file import path, the batch `.olf` ZIP import path, and the `.olf-premium` activation path SHALL share a single hardened archive/parser code path. No secondary, weaker implementation is permitted.
- The HTTP request body size for import and activation endpoints SHALL be capped at 52 MB (50 MB decompressed limit plus 2 MB headroom). Caddy SHALL enforce this at the reverse proxy layer; the FastAPI layer SHALL enforce the same limit as a secondary control.
- The Keygen.sh API integration SHALL use a least-privilege API token scoped to license issuance and signing only. The token SHALL be stored as an environment variable and SHALL NOT be committed to the repository. Webhook payloads from Lemon Squeezy SHALL be verified using the Lemon Squeezy webhook signature before triggering any Keygen.sh action.
- Per-customer activation packages SHALL be deleted by an automated process when the associated download link has expired (30 days) or the download count has been exhausted (5 downloads). Deletion SHALL be logged with bundle_id, reason, and timestamp.
- The application SHALL run as a non-root user inside Docker.
- Container images SHALL be built from a minimal base (e.g., distroless or Alpine) with no unnecessary packages.

### 4.3 Reliability & Availability

- The application SHOULD achieve 99.5% uptime for self-hosted deployments under normal operational load.
- Failed log send attempts (network error) SHALL be retried up to 3 times with exponential back-off and surfaced in the session view.
- The database (SQLite) SHALL be backed up automatically on a configurable schedule.

### 4.4 Usability

- A new user with SIEM background SHALL be able to run their first bundled use case against a configured target within 10 minutes of first login, without reading documentation. The first-run onboarding wizard (Section 8.6) is the mechanism for achieving this.
- All destructive operations (delete, overwrite on import) SHALL require explicit confirmation.
- The **application UI** SHALL be fully functional on Chrome and Firefox (latest two versions). Mobile browser support for the application is explicitly out of scope for v1.0 - the UI is optimised for desktop/laptop screens (minimum 1280 px width).
- The **marketing website** (SlingStrike.com) SHALL be mobile-responsive across all five pages. This is a separate requirement from the application UI and is listed in the website launch checklist (Section 11.5).
- **Dark mode:** The application SHALL ship with a dark theme enabled by default, with a light theme toggle available in Settings. SOC environments operate predominantly in dark-mode displays; dark-first design is a baseline expectation for the target audience.
- **Custom themes** *(planned for a future release)*: A custom theme engine allowing users to define and apply their own colour schemes is planned for a post-v1.0 release. v1.0 ships with dark (default) and light themes only; see §1.4 and §12 for roadmap details.
- **Accessibility:** The application UI SHALL conform to WCAG 2.1 Level AA for all interactive elements. Minimum requirements include: sufficient colour contrast ratios (4.5:1 for normal text, 3:1 for large text), keyboard navigability for all actions, ARIA labels on icon-only buttons, and focus indicators on all interactive elements.

### 4.5 Portability & Deployment

- A single `docker compose up` SHALL bring the full stack online with sane defaults.
- All container images SHALL be publishable to and pullable from a private registry (for air-gapped deployments).
- A bare-metal install script SHALL be provided for Debian 12+ and RHEL/Rocky 9+.
- The default stack SHALL require no external internet access at runtime.
- Configuration SHALL be driven entirely by environment variables and/or a YAML config file with no compiled-in secrets.

### 4.6 Internationalisation

v1.0 target: English only. The codebase SHALL use i18n abstractions (i18next or equivalent) to allow community translations in future releases. Language packages SHALL be maintained as independent plugins hosted on Github repository.

---

## 5. System Architecture

### 5.1 Technology Stack

See [ARCHITECTURE.md - Technology Stack](../../../../ARCHITECTURE.md) for the canonical technology stack.

### 5.2 High-Level Architecture

SlingStrike uses a simple two-tier architecture: a Python FastAPI backend and a pre-built React SPA, glued together by Caddy as the reverse proxy. There is no Node.js runtime anywhere in the stack.

- **Browser (React SPA)** communicates with the Backend API over HTTPS REST. The React layer is intentionally thin - it handles only the Monaco log editor and the live SSE session stream; all other pages are straightforward API consumers.
- **FastAPI Backend** handles all business logic, RBAC enforcement, database access, and session management. It is the primary contributor surface and is written entirely in Python.
- **Forger Engine** runs as an `asyncio.TaskGroup`-managed background task pool inside the FastAPI process. All socket I/O uses non-blocking asyncio primitives (`asyncio` streams or `loop.sock_sendto`) to avoid blocking the event loop. Blocking operations (e.g. DNS resolution) are offloaded via `loop.run_in_executor`. Concurrent session count is capped by `OLF_MAX_SESSIONS` to prevent resource exhaustion. No extra process or service is needed.
- **Caddy** acts as the reverse proxy / TLS terminator. It serves the pre-built React SPA as static files from a shared volume and proxies all `/api/*` requests to FastAPI on port 8000.
- **SQLite** is stored as a named Docker volume mounted into the app container. Alembic manages schema migrations, which run automatically on container startup.

### 5.3 Docker Compose Stack

The default Docker Compose file SHALL define the following services:

| Service | Image | Role |
|---------|-------|------|
| app | SlingStrike/app:latest | Python FastAPI backend + async forger engine. Exposes internal port 8000. Owns the SQLite named volume. |
| web | caddy:2-alpine | Serves pre-built React SPA static files; proxies `/api/*` to `app:8000`. Exposes 80 and 443. |

### 5.4 Data Flow - Send Session

The end-to-end flow for a log send session is as follows:

1. User configures variable overrides and selects SIEM targets in the React UI.
2. UI calls `POST /api/sessions` with the use case ID, target IDs, and variable overrides.
3. FastAPI validates the request, enforces RBAC, and enqueues the session as an asyncio background task.
4. The forger task fetches the use case (with template content) and SIEM target configs from SQLite via SQLAlchemy.
5. For each log event: render Jinja2-style template, apply variable substitution, apply delay.
6. Forger opens a UDP socket or TCP connection (plain or TLS) using Python stdlib and transmits the event.
7. Status updates (event sent / error) are streamed back to the UI via Server-Sent Events (SSE).
8. On completion, a session record is written to the database and the audit log.

---

## 6. Key Data Models

### 6.1 Core Tables

| Table | Key Columns |
|-------|-------------|
| users | id, username, email, password_hash, role (admin\|analyst\|viewer), mfa_secret, is_active, created_at |
| use_cases | id, name, description, tier, license_key_id, source_use_case_id, mitre_tactics[], mitre_techniques[], tags[], olf_version, created_by, created_at, last_edited_at |
| log_events | id, use_case_id, sequence, format, template_encrypted (premium) / template, variables_json, delay_ms, repeat, comment |
| siem_targets | id, name, siem_type, host, port, protocol, tls_ca_cert, tls_client_cert, tls_client_key, default_format, rate_limit_eps, enabled, created_by |
| license_keys | id, key_fingerprint, activated_at, activated_by, bundle_ref, status (active\|revoked) |
| sessions | id, use_case_id, target_ids_json, status, events_sent, events_failed, started_at, completed_at, operator_id, variable_overrides_json |
| audit_log | id, timestamp, actor_id, action, resource_type, resource_id, ip_address, result, detail_json |
| collections | id, name, parent_id, owner_id, created_at |

> **Array column storage strategy:** SQLite has no native array type. All array-typed fields (`mitre_tactics`, `mitre_techniques`, `tags` on `use_cases`; `target_ids` on `sessions`) SHALL be stored as **JSON text columns** (SQLAlchemy `JSON` type, backed by a `TEXT` column in SQLite). SQLAlchemy handles serialisation transparently. Filtering by array membership (e.g. filter by MITRE tactic) SHALL be handled in application-layer Python code.

---

## 7. REST API Overview

All endpoints are prefixed with `/api/v1`. Authentication via Bearer JWT in `Authorization` header.

### 7.1 Core Endpoints

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| POST | /auth/login | Public | Authenticate and receive JWT. |
| POST | /auth/logout | Any | Invalidate current session token. |
| GET | /use-cases | Any | List use cases with filtering and pagination. |
| POST | /use-cases | Analyst+ | Create a new use case. |
| GET | /use-cases/:id | Any | Get full use case detail. For premium use cases the raw template source is omitted for **all** roles, including Admin - the API never returns premium template content (see §3.6.2). |
| PUT | /use-cases/:id | Analyst+ | Update a community use case. |
| DELETE | /use-cases/:id | Analyst+ | Delete a community use case. |
| POST | /use-cases/:id/clone | Analyst+ | Clone a community use case. |
| POST | /use-cases/export | Analyst+ | Export selected community use cases as `.olf` bundle. |
| POST | /use-cases/import | Analyst+ | Import `.olf` bundle. |
| GET | /siem-targets | Any | List SIEM targets. |
| POST | /siem-targets | Admin | Create a SIEM target. |
| PUT | /siem-targets/:id | Admin | Update a SIEM target configuration. |
| DELETE | /siem-targets/:id | Admin | Delete a SIEM target. |
| POST | /siem-targets/:id/test | Admin | Test connectivity to a SIEM target (see §3.3.5). |
| POST | /sessions | Analyst+ | Start a send session. |
| GET | /sessions/:id/stream | Analyst+ | SSE stream of real-time session progress. |
| POST | /sessions/:id/cancel | Analyst+ | Cancel an in-progress session. |
| POST | /sessions/:id/pause | Analyst+ | Pause an in-progress send session. |
| POST | /sessions/:id/resume | Analyst+ | Resume a paused send session. |
| GET | /audit-log | Admin | Paginated audit log with filters. |
| POST | /license-keys | Admin | Activate a license key. |
| POST | /users | Admin | Create a new user. |
| GET | /users | Admin | List all users with filtering and pagination. |
| GET | /users/:id | Admin | Get user detail. |
| PUT | /users/:id | Admin | Update user (role, active status, MFA reset). |
| DELETE | /users/:id | Admin | Deactivate or delete a user account. |

### 7.2 API Rate Limiting

The following rate limits SHALL be enforced per authenticated user (or per IP for unauthenticated endpoints) using an in-process token bucket implemented in FastAPI middleware:

| Endpoint(s) | Limit | Rationale |
| ----------- | ----- | --------- |
| `POST /auth/login` | 10 requests / minute / IP | Brute-force protection. Exceeding the limit returns HTTP 429 for 60 seconds. |
| `POST /sessions` | 5 requests / minute / user | Prevents rapid session spawning that could exhaust forger resources. Enforced in addition to `OLF_MAX_SESSIONS`. |
| `POST /use-cases/import` | 10 requests / minute / user | Large import bundles are CPU/disk intensive; rate limiting prevents accidental or intentional overload. |
| All other authenticated endpoints | 300 requests / minute / user | General API protection. |

All rate-limited responses SHALL include `Retry-After` and `X-RateLimit-*` headers (limit, remaining, reset). Rate limit state is in-process (not Redis-backed) for v1.0 - it resets on container restart. A Redis-backed implementation is deferred to v1.1 for multi-node deployments.

### 7.3 Error Response Format

All error responses SHALL use a consistent JSON envelope:

```json
{
  "error": {
    "code": "MACHINE_READABLE_CODE",
    "message": "Human-readable description of the error.",
    "details": {}
  }
}
```

HTTP status codes follow standard REST conventions (400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 422 Unprocessable Entity, 429 Too Many Requests, 500 Internal Server Error). The `details` object is optional and MAY contain field-level validation errors for 422 responses. Rate-limited responses additionally include `Retry-After` and `X-RateLimit-*` headers per §7.2.

### 7.4 Pagination

All list endpoints (e.g. `GET /use-cases`, `GET /users`, `GET /audit-log`) use cursor-based pagination. Request parameters:

| Parameter | Default | Description                                              |
|-----------|---------|----------------------------------------------------------|
| cursor    | (omit)  | Opaque pagination cursor. Omit to fetch the first page.  |
| limit     | 50      | Page size. Maximum: 200.                                 |

Response envelope includes: `items` (array), `next_cursor` (string or null if no further pages), `total_count` (integer).

---

## 8. UI / UX Requirements

### 8.1 Navigation Structure

The application SHALL use a persistent left sidebar with the following primary sections:

| Nav Item | Description |
|----------|-------------|
| Dashboard | Overview: recent sessions, quick-launch favourite use cases, SIEM target status indicators. |
| Use Cases | Browseable/searchable library with folder tree, filter panel, and card/list view toggle. |
| Log Editor | Sidebar link is a **shortcut to the last open editor context**, not a standalone page. Clicking "Edit" or "Create" on a use case navigates to the full-screen editor route (`/use-cases/:id/edit`). The sidebar item is hidden when no editor session is active. |
| Send Session | Target selector, variable override form, live progress view, and session history. |
| SIEM Targets | Manage target configurations. Test connectivity (ping/send test event). |
| Community Hub | `.olf` bundle import/export controls; documentation pointer to the GitHub community repository (no in-app GitHub connectivity). |
| License Keys | (Admin only) Activate and manage premium license keys. |
| Users | (Admin only) User management, role assignment, MFA status. |
| Audit Log | (Admin only) Searchable, filterable audit event table with CSV/JSON export. |
| Settings | Application config: LDAP, session timeout, backup schedule, theme. |

### 8.2 Use Case Card

Each use case in list or card view SHALL display:

- Name, description excerpt, tier badge (Community / Premium - premium shows a lock icon).
- MITRE ATT&CK tactic pills.
- Tag chips.
- Log format icons (CEF, LEEF, JSON, Syslog, WinEvt, Custom).
- Log block count, last modified date, creator.
- Quick actions: Send, Edit (if permitted), Clone (if permitted), Export (if community).

### 8.3 Log Editor

The Log Editor is a **full-screen route** (`/use-cases/:id/edit`) opened by clicking "Edit" or "Create" on a use case - it is not a standalone top-level page. The browser URL changes, back-navigation returns to the Use Cases list, and the sidebar remains visible but collapses to icon-only to maximise editor canvas space.

The log editor SHALL provide:

- A Monaco Editor instance for each log block template (syntax highlighting for CEF/LEEF/JSON/syslog/XML).
- A variables panel alongside the editor showing parsed `{{variable}}` placeholders with type selectors and default value inputs.
- A live preview pane showing the rendered log string with current variable values.
- Controls to add, reorder (drag-and-drop), duplicate, and remove log blocks.
- Per-log-block delay and repeat controls.
- Format selector (dropdown) that inserts the appropriate starter template.

### 8.4 Send Session View

During an active send session the view SHALL show:

- A progress bar and event counter (n of N sent).
- A scrollable live log stream showing each event as it is dispatched (sequence, timestamp, target, status).
- Pause / Resume / Cancel controls.
- Speed multiplier slider.
- On completion: summary card (total events, duration, errors, target(s) used) with option to re-run.

### 8.5 Error States

All views SHALL handle failure states explicitly. The following table defines the required error presentation for each failure scenario:

| Scenario | Where it appears | Required UI behaviour |
| -------- | ---------------- | --------------------- |
| SIEM target unreachable (connection refused / timeout) | Send Session live stream | Per-event row marked with a red error badge; retry count shown. Session continues with remaining events. On completion, error summary with "Retry failed events" action. |
| All SIEM targets fail for the entire session | Send Session live stream | Session marked Failed; error summary shown. Offer "Retry session" and "View target config" actions. |
| Log template render error (invalid variable reference) | Log Editor preview pane | Inline red highlight on the offending `{{variable}}`; error message below the editor. Save is blocked until resolved. |
| Activation package failure (corrupt, incomplete, or mismatched package) | License Keys - activation flow | Inline error message: "Activation failed. The package may be corrupt or intended for a different instance. Re-download from your purchase email and try again. Contact support if the issue persists." No partial state saved. |
| Import bundle checksum mismatch | Import dialog | Hard error: import aborted. Message: "Bundle integrity check failed. The file may be corrupted or tampered with." |
| Session SSE stream disconnected mid-session | Send Session live stream | Automatic reconnect with exponential back-off (3 attempts). If reconnect succeeds, stream resumes from last known event. If all retries fail: banner "Live stream lost - session may still be running. Refresh to see final status." |
| Unauthenticated or expired JWT on any page | Any page | Redirect to `/login` with `?next=<current-path>` query param so the user returns to their original destination after re-authentication. |

### 8.6 First-Run Onboarding

To satisfy the usability requirement (Section 4.4 - first use case in ≤ 10 minutes without documentation), the application SHALL present a first-run onboarding flow on the first login of the initial admin user.

The flow SHALL consist of three steps presented as a modal wizard:

**Step 1 - Configure a SIEM Target**
The user is prompted to add their first SIEM target (host, port, protocol). A "Skip for now" option is available and defaults to a localhost test target. A "Test Connectivity" button is available inline (see Section 3.3.5).

**Step 2 - Choose a Use Case**
The system displays the 12 bundled community use cases as a card grid. The user selects one. A tooltip explains what the use case simulates.

**Step 3 - Send It**
The pre-flight variable form is shown with sensible defaults pre-filled. A single "Send" button launches the session. The live progress view opens automatically.

On completion of Step 3, the wizard dismisses and a success banner reads: *"Your first test session is complete. Check your SIEM for the alarm."* The onboarding state is persisted per-user; completing or dismissing the wizard does not show it again.

---

## 9. Deployment & Operations

### 9.1 Docker Compose Quickstart

The project SHALL ship a `docker-compose.yml` at the repository root that brings up a fully functional stack with a single `docker compose up` command. A `.env.example` file SHALL be provided with all required variables pre-documented. Default credentials (`admin` / `changeme`) SHALL be printed to stdout on first boot and MUST be changed before any production use. A startup check SHALL enforce this.

### 9.2 Environment Variables

Key configuration SHALL be settable via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| OLF_SECRET_KEY | (required) | AES-256 master key for encrypting secrets at rest. Generate with `openssl rand -hex 32`. |
| OLF_DB_URL | file:data/app.db | SQLite database file path. |
| OLF_PORT | 8000 | Backend API listen port. Must match the internal port Caddy proxies to (`app:8000`). |
| OLF_JWT_EXPIRY | 8h | JWT token expiry (e.g. `4h`, `24h`). |
| OLF_TLS_CERT | (optional) | Path to TLS certificate for Caddy (leave empty for HTTP-only). |
| OLF_AUDIT_RETENTION | 90 | Audit log retention in days. |
| OLF_MAX_EPS | 0 (unlimited) | Global maximum events per second cap across all forger sessions. |

### 9.3 Air-Gapped Deployment

For air-gapped environments, the following SHALL be supported:

- All container images SHALL be exportable as `.tar` archives via `docker save` for offline transfer.
- An offline image manifest and load script SHALL be provided.
- Premium license key activation SHALL work fully offline.
- Community use case import/export is file-based (`.olf` bundles) by design (§3.5.3) and works identically in air-gapped environments - no fallback mode is needed.

### 9.4 Backup & Restore

For SQLite deployments, a scheduled backup script SHALL:

- Create a dated copy of the database file to a configurable backup directory.
- Retain the last N backups (configurable, default: 7).
- Run automatically via the app container's internal scheduler (no external cron required).

A restore command SHALL be documented and SHALL restore the database from a backup file without data loss.

### 9.5 Upgrade Path

Upgrades SHALL follow a simple procedure: pull new images and restart the stack. Database schema migrations SHALL run automatically on startup using Alembic's migration runner (`alembic upgrade head`), executed as part of the `app` container entrypoint before the FastAPI process starts. A backup SHALL be automatically created before each migration run.

---

## 10. Repository & Project Structure

### 10.1 Repository Layout

The canonical repository layout is maintained in [`ARCHITECTURE.md - Repository Layout`](../../../ARCHITECTURE.md#repository-layout).

### 10.2 CI/CD Pipeline

The GitHub Actions CI pipeline SHALL include the following jobs on every pull request and main branch push:

- **lint-backend** - ruff check + ruff format --check for the Python backend.
- **typecheck-backend** - mypy static type checking across the backend package.
- **test-unit** - pytest unit tests for the forger engine, format renderers, crypto/DRM logic, and RBAC.
- **test-integration** - pytest integration tests against a real SQLite instance (in-memory), covering all API endpoints.
- **coverage** - pytest-cov coverage report. The pipeline SHALL fail if backend line coverage falls below **80%**. Coverage is reported as a PR check and tracked over time. The following are excluded from the coverage requirement: migration scripts, `main.py` entrypoint, and generated OpenAPI schema code.
- **sast** - Bandit SAST scan on Python code; safety check for known vulnerable dependencies. The pipeline SHALL additionally fail if any `jinja2.Environment()` instantiation is found outside `SandboxedEnvironment` (custom Bandit plugin).
- **secrets-scan** - gitleaks scan on every commit to detect accidentally committed credentials, API keys, or private key material before they reach the remote.
- **lint-frontend** - ESLint + Prettier check for the React frontend.
- **build-frontend** - Vite production build to verify no TypeScript/build errors.
- **build-docker** - Docker multi-arch image build (linux/amd64 + linux/arm64).
- **publish** - Push images to GHCR (`ghcr.io/SlingStrike/app`) on version tag (`vX.Y.Z`).

---

## 11. Website & Marketing (SlingStrike.com)

The full website PRD - including page structure, copy direction, target audiences, tone of voice, SEO keywords, and launch checklist - is maintained as a standalone document in the SlingStrike.com repository: [`WEBSITE_PRD.md`](../../../SlingStrike.com/WEBSITE_PRD.md).

**Scope summary:** five pages (Home, Features, Pricing, For Managers, Community & Docs), targeting two audiences (security practitioners and budget owners / managers). The marketing website SHALL be mobile-responsive across all five pages. This is distinct from the application UI, which targets desktop only (see §4.4).

---

## 12. Release Roadmap

The authoritative release roadmap for all roles is maintained in ../../shared/MILESTONES.md

---

## 13. Success Metrics

Success for v1.0 GA is defined across three dimensions: adoption, community health, and commercial viability. All metrics are measured 90 days post-GA unless stated otherwise.

### 13.1 Adoption Metrics

| Metric | Target (90 days post-GA) | Measurement Source |
| ------ | ------------------------ | ------------------ |
| GitHub repository stars | ≥ 500 | GitHub Insights |
| Docker image pulls (GHCR) | ≥ 1,000 | GHCR pull stats |
| Documentation site unique visitors | ≥ 2,000 / month | Plausible Analytics |
| Website unique visitors | ≥ 5,000 / month | Plausible Analytics |

### 13.2 Community Health Metrics

| Metric | Target (90 days post-GA) | Measurement Source |
| ------ | ------------------------ | ------------------ |
| Community use cases in the official repo | ≥ 25 (including 12 shipped at GA) | GitHub repo |
| External contributors (non-core-team PRs merged) | ≥ 10 unique contributors | GitHub Insights |
| Open Issues response time (first response) | ≤ 48 hours median | GitHub Issues |
| Open bug count (P1/P2) | 0 P1, ≤ 3 P2 at any time | GitHub Issues |

### 13.3 Commercial Metrics

| Metric | Target (90 days post-GA) | Measurement Source |
| ------ | ------------------------ | ------------------ |
| Premium pack sales (Forge Pack: Initial Access & Execution) | ≥ 20 licenses | Payment / license system |
| Website pricing page conversion rate | ≥ 2% of visitors click "Buy" | Plausible Analytics |
| Support requests related to premium activation | ≤ 10% of buyers | Support channel |

### 13.4 Product Quality Metrics

| Metric | Target | Measurement Source |
| ------ | ------ | ------------------ |
| Time-to-first-use-case (new user, no docs) | ≤ 10 minutes | Usability testing (≥ 5 participants pre-GA) |
| Forger throughput | ≥ 50 EPS on 4 vCPU / 16 GB RAM | Automated benchmark in CI |
| API p95 response time (read ops, 10 concurrent users) | ≤ 300 ms | Load test in CI |
| Test suite coverage | ≥ 80% line coverage (backend) | pytest-cov in CI |
| Zero known OWASP Top 10 vulnerabilities at GA | 0 findings | Bandit + manual security audit |

---

## 14. Project Governance

### 14.1 Overview

SlingStrike is developed and governed by a focused team of four senior roles covering the full project lifecycle: product leadership, architecture, development, and security. Senior Project Lead holds final authority on all decisions and also acts as Product Owner. All participants - role holders and external contributors alike - are expected to follow the project Code of Conduct (published in the repository root).

All four core roles are listed in `MAINTAINERS.md` in the repository root. `MAINTAINERS.md` is owned by the Senior Project Lead; all updates require Senior Project Lead approval.

Where roles are consolidated at inception, the consolidation is recorded in `MAINTAINERS.md`. When roles separate, the separation must be recorded in `MAINTAINERS.md` with a date. At that point architecture ownership, RFC authorship, and technical standards authority transfer to the Senior Project Architect. Merge rights, CI/CD ownership, and release execution remain with the Senior Core Developer.

---

### 14.2 Project Roles

Role specifications - responsibilities, technical standards, and acceptance criteria for each role - are maintained in the role skill files under `.claude/skills/`. Current role holders are listed in `MAINTAINERS.md`.

| Role | Skill Specification |
| ---- | ------------------- |
| Senior Project Lead | `.claude/skills/senior-project-lead/` |
| Senior Project Architect | `.claude/skills/senior-project-architect/` |
| Senior Core Developer | `.claude/skills/senior-core-developer/` |
| Senior Security Officer | `.claude/skills/senior-security-officer/` |
| Contributor | `.claude/skills/contributor/` |

---

### 14.3 Decision-Making Process

| Decision Type | Process | Authority |
| ------------- | ------- | --------- |
| Bug fix / small improvement | PR review - 1 Senior Core Developer approval | Senior Core Developer |
| New feature (in-roadmap) | PR review - 1 Senior Core Developer approval | Senior Core Developer |
| New feature (off-roadmap) | GitHub Discussion proposal -> Senior Project Architect review -> Senior Project Lead decision | Senior Project Lead |
| Architecture change | Written RFC by Senior Project Architect -> 5-day open comment period -> Senior Project Lead approval | Senior Project Lead + Senior Project Architect |
| Breaking change (API or data model) | RFC + milestone tracking + changelog entry -> Senior Project Architect approval -> Senior Project Lead sign-off | Senior Project Lead |
| Roadmap change | Senior Project Lead decision, communicated via GitHub Discussion | Senior Project Lead |
| New role appointment | Senior Project Lead decision | Senior Project Lead |
| Premium pack release | Senior Core Developer authorship -> Senior Project Lead sign-off -> Keygen.sh license issuance | Senior Project Lead |
| Security patch (critical) | Expedited: private patch development -> Senior Security Officer approves -> Senior Core Developer implements and releases | Senior Security Officer + Senior Core Developer |
| Tiebreaker / escalation | Senior Project Lead deciding vote | Senior Project Lead |

---

### 14.4 Release Authority

Only the Senior Core Developer may execute a release. A release requires:

1. All CI jobs passing on the release commit (lint, type check, tests, SAST, Docker build).
2. A `CHANGELOG.md` entry describing changes, breaking changes, and migration notes.
3. A database backup automatically created before any migration (see Section 9.5).
4. Senior Project Lead sign-off before the tag is pushed.
5. Signed git tag (`vX.Y.Z`) pushed by the Senior Core Developer.
6. Docker images published to GHCR (`ghcr.io/SlingStrike/app`) with the version tag.

Pre-release builds (alpha, beta, RC) follow the same process with the appropriate pre-release version suffix.

---

### 14.5 Meeting Minutes

| Responsibility | Owner |
| --- | --- |
| Meeting minutes authorship | Senior Project Lead |
| Meeting minutes repository commit | Senior Core Developer |
| Meeting minutes location | `project/meetings/` |

---

### 14.6 License Signing Key (Keygen.sh Ed25519)

Keygen.sh manages the Ed25519 key pair used to sign license files issued at purchase time. The application verifies the Ed25519 signature on the Keygen.sh-issued license file offline during activation, using the Keygen.sh Ed25519 public key embedded in the application at build time.

License signing is **automated** within Keygen.sh - per-customer license files are signed at license creation time with no manual signing step. The private signing key is held and managed by Keygen.sh; key custody, backup, and rotation are Keygen.sh's operational responsibility.

| Item | Detail |
| --- | --- |
| Key holder | Keygen.sh (managed service) |
| Storage | Managed by Keygen.sh |
| Backup | Managed by Keygen.sh |
| Escrow | N/A - managed service |
| Signing authority | Automated via Keygen.sh API at license creation time |
| Service dependency review | Senior Security Officer, before v0.7 Beta ships |

**Key rotation:** If the Keygen.sh signing key is rotated (Keygen.sh platform event or account compromise), a new application release is issued with the updated embedded Keygen.sh public key and the new SHA-256 fingerprint is published in `SECURITY.md`. Key rotation is always a release event.

> The SHA-256 fingerprint of the current Keygen.sh Ed25519 public key is published in `SECURITY.md`. Any discrepancy between this section and `SECURITY.md` must be escalated to the Senior Security Officer immediately.

---

### 14.7 Succession Process

> Status: PENDING - required before v1.0 GA (hard gate)

The succession process must be defined and documented in this section before the v1.0 GA release gate. It must cover:

- Who inherits the Keygen.sh account credentials and API tokens
- Who assumes Product Owner responsibilities
- What the decision-making process is during a transition period

> This section is intentionally incomplete at project inception. The Senior Project Lead must complete it before v1.0 GA sign-off is given.

---

### 14.8 Community Code of Conduct

The project adopts the [Contributor Covenant v2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/) as its Code of Conduct. Enforcement is handled by the Senior Project Lead. Reports should be sent to the contact address published in `CODE_OF_CONDUCT.md`.

---

### 14.9 Governance References

| Document | Location | Owner |
| --- | --- | --- |
| Security policy and Keygen.sh Ed25519 fingerprint | `SECURITY.md` | Senior Security Officer |
| Code of Conduct | `CODE_OF_CONDUCT.md` | Senior Project Lead |
| CLA and CLA FAQ | Repository root (pending) | Senior Project Lead |
| Architecture decisions (ADRs) | `docs/architecture/` (pending) | Senior Project Architect |
| .olf format specification | `docs/content/spec/olf-format.md` (pending - due v0.1 Alpha) | Senior Project Architect |
| Meeting minutes | `project/meetings/` | Senior Project Lead |
| RFC archive | GitHub Discussions | Senior Project Architect |

---

## 15. Risk Register

Risks are rated by **Likelihood** (L) and **Impact** (I) on a 1-3 scale. **Exposure = L × I** (1-2 Low, 3-4 Medium, 6-9 High).

### 15.1 Technical Risks

| # | Risk | L | I | Exposure | Mitigation |
| - | ---- | - | - | -------- | ---------- |
| T1 | Forger asyncio task starves FastAPI event loop under high EPS load, degrading API response times | 2 | 3 | **6 High** | Run forger in a dedicated `asyncio.TaskGroup` with a configurable concurrency cap; benchmark in CI against the 50 EPS + 300 ms API latency requirements simultaneously (Section 13.4). Add `OLF_MAX_EPS` global cap (Section 9.2). |
| T2 | Jinja2 SSTI vulnerability via user-crafted log templates | 2 | 3 | **6 High** | Use Jinja2 `SandboxedEnvironment`; restrict available filters and globals; add SAST rule to CI to detect unsafe `Environment()` instantiation (Section 3.2.2). |
| T3 | Premium DRM bypass via key extraction from running process memory | 1 | 3 | **3 Medium** | Defence-in-depth: in-memory key derivation (HKDF-SHA256), no persistence to disk, read-only premium templates, UI/API enforcement. Accepted residual risk for a self-hosted tool. |
| T4 | SQLite write contention under concurrent send sessions | 2 | 2 | **4 Medium** | Limit concurrent active sessions per instance (configurable `OLF_MAX_SESSIONS`, default: 5). SQLite with WAL mode is the permanent database for this workload profile (read-heavy, low concurrent writes). |
| T5 | Alembic migration failure on startup corrupts production database | 1 | 3 | **3 Medium** | Auto-backup before every migration run (Section 9.5). Provide documented rollback procedure. Test all migrations against both fresh installs and upgrades in CI. |
| T6 | TLS certificate misconfiguration exposes API over plain HTTP in production | 2 | 2 | **4 Medium** | Caddy enforces HTTPS-redirect by default when a cert is configured. Document the `OLF_TLS_CERT` requirement prominently in the quickstart and add a startup warning if the app is served over plain HTTP with non-localhost binding. |
| T7 | SSRF via SIEM target connectivity test - an Analyst can configure a target pointing to internal network addresses and use Test Connectivity as a port scanner against internal services | 2 | 2 | **4 Medium** | Validate the SIEM target host field against a blocklist of private IP ranges (RFC 1918, loopback, link-local) before opening any outbound connection. Expose an admin-configurable allowlist for deployments that legitimately target internal hosts. SIEM target connections are the application's only outbound connections - there is no GitHub integration and no telemetry (§3.5.3). |

### 15.2 Business & Adoption Risks

| # | Risk | L | I | Exposure | Mitigation |
| - | ---- | - | - | -------- | ---------- |
| B1 | Low community adoption - tool is not discovered by target audience | 2 | 3 | **6 High** | SEO-optimised website at launch (Section 11.4); direct outreach to SIEM/SOC communities (Reddit r/netsec, LinkedIn, BSides/DEF CON); submit to awesome-siem and similar curated lists. |
| B2 | Competing open-source tool launches similar functionality before v1.0 GA | 1 | 2 | **2 Low** | Accelerate v0.3-v0.5 milestones; publish early alpha to GitHub to establish presence; focus on differentiators (GitHub community marketplace, premium pack model, air-gap support). |
| B3 | Premium pack revenue insufficient to fund ongoing maintenance | 2 | 2 | **4 Medium** | Annual maintenance fees (§1.5) provide a predictable recurring revenue stream that scales with the installed base and is directly tied to customers who find the product valuable. Professional Services (custom SIEM connectors, proprietary log formats, bespoke features - see §1.5) is the high-value tier. The low perpetual license price lowers the barrier to first purchase; maintenance renewal rate is a direct health signal for the product. |
| B4 | CLA dual-licensing terms discourage community contributions | 2 | 2 | **4 Medium** | Publish a plain-language CLA FAQ explaining the rationale. Contributors retain copyright; the CLA only grants distribution rights. Monitor contribution volume post-launch and revisit terms if needed. |

### 15.3 Operational Risks

| # | Risk | L | I | Exposure | Mitigation |
| - | ---- | - | - | -------- | ---------- |
| O1 | Senior Project Lead is a single point of failure for releases and signing keys | 2 | 3 | **6 High** | Resolved 2026-06-18 (supersedes 2026-06-12): License signing is managed by Keygen.sh - per-customer license files are Ed25519-signed at license creation time with no manual step. Key custody and backup are Keygen.sh's operational responsibility. Key compromise or Keygen.sh account loss requires: rotate key in Keygen.sh, issue new application release with updated embedded public key, publish new fingerprint in SECURITY.md. See §14.6. Define succession process (including Keygen.sh account handover) in §14.7 before v1.0 GA. |
| O5 | Compromise of the Keygen.sh account or API credentials exposes the license issuance pipeline - an attacker could issue fraudulent license files or revoke existing ones | 1 | 3 | **3 Medium** | Resolved 2026-06-18 (supersedes O5 PHP hosting risk): PHP license service removed; signing delegated to Keygen.sh managed service. Mitigations: Keygen.sh account secured with MFA; API tokens scoped to minimum required permissions (issue and sign only); bundle generation pipeline uses a separate restricted token; Lemon Squeezy webhook payloads verified by signature before triggering any Keygen.sh action. Keygen.sh availability risk for new purchases is accepted - existing activated licenses and bundles function fully offline; only new purchase completions are affected during a Keygen.sh outage. Key rotation procedure (O1) is the recovery path for signing key compromise. |
| O2 | Community repository receives malicious use case submissions (e.g., templates designed to exfiltrate data from target SIEMs) | 1 | 3 | **3 Medium** | Senior Core Developer reviews all submissions (Section 14.2). Acceptance criteria explicitly prohibit external resource references. SAST scan on template content in CI. |
| O3 | Security vulnerability disclosed publicly before a patch is available | 1 | 3 | **3 Medium** | 90-day coordinated disclosure policy; private GitHub Security Advisory workflow; Senior Security Officer designated before v0.8 RC (Section 14.2). |
| O4 | In-process rate limit state resets on container restart, creating a short brute-force window immediately after a crash or rolling upgrade | 2 | 1 | **2 Low** | Document the limitation in §7.2. Partially mitigated by account lockout after 10 failed attempts (§3.7.2). Full fix deferred to v1.1 Redis-backed rate limiting. |

---

## 16. Appendix

### A. .olf / .olf-premium Format

The canonical format specifications for both the community `.olf` file and the encrypted `.olf-premium` bundle are maintained in [`docs/content/spec/olf-format.md`](../../../docs/content/spec/olf-format.md). That document is the single source of truth for all field definitions, export/import rules, encryption parameters, and the premium bundle archive layout.

### B. MITRE ATT&CK Taxonomy

The system SHALL ship with a bundled offline copy of the MITRE ATT&CK Enterprise matrix (JSON format, auto-updated on build). Tactics and techniques SHALL be selectable from this bundled taxonomy without internet access.

### C. Supported Syslog RFC 5424 Structured Data

The RFC 5424 template engine SHALL support custom SD-ELEMENT definitions with arbitrary SD-PARAM key-value pairs, enabling use cases to populate QRadar/Elastic structured parsing fields directly within the SDSECTION of each event.

### D. Contributor Licence Agreement

All community use case contributions via pull request to the official GitHub repository SHALL require acceptance of a lightweight CLA (Contributor License Agreement) granting the project maintainers the right to dual-license community content under CC-BY-4.0 (free) and commercial licenses (premium packs).

---

End of Document

SlingStrike PRD v1.0
