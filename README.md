# LokaFlow™

**Intelligent Hybrid LLM Orchestration — Local-First AI Routing**

> Plan with Claude. Execute with Llama. Save a fortune.

LokaFlow™ is an open platform that intelligently routes AI tasks between
local LLMs (Ollama / Llama / Mistral) and cloud LLMs (Claude, GPT-4) based
on task complexity, token cost, and data sensitivity.

**Save 60–87% on cloud LLM costs. Keep sensitive data local.**

---

## Why LokaFlow?

| Without LokaFlow | With LokaFlow |
|-----------------|---------------|
| $110/mo for multiple AI subscriptions | $3–10/mo in cloud API credits |
| Rate limits on every platform | Unlimited local execution |
| Sensitive data sent to cloud | PII stays on your machine |
| Manual model switching | Automatic intelligent routing |
| 1× query capacity | 10× more queries possible |

---

## How It Works

LokaFlow uses a **three-tier routing architecture**:

```
User Task
    │
    ▼
[Router] ── complexity + token count + PII scan
    │
    ├── Simple / bulk / private ──► Local LLM (Ollama / Llama 3.3 70B)
    │                                   €0/query · unlimited · private
    │
    ├── Reasoning / structured ──► Specialist Model (Mistral / DeepSeek)
    │                                   €0/query · local or lightweight
    │
    └── Complex / creative / final ──► Cloud LLM (Claude / GPT-4)
                                         Pay only when needed
```

**Plan with the best model. Execute in bulk with local models.**

---

## Key Features

- **Intelligent Routing** — classifies tasks by complexity, cost, and privacy requirements
- **Local-First** — runs on Apple Silicon, NVIDIA GPU, or CPU (lighter models)
- **Cloud Fallback** — seamlessly escalates to Claude / GPT-4 only when needed
- **Privacy Guard** — PII scanning prevents sensitive data from leaving your machine
- **Task Graph Orchestration** — JSON-based plan-then-execute pipeline
- **Batch Processing** — run 50–100 document tasks overnight at near-zero cost
- **IDE Plugin** — local code completion via CodeLlama / DeepSeek-Coder
- **Web Search** — free Brave Search API or self-hosted SearXNG integration

---

## Individual Value

Running LokaFlow on your own hardware replaces $135–175/month of paid
AI subscriptions with $3–10/month of targeted cloud API usage:

| Capability | Monthly Cost | Equivalent Paid Value |
|------------|-------------|----------------------|
| Unlimited bulk queries (local Llama) | €0 | $40–60/mo |
| Deep reasoning (routed to Claude) | €2–5/mo | $20/mo |
| Code completion (local CodeLlama) | €0 | $10/mo |
| Document analysis pipelines | €1–3/mo | $20/mo |
| Web search + AI synthesis | €0 | $20/mo |
| **Total** | **€3–10/mo** | **$110–130/mo** |

---

## Status

> **MVP — core pipeline working. Building in public.**

### Packages

| Package | Name | Status |
|---|---|---|
| `@lokaflow/core` | Router, providers (11), PII scanner, classifier, budget, search, memory | ✅ Working |
| `@lokaflow/cli` | `lokaflow chat`, `lokaflow cost`, `--supporters` | ✅ Working |
| `@lokaflow/api` | REST API + OpenAI-compatible proxy on `:4141` | ✅ Working |
| `@lokaflow/route` | Intelligent LLM proxy router + savings tracker | ✅ Working |
| `@lokaflow/agent` | 8-stage DAG orchestration pipeline (decompose → execute → assemble) | ✅ Working |
| `@lokaflow/orchestrator` | Task DAG decomposition + complexity measurement + budget allocation | ✅ Working |
| `@lokaflow/mesh` | mDNS cluster discovery, WoL, battery-aware scheduling, carbon tracking | ✅ Working |
| `@lokaflow/audit` | ChatGPT / Claude GDPR export subscription analyser | ✅ Working |
| `@lokaflow/commons` | Cooperative compute P2P exchange, credits ledger | ✅ Working |
| `@lokaflow/swap` | Token exchange + group purchasing marketplace | ✅ Working |
| `lokaflow-vscode` | VS Code extension (local-first AI routing) | 🔧 Scaffold |
| `apps/web` | Web UI dashboard + chat interface | 🔧 In progress |
| `apps/mobile` | LokaMobile — React Native + llama.cpp | 🔧 Scaffold |
| `@lokaflow/lokallm` | Fine-tuned Phi-3 Mini (Python, complexity scorer + decomposer) | 🔧 In progress |

### Test Coverage

115 passing unit tests across 9 packages (no network required), plus live integration tests auto-skipped when Ollama is absent.

Follow development: [lokaflow.com](https://lokaflow.com) · [@lokaflow](https://github.com/lokaflow)

---

## Getting Started

```bash
# Prerequisites: Node.js 22+, pnpm 9+, Ollama
git clone https://github.com/lokaflow/lokaflow.git
cd lokaflow
pnpm install
pnpm build

# Pull a local model
ollama pull qwen2.5-coder:7b

# Copy and edit config
cp config/lokaflow.example.yaml lokaflow.yaml

# Run
npx tsx packages/cli/src/index.ts chat
```

Set cloud API keys when needed:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export GEMINI_API_KEY=AIza...
export OPENAI_API_KEY=sk-...
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for full system design and configuration reference.

Join the waitlist at [lokaflow.com](https://lokaflow.com) to be notified.

---

## License

LokaFlow™ is licensed under the **Business Source License 1.1 (BUSL-1.1)**.

- **Free** for individuals, students, hobbyists, and open-source projects
- **Commercial license required** for organizations with revenue or 3+ employees

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

---

*© 2026 LearnHubPlay BV (KvK: 97741825) · Netherlands*
*LokaFlow™ is a trademark of LearnHubPlay BV*
*Licensed under BUSL 1.1 · Free for individuals*
*Commercial licensing: [info@learnhubplay.nl](mailto:info@learnhubplay.nl)*
