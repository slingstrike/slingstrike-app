# Security Policy

## Supported Versions

Only the latest released version receives security fixes. Older versions are not patched.

| Version | Supported |
| --- | --- |
| Latest stable release | Yes |
| Older releases | No - upgrade to latest |

> Until v1.0 GA: all pre-release versions (alpha, beta, RC) are unsupported for security fixes except the current development branch. Report vulnerabilities against the current `main` branch.

---

## Reporting a Vulnerability

**Do not report security vulnerabilities via public GitHub Issues, Discussions, or pull requests.**

Submit all security reports privately via **GitHub Security Advisories:**

1. Go to the repository on GitHub
2. Click **Security** tab
3. Click **Report a vulnerability**
4. Fill in the report form with as much detail as possible

We will acknowledge your report within **48 hours** of submission.

### What to include in your report

- A clear description of the vulnerability
- Steps to reproduce (proof of concept if available)
- The component affected (backend API, forger engine, template renderer, DRM/crypto, auth, Docker configuration)
- Your assessment of the impact
- Any suggested mitigations

---

## Coordinated Disclosure Policy

| Severity | CVSS v3.1 Base Score | Target patch timeline | Disclosure timing |
| --- | --- | --- | --- |
| Critical | >= 9.0 | As soon as possible - expedited track | Published immediately once patch is available |
| High | 7.0 - 8.9 | Within 30 days | Published when patch is released |
| Medium | 4.0 - 6.9 | Within 90 days | Published when patch is released |
| Low | < 4.0 | Next regular release cycle | Published with release notes |

**Standard timeline:** We publish a GitHub Security Advisory with full CVE details no later than **90 days** after the report is received, regardless of patch status.

**Critical vulnerabilities (CVSS >= 9.0):** We publish as soon as the patch is available. We do not wait for the 90-day window. Public communication for critical vulnerabilities is coordinated by the Senior Project Lead.

**Coordinated early disclosure:** If you request earlier disclosure after a patch is available, we will work with you to agree on a disclosure date.

---

## Security Contact

| Role | GitHub Handle | Responsibility |
| --- | --- | --- |
| Senior Security Officer | @sso | Primary security contact, CVSS triage, disclosure coordination |
| Senior Project Lead | @mike-stuffel | Critical vulnerability public communications |

---

## License Verification Key (Keygen.sh Ed25519)

openLogForge uses an Ed25519 key managed by Keygen.sh to sign license files issued at purchase time. The application verifies the Ed25519 signature on the Keygen.sh-issued license file offline during activation, using the Keygen.sh public key embedded in the application at build time.

**Key custody:** Signing is **automated** within Keygen.sh. Per-customer license files are signed at license creation time with no manual signing step. Private key custody is managed by Keygen.sh.

**Keygen.sh Ed25519 public key SHA-256 fingerprint:**

```text
PLACEHOLDER - will be updated before v0.7 Beta, when the Keygen.sh account and signing key are provisioned (dev-signed keys are used for v0.6 app-side DRM testing).
```

> Any Keygen.sh license file whose signature does not verify against this fingerprint will be rejected by the application.

**Key rotation:** If the Keygen.sh signing key is rotated (Keygen.sh platform event or account compromise), a new application release is issued with the updated embedded public key and the new fingerprint is published here. Key rotation is always a release event. Report any suspected key compromise immediately via the vulnerability reporting process above.

---

## Scope

The following are in scope for security reports:

- Backend API (`app/`) - authentication, RBAC, input validation, injection
- Forger engine (`app/forger/`) - SSRF via SIEM target configuration
- Template rendering (`app/forger/`) - Jinja2 SSTI
- Cryptographic and DRM components - license key validation, bundle decryption, secrets at rest
- Authentication and session management - JWT handling, bcrypt, account lockout
- Docker configuration - container privilege escalation, image vulnerabilities
- Dependency vulnerabilities in `requirements.txt` or `package.json`

The following are **out of scope:**

- Vulnerabilities in your own SIEM platform or network infrastructure
- Social engineering attacks
- Physical security attacks
- Denial of service via resource exhaustion (report as a standard GitHub Issue instead)
- Vulnerabilities in third-party services used by the project (report directly to the vendor)
