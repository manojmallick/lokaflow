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
3. **Affected component** — router, local model adapter, cloud adapter, CLI, API, etc.
4. **Technical reproduction** — step-by-step, against the latest `main`
5. **Demonstrated impact** — what an attacker can actually do
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

LokaFlow™ is a **local-first, single-user tool**. The threat model assumes:

- The machine running LokaFlow is within your trusted OS boundary
- Local model inference (Ollama) runs entirely on your hardware
- Cloud API calls (Claude, GPT-4) are made only when the router decides to escalate
- No data is sent to cloud providers beyond what the router explicitly forwards

### PII & Data Privacy

LokaFlow includes a PII scanner that prevents sensitive data from being
sent to cloud LLMs. This is a best-effort control — users should review
routing decisions for highly sensitive workloads.

### Local model security

LokaFlow does not bundle model weights. Models are downloaded by the user
via Ollama or equivalent. Users are responsible for verifying model
provenance and integrity.

### Cloud API key security

API keys for Claude, OpenAI, and other cloud providers are stored in
your local `.env` file. LokaFlow never transmits these keys externally.
Keys are used only to authenticate outbound API requests.

---

## Out of Scope

The following are **not** considered vulnerabilities for LokaFlow:

- Prompt injection attacks that don't bypass routing policy or access controls
- Attacks requiring physical access to the user's machine
- Vulnerabilities in third-party models (Llama, Mistral, Claude, etc.) — report these upstream
- Attacks requiring the attacker to already have write access to `~/.lokaflow`
- Rate limiting or DoS on local inference (no network boundary exists)
- Scanner-only claims without demonstrated impact

---

## Security Scanning

This project will use automated secret detection in CI/CD before first release.
If you discover a committed secret or credential, report it privately above.

---

## Bug Bounties

LokaFlow™ has no bug bounty programme at this time.
Responsible disclosure is appreciated — the best contribution is a pull request.

---

*LearnHubPlay BV · KvK: 97741825 · Netherlands*
*LokaFlow™ — [lokaflow.com](https://lokaflow.com)*
