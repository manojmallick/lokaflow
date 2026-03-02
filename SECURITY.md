# Security Policy — LokaFlow™

**Maintained by LearnHubPlay BV · Netherlands**

---

## Supported Versions

LokaFlow™ is currently in pre-release. Security fixes are applied to the
latest development version only.

| Version | Supported |
|---------|-----------|
| `main` (pre-release) | Yes |
| Older snapshots | No |

---

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Report privately using **GitHub's private vulnerability reporting**:
> [github.com/manojmallick/lokaflow/security/advisories/new](https://github.com/manojmallick/lokaflow/security/advisories/new)

Or by email: [security@learnhubplay.nl](mailto:security@learnhubplay.nl)

### What to include in your report

1. **Title** — brief description of the issue
2. **Severity** — Critical / High / Medium / Low (with your rationale)
3. **Affected component** — specify the package:
   `@lokaflow/core`, `@lokaflow/agent`, `@lokaflow/guard`, `@lokaflow/enterprise`,
   `@lokaflow/mesh`, `@lokaflow/api`, `apps/web`, `apps/mobile`, `docker/`, etc.
4. **Technical reproduction** — step-by-step, against the latest `main`
5. **Demonstrated impact** — what an attacker can actually achieve
6. **Environment** — OS, hardware, model versions, LokaFlow version
7. **Remediation advice** — your suggested fix if you have one

Reports without reproduction steps may be deprioritised.

### Response timeline

| Stage | Target |
|-------|--------|
| Acknowledgement | Within 48 hours |
| Triage & severity assessment | Within 5 business days |
| Fix or mitigation | Within 14 days for Critical/High |
| Public disclosure | After fix is released |

---

## Trust Model

### Core App (Individual / Free Tier)

LokaFlow™ is a **local-first, single-user tool**. The threat model assumes:

- The machine running LokaFlow is within your trusted OS boundary
- Local model inference (Ollama) runs entirely on your hardware
- Cloud API calls are made only when the router explicitly decides to escalate
- No data is sent to cloud providers beyond what the router forwards
- API keys are stored in your local `.env` file and never transmitted externally

### LokaGuard™ (Business / Enterprise)

When LokaGuard is enabled:

- All query metadata is logged to a local SQLite table (never remote)
- Log entries contain query hashes, routing decisions, and compliance flags
- No query content is stored — only metadata (tokens, model, timestamp, PII types)
- PDF reports are generated locally and never sent to external services
- Audit log is append-only; deletion requires explicit admin action

### LokaEnterprise (Corporate Deployment)

In Docker / on-premise deployments:

- All data remains within the organisation's network perimeter
- Air-gapped mode (`docker-compose.air-gap.yml`) blocks all outbound HTTP
- SSO tokens are validated against the organisation's identity provider
- LearnHubPlay BV has no access to any on-premise deployment
- Licence key validation is the only outbound call (can be disabled for
  fully air-gapped environments with an offline licence file)

---

## PII & Data Privacy

LokaFlow includes a PII scanner that prevents sensitive data from being
sent to cloud LLMs. Detected types include:

- IBAN numbers (EU bank accounts)
- BSN numbers (Dutch citizen service numbers, Elfproef validated)
- Email addresses
- Phone numbers
- Credit card numbers (Luhn algorithm validated)
- IP addresses
- Named entities (via `compromise` NLP library)

This is a best-effort control. Users should review routing decisions for
highly sensitive workloads. For maximum assurance, enable `local-only` mode
in `lokaflow.yaml` to prevent all cloud escalation.

LokaGuard extends PII scanning with custom organisational rules and
data residency enforcement (EU-only routing).

---

## Local Model Security

LokaFlow does not bundle model weights. Models are downloaded by the user
via Ollama or equivalent. Users are responsible for verifying model
provenance and integrity. Recommended models (qwen2.5, mistral, llama3)
are from established open-source providers.

---

## API Key Security

Cloud API keys (Anthropic, OpenAI, Gemini, Groq, etc.) are stored in
your local `.env` file or environment variables. LokaFlow never:
- Stores keys in any database
- Transmits keys to external services
- Logs keys in output or routing logs

The `maskKey()` utility in `src/utils/security.ts` ensures keys are
redacted in any diagnostic output.

---

## Docker / Enterprise Deployment Security

For on-premise deployments:

- All containers run as non-root users
- Secrets are passed via environment variables, not baked into images
- The Nginx reverse proxy handles TLS termination
- Postgres passwords are randomly generated per deployment
- No default credentials exist — setup requires explicit configuration
- The air-gapped compose file includes `--network none` for Ollama and API
  containers when cloud providers are disabled

---

## Out of Scope

The following are **not** considered vulnerabilities for LokaFlow:

- Prompt injection attacks that don't bypass routing policy or access controls
- Attacks requiring physical access to the user's machine
- Vulnerabilities in third-party models (Llama, Mistral, Claude, etc.) — report upstream
- Attacks requiring write access to `~/.lokaflow` or the Docker host
- Rate limiting or DoS on local inference (no network boundary)
- Scanner-only claims without demonstrated exploitable impact
- Vulnerabilities in Ollama itself — report to the Ollama project

---

## Security Scanning

CI/CD includes automated secret detection before every merge to `main`.
If you discover a committed secret or credential, report it privately above.

---

## Bug Bounties

LokaFlow™ has no bug bounty programme at this time.
Responsible disclosure is appreciated — the best contribution is a patch.

---

*LearnHubPlay BV · KvK: 97741825 · Netherlands*
*LokaFlow™ — [lokaflow.com](https://lokaflow.com)*
*security@learnhubplay.nl*
