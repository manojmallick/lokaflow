# LokaFlow™

**Intelligent Hybrid LLM Orchestration — Local-First AI Routing**

> Plan with Claude. Execute with Llama. Save a fortune.

LokaFlow™ is an open platform that intelligently routes AI tasks between
local LLMs (Ollama / Llama / Mistral / Qwen) and cloud LLMs (Claude, GPT-4,
Gemini) based on task complexity, token cost, and data sensitivity.

**Save 60–87% on cloud LLM costs. Keep sensitive data local. Works for everyone.**

---

## Why LokaFlow?

| Without LokaFlow                      | With LokaFlow                  |
| ------------------------------------- | ------------------------------ |
| $110/mo for multiple AI subscriptions | $0–10/mo in cloud API credits  |
| Rate limits on every platform         | Unlimited local execution      |
| Sensitive data sent to cloud          | PII stays on your machine      |
| Manual model switching                | Automatic intelligent routing  |
| 1× query capacity                     | 10× more queries possible      |
| Only for people who can afford it     | Free for every person on earth |

---

## How It Works

LokaFlow uses a **three-tier routing architecture**:

```
User Task
    │
    ▼
[Router] ── complexity + token count + PII scan + budget check
    │
    ├── Simple / bulk / private ──► Local LLM (Ollama)
    │                                   €0/query · unlimited · private
    │                                   qwen2.5:7b · qwen2.5-coder:7b
    │
    ├── Reasoning / structured ──► Specialist Model (Mistral / DeepSeek)
    │                                   €0/query · local or lightweight cloud
    │
    └── Complex / creative / final ──► Cloud LLM (Claude / GPT-4 / Gemini)
                                         Pay only when local can't do the job
```

**74% of queries run locally. Cloud is the exception, not the rule.**

---

## Key Features

- **Intelligent Routing** — classifies tasks by complexity, cost, and privacy
- **Local-First** — runs on Apple Silicon, NVIDIA GPU, or CPU
- **Cloud Fallback** — escalates to Claude / GPT-4 / Gemini only when needed
- **Privacy Guard** — PII scanning (IBAN, BSN, email, passport) blocks sensitive data
- **LokaAgent™** — 8-stage orchestration pipeline (decompose → plan → execute → assemble)
- **LokaMesh™** — distributed compute across your devices (mDNS discovery, WoL, battery-aware)
- **LokaAudit™** — analyse your current AI subscriptions and find overpay
- **LokaGuard™** — compliance module: DORA, SOX, GDPR audit trail + PDF reports _(Business+)_
- **Batch Processing** — run large document pipelines overnight at near-zero cost
- **Web Search** — Brave Search API or self-hosted SearXNG integration
- **Memory + RAG** — SQLite-based conversation memory with TF-IDF retrieval

---

## Who LokaFlow Is For

### Every person — €0 forever

A student in Nairobi with a laptop gets the same full product as an engineer
in Amsterdam. Local AI does not cost us anything to serve you. The product
is free because the value comes from your own hardware.

### Every school, NGO, open-source project — €0 forever

Any size. Any country. Education and social good are never behind a paywall.
LokaLearn prompt pack included.

### Every startup under 100 people — €0 until you grow

Build your product on LokaFlow. When you cross 100 employees AND €1M
revenue, you are profitable enough to give back.

### Companies that can afford it — fair pricing

The threshold is simple: **100+ employees AND €1M+ annual revenue**.
If either condition is missing, you are still free. Both must be true to pay.

---

## Pricing

| Tier               | Who                               | Price                                 |
| ------------------ | --------------------------------- | ------------------------------------- |
| **Individual**     | Every person on earth             | **€0 forever**                        |
| **NGO / School**   | Education, charities, any size    | **€0 forever**                        |
| **Startup**        | < 100 employees OR < €1M revenue  | **€0**                                |
| **Small Business** | 100–499 employees AND > €1M ARR   | **€49/month**                         |
| **Business**       | 500–2,000 employees AND > €1M ARR | **€199/month** _(includes LokaGuard)_ |
| **Enterprise**     | 2,000+ employees AND > €1M ARR    | **€999+/month**                       |

> **The rule in one sentence:** If you cannot afford it, you do not pay.
> We measure that by revenue — not headcount alone.

