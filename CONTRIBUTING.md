# Contributing to LokaFlow™

Thank you for your interest in contributing to LokaFlow™!

LokaFlow™ is developed by LearnHubPlay BV (Netherlands) and licensed under
the Business Source License 1.1. Please read this document carefully before
submitting contributions.

---

## Who Can Contribute

Anyone. No commercial license is required to contribute. Contributors may
be using LokaFlow under the free tier or a commercial license — either way,
contributions are welcome and appreciated.

---

## Contributor License Agreement (CLA)

**By submitting a pull request to this repository, you agree to the following:**

1. You grant **LearnHubPlay BV** a perpetual, worldwide, non-exclusive,
   royalty-free, irrevocable license to use, reproduce, modify, distribute,
   sublicense, and commercially exploit your contribution under any license,
   including commercial licenses.

2. You retain copyright ownership of your own contribution.

3. You confirm that you have the legal right to grant the above license
   (i.e., the work is original, or you have permission from any co-authors
   or your employer).

4. You understand that LokaFlow™ is a commercially licensed product and your
   contributions may be included in commercial releases.

> A formal CLA page will be available at [lokaflow.com/cla](https://lokaflow.com/cla)
> before the first public release. Individual and corporate CLAs will be provided.

**Exception for content contributions:** Pull requests adding or improving
prompt templates in `packages/content/packs/` (LokaLearn and other education
packs) do not require a CLA. These are community-maintained content files
licensed under CC0 (public domain).

---

## How to Contribute

### Reporting Bugs

- Check existing issues before opening a new one
- Include steps to reproduce, expected behaviour, and actual behaviour
- Include your OS, hardware (CPU/GPU/RAM), and model versions
- Specify which package is affected (`@lokaflow/core`, `@lokaflow/agent`, etc.)

### Suggesting Features

- Open a GitHub Discussion or Issue with the `feature-request` label
- Explain the use case — what problem does this solve?
- Check the roadmap in [VISION.md](./VISION.md) before duplicating planned work
- Features that improve accessibility or reduce cost for free-tier users
  are prioritised

### Submitting Code

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Write clear, focused commits
4. Follow existing code style (TypeScript strict, ESLint 9, Prettier)
5. Add or update tests where applicable (80% coverage threshold on router)
6. Open a pull request with a clear description of the change

### Pull Request Requirements

- PRs must reference an open issue (or explain why one doesn't exist)
- Keep PRs focused — one feature or fix per PR
- All tests must pass (`pnpm test`)
- Typecheck must pass (`pnpm typecheck`)
- No breaking changes without prior discussion
- No new dependencies that require GPL/AGPL licenses (see THIRD_PARTY_LICENSES.md)

### What We Prioritise

We merge changes that:

- Improve routing intelligence, accuracy, or cost efficiency
- Add support for new local or cloud model providers
- Improve privacy, security, or cost transparency for users
- Fix bugs with clear reproduction steps
- Add prompt templates to LokaLearn or other education packs
- Improve accessibility for low-resource hardware or offline use
- Improve documentation, especially for non-English speakers

We do not merge:

- Changes that introduce cloud dependencies for core routing logic
- Features that send additional user data to external services by default
- PRs without tests for new routing behaviour
- Features that restrict or monetise the free tier
- Code that degrades performance on older or lower-spec hardware

---

## Development Setup

```bash
# Prerequisites
node --version   # 22+
pnpm --version   # 9+
ollama --version # any recent

# Install
git clone https://github.com/lokaflow/lokaflow.git
cd lokaflow
pnpm install
pnpm build

# Test (no Ollama needed for unit tests)
pnpm test

# Live integration tests (requires running Ollama)
pnpm test:integration

# Typecheck
pnpm typecheck

# Lint
pnpm lint
```

### Recommended local models for development

```bash
ollama pull qwen2.5:7b           # core routing + general tasks
ollama pull qwen2.5-coder:7b     # code-related tests
ollama pull nomic-embed-text     # memory/RAG tests
```

---

## Code of Conduct

We are committed to a welcoming, respectful community that reflects
LokaFlow's mission: AI for everyone, regardless of background or resources.

- Be kind and constructive in all interactions
- No harassment, discrimination, or personal attacks
- Disagreements about code are fine — critique the idea, not the person
- Contributions from developers of all experience levels are valued
- Accessibility and low-resource hardware support are first-class concerns

Violations may result in removal from the project.

---

## Security Vulnerabilities

**Do not open a public issue for security vulnerabilities.**

Report security issues privately to: [security@learnhubplay.nl](mailto:security@learnhubplay.nl)

We will acknowledge within 48 hours and aim to release a fix within 14 days
of confirmation. See [SECURITY.md](./SECURITY.md) for full policy.

---

## Questions

General questions: open a GitHub Discussion

Commercial licensing: [info@learnhubplay.nl](mailto:info@learnhubplay.nl)

Partnerships (telcos, NGOs, educational institutions):
[partnerships@lokaflow.io](mailto:partnerships@lokaflow.io)

---

_© 2026 LearnHubPlay BV · LokaFlow™ is a trademark of LearnHubPlay BV_
_AI for everyone. Waste for no one._