Full pricing details: [lokaflow.com/pricing](https://lokaflow.com/pricing)

---

## Individual Value

Running LokaFlow on your own hardware replaces $135–175/month of paid
AI subscriptions with $0–10/month of targeted cloud API usage:

| Capability                                 | Monthly Cost | Equivalent Paid Value |
| ------------------------------------------ | ------------ | --------------------- |
| Unlimited local queries (Ollama + qwen2.5) | €0           | $40–60/mo             |
| Deep reasoning (routed to Claude / Gemini) | €2–5/mo      | $20/mo                |
| Code completion (local qwen2.5-coder)      | €0           | $10/mo                |
| Document analysis pipelines                | €1–3/mo      | $20/mo                |
| Web search + AI synthesis                  | €0           | $20/mo                |
| **Total**                                  | **€0–10/mo** | **$110–130/mo**       |

Free cloud API keys (Gemini, Groq, xAI) provide 7.3 million tokens/day —
more than any individual will ever use. Most users pay €0 for cloud too.

---

## Product Family

All products are modules or deployment modes of ONE codebase — not separate apps.

| Product               | What it is                                 | Who it's for             |
| --------------------- | ------------------------------------------ | ------------------------ |
| 🌊 **LokaFlow**       | Core infrastructure, routing, dashboard    | Everyone (free)          |
| 🤖 **LokaAgent™**     | 8-stage AI orchestration pipeline          | Everyone (free)          |
| 🛡️ **LokaGuard™**     | DORA/SOX/GDPR compliance module            | Business + Enterprise    |
| 🏢 **LokaEnterprise** | On-premise Docker deployment + admin panel | Enterprise               |
| 🎓 **LokaLearn**      | Education prompt pack (30+ templates)      | Students, schools (free) |
| 🌍 **LokaAccess**     | Global access initiative — mobile 2028     | Partnership programme    |

---

## Status

> **MVP — core pipeline working. Building in public.**

### Packages

| Package                  | Name                                                                    | Status         |
| ------------------------ | ----------------------------------------------------------------------- | -------------- |
| `@lokaflow/core`         | Router, providers (11), PII scanner, classifier, budget, search, memory | ✅ Working     |
| `@lokaflow/cli`          | `lokaflow chat`, `lokaflow cost`, `--supporters`                        | ✅ Working     |
| `@lokaflow/api`          | REST API + OpenAI-compatible proxy on `:4141`                           | ✅ Working     |
| `@lokaflow/route`        | Intelligent LLM proxy router + savings tracker                          | ✅ Working     |
| `@lokaflow/agent`        | 8-stage DAG orchestration (decompose → execute → assemble)              | ✅ Working     |
| `@lokaflow/orchestrator` | Task DAG decomposition + complexity measurement                         | ✅ Working     |
| `@lokaflow/mesh`         | mDNS cluster discovery, WoL, battery-aware scheduling                   | ✅ Working     |
| `@lokaflow/audit`        | ChatGPT / Claude GDPR export subscription analyser                      | ✅ Working     |
| `@lokaflow/commons`      | Cooperative compute P2P exchange, credits ledger                        | ✅ Working     |
| `@lokaflow/swap`         | Token exchange + group purchasing marketplace                           | ✅ Working     |
| `@lokaflow/guard`        | LokaGuard compliance module (DORA/SOX/GDPR)                             | 🔧 In progress |
| `@lokaflow/enterprise`   | Admin panel, SSO, on-premise config                                     | 🔧 Planned     |
| `@lokaflow/content`      | Prompt packs including LokaLearn                                        | 🔧 Planned     |
| `lokaflow-vscode`        | VS Code extension                                                       | 🔧 Scaffold    |
| `apps/web`               | Web UI dashboard + chat interface                                       | 🔧 In progress |
| `apps/mobile`            | LokaMobile — React Native + llama.cpp (2028)                            | 🔧 Scaffold    |
| `@lokaflow/lokallm`      | Fine-tuned Phi-3 Mini complexity scorer                                 | 🔧 In progress |

### Test Coverage

115 passing unit tests across 9 packages (no network required).
Live integration tests auto-skipped when Ollama is absent.

Follow development: [lokaflow.com](https://lokaflow.com) · [@lokaflow](https://github.com/lokaflow)

---

## Getting Started

```bash
# Prerequisites: Node.js 22+, pnpm 9+, Ollama
git clone https://github.com/lokaflow/lokaflow.git
cd lokaflow
pnpm install
pnpm build

# Pull the recommended local models
ollama pull qwen2.5:7b          # best all-round
ollama pull qwen2.5-coder:7b    # coding tasks
ollama pull nomic-embed-text    # embeddings

# Copy and configure
cp config/lokaflow.example.yaml lokaflow.yaml

# Start
npx tsx packages/cli/src/index.ts chat
```

**Cloud API keys are optional.** LokaFlow works fully offline with Ollama.
When you want cloud fallback, set whichever keys you have:

```bash
# All free tiers — register your own keys (5 minutes each):
export GEMINI_API_KEY=...       # aistudio.google.com/apikey — 2.7M tokens/day free
export GROQ_API_KEY=...         # console.groq.com — 1.5M tokens/day free
export XAI_API_KEY=...          # console.x.ai — $25/month free credit

# Paid providers (use when free quotas exhausted):
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for full system design and config reference.
Join the waitlist at [lokaflow.com](https://lokaflow.com).

---

## Enterprise Deployment

```bash
# On-premise Docker deployment
git clone https://github.com/lokaflow/lokaflow.git
cd lokaflow/docker
cp .env.enterprise.example .env
# Edit .env with your licence key and config
docker compose up -d
```

Air-gapped deployment (zero external network):

```bash
docker compose -f docker-compose.air-gap.yml up -d
```

Enterprise licensing: [info@learnhubplay.nl](mailto:info@learnhubplay.nl)

---

## License

LokaFlow™ is licensed under the **Business Source License 1.1 (BUSL-1.1)**.

- **Free** for individuals, students, NGOs, schools, and any organisation
  with fewer than 100 employees OR less than €1M annual revenue
- **Commercial license required** for organisations with 100+ employees
  AND €1M+ annual revenue

Converts to **Apache 2.0** on January 1, 2030.

See [LICENSE](./LICENSE) for full terms.
Commercial licensing: [info@learnhubplay.nl](mailto:info@learnhubplay.nl)

---

## Contributing

We welcome contributions. Please read [CONTRIBUTING.md](./CONTRIBUTING.md)
before submitting a pull request.

---

## Legal

- Copyright: [COPYRIGHT.md](./COPYRIGHT.md)
- License: [LICENSE](./LICENSE)
- Contributing: [CONTRIBUTING.md](./CONTRIBUTING.md)
- Security: [SECURITY.md](./SECURITY.md)
- Vision: [VISION.md](./VISION.md)

---

_© 2026 LearnHubPlay BV (KvK: 97741825) · Netherlands_
_LokaFlow™ is a trademark of LearnHubPlay BV_
_Licensed under BUSL 1.1 · Free for individuals and organisations under 100 employees_
_Commercial licensing: [info@learnhubplay.nl](mailto:info@learnhubplay.nl)_
