# LokaFlow™ — Full System Architecture

> **Version:** v1 core ✅ + v2 monorepo (in progress)  
> **Owner:** LearnHubPlay BV · License: BUSL 1.1  
> **Last updated:** 2026-03-01

---

## 1. Ecosystem Overview

LokaFlow is a family of 10 products sharing a single principle:
**measure AI usage precisely, route it intelligently, make every token count.**

```
LokaFlow™ Ecosystem
│
├── MEASURE
│   └── LokaAudit™      "The number your AI provider doesn't want you to see."
│                        Parse Claude/ChatGPT/Gemini exports → show utilisation %
│
├── ROUTE
│   ├── LokaFlow Core™  "Right model. Right price. Every time."        ← current repo
│   │                    CLI + REST API + OpenAI-compatible proxy
│   └── LokaOrchestrator™ "Complex tasks. Minimum premium."
│                          Task DAG decomposition → parallel subtask execution
│
├── DECIDE
│   └── LokaLLM™        "The model that manages all the models."
│                        Fine-tuned Phi-3 Mini — scores complexity, decomposes tasks
│
├── DISTRIBUTE
│   ├── LokaMesh™       "Your devices. One intelligence."
│   │                    mDNS cluster discovery, WoL, node scheduling
│   └── LokaMobile™     "Private AI. In your pocket."
│                        Battery-aware local AI on iOS/Android (React Native + llama.cpp)
│
└── COOPERATE
    ├── LokaCommons™    "Your idle compute. Someone's breakthrough."
    │                    Community compute cooperative
    └── LokaSwap™       "Collective bargaining for the AI generation."
                         Token exchange + group purchasing layer
```

---

## 2. Current Architecture (v1.x MVP — Implemented ✅)

### 2.1 Routing Pipeline

```
User Query
    │
    ├─ Step 0: Memory Recall ─────── memory.enabled? → prepend relevant context
    │                                 MemoryManager.recall() → TF-IDF similarity
    │
    ├─ Step 1: PII Scan ──────────── PIIScanner (email, IBAN, BSN/Elfproef,
    │                                 phone, CC/Luhn, IP, names via NLP)
    │                                 PII detected? → force LOCAL
    │
    ├─ Step 2: Token Estimate ─────── > 8,000 tokens? → force LOCAL
    │
    ├─ Step 2b: Search Augment ────── search.enabled? → QueryExpander
    │                                 → ParallelRetriever (Brave + arXiv)
    │                                 → LocalFilter → prepend web context
    │
    ├─ Step 3: Complexity Score ──── TaskClassifier: 0.0–1.0
    │    6 signals (weighted):
    │    ├── tokenCountScore        15%  (normalised log of token count)
    │    ├── questionComplexity     25%  (reasoning keywords: why, compare, analyse)
    │    ├── technicalDensity       20%  (code blocks, stack traces, file paths)
    │    ├── reasoningKeywords      20%  (because, therefore, justify, trade-off)
    │    ├── cotIndicators          10%  (chain-of-thought markers)
    │    └── lengthBonus            10%  (sentence count signal)
    │
    │    score < 0.35  → LOCAL  (Ollama, round-robin across cluster nodes)
    │    score 0.35–0.65 → SPECIALIST → DELEGATED
    │    score > 0.65  → CLOUD  (fallback to specialist if no cloud API key)
    │
    ├─ Step 4: Budget Check ─────── BudgetTracker (SQLite ~/.lokaflow/costs.db)
    │    Daily + monthly EUR cap · warns at 80% · hard stop at limit
    │    exceeded? → downgrade to LOCAL
    │
    └─ Step 5: Execute + Log ─────── provider.stream() / provider.complete()
                                     DashboardTracker (metadata-only, no content)
                                     → lokaflow-routing.log (rotates at 10MB)
```

### 2.2 Provider Tiers

```
LOCAL tier                   SPECIALIST tier              CLOUD tier
──────────────────────────   ────────────────────────     ─────────────────────────────
OllamaProvider               GeminiProvider               ClaudeProvider  (Anthropic)
  baseUrl: localhost:11434     (GEMINI_API_KEY)            OpenAIProvider  (OpenAI)
  baseUrl: 192.168.x.x         or OllamaProvider          GeminiProvider  (fallback)
  round-robin, score-based                                 GroqProvider    (fast)
  cost: €0                    cost: €0.00069/1K           MistralProvider
                                                           TogetherProvider
                              ┌──── Delegation ────┐      CohereProvider
                              │ Specialist generates│      PerplexityProvider
                              │ JSON subtask plan   │      AzureProvider
                              │ Local workers exec  │
                              │ in parallel         │      Priority auto-discovery:
                              │ maxDepth = 2        │      ANTHROPIC → OPENAI → GEMINI
                              └────────────────────┘       → GROQ → MISTRAL → ...
```

### 2.3 Memory / RAG Pipeline (opt-in)

```
startup
  └── ProfileStore.load() ── SQLite ~/.lokaflow/profiles.db
        └── customInstructions → prepend as system message

per-turn
  ├── MemoryManager.recall()
  │     └── TfidfVectorizer.fit(all entries)
  │           → vectorize query
  │           → MemoryStore.similar() (cosine similarity)
  │           → prepend top-K as system message
  │
  └── MemoryManager.remember()
        └── MemoryStore.add() ── SQLite ~/.lokaflow/memory.db
              role: "user" | "assistant"
              content, vector (lazy — computed on next retrieval)
```

### 2.4 Deep Search Pipeline (opt-in)

```
query
  └── QueryExpander.expand()
        └── localProvider.complete() → JSON { queries: [3 sub-queries] }
              ↓ fallback on error: [original query]

      ParallelRetriever.retrieve()
        ├── BraveSource  (BRAVE_API_KEY, 2000/month free)
        └── ArxivSource  (no key, activates on research keywords)
            → URL dedup → SearchResult[]

      LocalFilter.filter()
        └── localProvider.complete() → { scores: [{ index, score }] }
            → sort desc → slice top-N
```

### 2.5 File Layout (current — monorepo)

```
lokaflow/                          ← pnpm monorepo root
│
├── packages/
│   │
│   ├── core/                      @lokaflow/core ✅
│   │   └── src/
│   │       ├── types.ts            Message, LLMResponse, RoutingDecision, LokaFlowConfig
│   │       ├── exceptions.ts       Typed error hierarchy (6 error classes)
│   │       ├── config.ts           Zod YAML loader (snake_case→camelCase)
│   │       ├── router/
│   │       │   ├── router.ts       5-step pipeline + delegation (maxDepth=2)
│   │       │   ├── classifier.ts   6-signal complexity scorer (0.0–1.0)
│   │       │   ├── piiScanner.ts   Regex + compromise NLP (email, IBAN, BSN, CC, IP)
│   │       │   └── budget.ts       SQLite daily/monthly EUR caps
│   │       ├── providers/          11 providers — all extend BaseProvider
│   │       │   ├── local.ts        OllamaProvider (round-robin, multi-node)
│   │       │   ├── claude.ts, openai.ts, gemini.ts, groq.ts
│   │       │   ├── mistral.ts, together.ts, perplexity.ts
│   │       │   └── azure.ts, cohere.ts
│   │       ├── search/             Deep search pipeline (opt-in)
│   │       │   ├── engine.ts       SearchEngine orchestrator
│   │       │   ├── expander.ts     QueryExpander (local model → 3 sub-queries)
│   │       │   ├── retriever.ts    ParallelRetriever (Brave + arXiv)
│   │       │   ├── filter.ts       LocalFilter (score 0–10, drop below threshold)
│   │       │   └── sources/        brave.ts, arxiv.ts
│   │       ├── memory/             Memory + RAG pipeline (opt-in)
│   │       │   ├── store.ts        MemoryStore (SQLite + cosine similarity)
│   │       │   ├── profile.ts      ProfileStore (customInstructions, topics)
│   │       │   └── rag.ts          TfidfVectorizer, RagRetriever, MemoryManager
│   │       ├── dashboard/          Cost tracker + report formatter
│   │       └── utils/security.ts   maskKey(), envVar(), requireEnvVar()
│   │
│   ├── cli/                       @lokaflow/cli ✅
│   │   └── src/
│   │       ├── index.ts            lokaflow CLI (commander)
│   │       ├── chat.ts             Interactive chat + streaming + memory
│   │       ├── cost.ts             Cost report command
│   │       └── supporters.ts       GitHub Sponsors (24h cache)
│   │
│   ├── api/                       @lokaflow/api ✅
│   │   └── src/                   Fastify REST server + OpenAI-compatible proxy
│   │
│   ├── route/                     @lokaflow/route ✅
│   │   └── src/
│   │       ├── proxy/server.ts     Intelligent LLM proxy router
│   │       └── tracker/            Savings tracker
│   │
│   ├── agent/                     @lokaflow/agent ✅
│   │   └── src/
│   │       ├── dag/                cycle-detector, topological-sort
│   │       ├── decomposer/         decomposition-gate, interim + lokallm decomposers
│   │       ├── pipeline/           assembler, complexity-scorer, context-packer,
│   │       │                       execution-engine, model-matcher, prompt-guard,
│   │       │                       quality-gate, task-splitter
│   │       ├── registry/           model-registry, interim-models, warm-tracker
│   │       └── utils/              ollama health helpers, token counting
│   │
│   ├── orchestrator/              @lokaflow/orchestrator ✅
│   │   └── src/
│   │       ├── complexity/         ComplexityMeasurer (6 dimension scorers)
│   │       ├── decomposer/         TaskDecomposer, TaskGraph DAG
│   │       ├── pipeline/           Plan→Execute→Verify→Assemble stages
│   │       ├── models/             ModelCapabilityRegistry
│   │       └── budget/             TokenBudgetAllocator
│   │
│   ├── mesh/                      @lokaflow/mesh ✅
│   │   └── src/
│   │       ├── discovery/          MdnsDiscovery, NodeRegistry
│   │       ├── scheduler/          MeshScheduler (score-based node selection)
│   │       ├── executor/           RemoteExecutor, health checks
│   │       ├── power/              WolSender, SleepStateMachine
│   │       ├── battery/            ClusterBatteryStore, ChargeGuardian, ThermalGuard,
│   │       │                       BatteryWorkloadBalancer, HealthTracker, BatteryReport
│   │       └── green/              carbon.ts (electricity maps)
│   │
│   ├── audit/                     @lokaflow/audit ✅
│   │   └── src/
│   │       ├── parsers/            ChatGPTParser, ClaudeParser
│   │       └── engine/             AuditEngine (subscription cost analyser)
│   │
│   ├── commons/                   @lokaflow/commons ✅
│   │   └── src/
│   │       ├── credits/            Credits ledger
│   │       ├── routing/            CooperativeRouter
│   │       └── registry/           Node registry
│   │
│   ├── swap/                      @lokaflow/swap ✅
│   │   └── src/
│   │       ├── exchange/           listing, settlement
│   │       ├── pools/              token pools
│   │       ├── purchasing/         DemandAggregator
│   │       └── conversion/         token converter
│   │
│   ├── vscode/                    lokaflow-vscode 🔧 scaffold
│   │   └── src/extension.ts
│   │
│   └── lokallm/                   Python package 🔧 in progress
│       └── src/                   Fine-tuned Phi-3 Mini (complexity + decompose)
│
├── apps/
│   ├── web/                       React + Vite dashboard 🔧 in progress
│   └── mobile/                    React Native + llama.cpp 🔧 scaffold
│
├── tests/                         Root integration + fixture tests
│   ├── unit/                      classifier, piiScanner, budget, router,
│   │                              search (17 mocked), memory (27 in-mem SQLite)
│   ├── integration/               requires live Ollama (auto-skipped)
│   └── fixtures/                  sampleQueries.json, piiSamples.txt
│
├── impl/                          Design docs (read-only references)
└── lokaflow.yaml                  Active config (git-ignored)
    config/lokaflow.example.yaml   Reference with all defaults
```

---

## 3. V2 Target Architecture

### 3.1 Monorepo Layout (V2)

```
lokaflow/
├── packages/
│   ├── core/                ← current src/ → moved here as @lokaflow/core
│   │   └── (router, providers, types, search, memory)
│   │
│   ├── api/                 ← @lokaflow/api — REST + OpenAI-compatible proxy ← NEXT
│   │   ├── src/
│   │   │   ├── server.ts         Fastify server on :4141
│   │   │   ├── routes/
│   │   │   │   ├── chat.ts       POST /v1/chat/completions (OpenAI-compat)
│   │   │   │   ├── route.ts      POST /v1/route (routing decision + explain)
│   │   │   │   ├── cost.ts       GET  /v1/cost
│   │   │   │   └── health.ts     GET  /v1/health
│   │   │   └── middleware/
│   │   │       ├── auth.ts       API key auth (optional, local-by-default)
│   │   │       └── cors.ts       CORS for web UI
│   │
│   ├── mesh/                ← @lokaflow/mesh / "lokamesh" npm
│   │   ├── src/
│   │   │   ├── discovery/        MdnsDiscovery, NodeRegistry
│   │   │   ├── scheduler/        MeshScheduler, PriorityTaskQueue
│   │   │   ├── executor/         RemoteExecutor, NodeHttpClient
│   │   │   ├── power/            WolSender, SleepStateMachine, PowerMonitor
│   │   │   └── green/            ElectricityMapsClient, GreenReport
│   │
│   ├── orchestrator/        ← @lokaflow/orchestrator
│   │   ├── src/
│   │   │   ├── complexity/       ComplexityMeasurer, 6 dimension scorers
│   │   │   ├── decomposer/       TaskDecomposer, TaskGraph DAG, DecompositionGate
│   │   │   ├── models/           ModelCapabilityRegistry, ModelSelector
│   │   │   ├── pipeline/         Plan→Execute→Verify→Assemble stages
│   │   │   ├── budget/           TokenBudgetAllocator, enforcer
│   │   │   └── subscription/     SubscriptionMaximiser
│   │
│   ├── lokallm/             ← @lokaflow/lokallm (fine-tuned Phi-3 Mini INT4)
│   │   ├── src/
│   │   │   ├── inference/        InferenceEngine (llama.cpp GGUF)
│   │   │   ├── scoring/          ComplexityScorer, HeuristicScorer
│   │   │   └── learning/         PersonalAdapterTrainer (nightly LoRA)
│   │
│   └── audit/               ← "lokaaudit" npm (MIT licensed, standalone)
│       ├── src/
│       │   ├── parsers/          Claude, ChatGPT, Gemini export parsers
│       │   ├── tokeniser/        CL100k (exact), Gemini (approx)
│       │   ├── pricing/          PricingTable (verified monthly)
│       │   └── report/           AuditResult, CLI + HTML formatters
│       └── web/                  Browser WASM UI (no server)
│
└── apps/
    ├── web/                 ← Web UI (Next.js) — dashboard + chat interface
    └── mobile/              ← LokaMobile (React Native + Expo)
```

### 3.2 REST API Layer (packages/api) — V2.1

```
POST /v1/chat/completions    ← OpenAI-compatible (drop-in for any app)
  body: { model, messages, stream }
  → Router.route() → provider.stream()
  → SSE stream or JSON response

POST /v1/route               ← routing decision (explain mode)
  body: { messages }
  → Router.route() → RoutingDecision JSON
  { tier, model, reason, complexityScore, trace, costEur }

GET  /v1/cost                ← cost dashboard data
  → BudgetTracker.summary() → { today, month, total, savings }

GET  /v1/health              ← provider health status
  → each provider.healthCheck() → { local: OK, specialist: OK, cloud: OK }

GET  /v1/models              ← available models + routing config
```

### 3.3 LokaMesh Integration (packages/mesh) — V2.2

```
lokanet.yaml                 ← cluster config (git-ignored, separate from lokaflow.yaml)
nodes:
  - id: mac-mini-m2          always_on: true   ip: 192.168.2.65
  - id: macbook-air-m4       orchestrator: true
  - id: desktop-i5           storage_hub: true  wol_mac: xx:xx:xx:xx:xx:xx

MdnsDiscovery ─── announces this node on LAN every 30s
              └── scans for _lokaflow._tcp.local → NodeRegistry

MeshScheduler.selectNode(task):
  candidates = online nodes with required model + RAM + battery OK + thermal OK
  score = tokensPerSec×0.40 + alwaysOnBonus - batteryStress×0.20 - queuePenalty
  → highest score wins

RemoteExecutor → REST to selected node's Ollama API → stream back

SleepStateMachine:
  ONLINE → (idle 15min) → LIGHT_SLEEP → (idle 30min) → DEEP_SLEEP
  WoL magic packet → WAKING → (boot 30–90s) → ONLINE
```

### 3.4 LokaOrchestrator Pipeline — V2.3

```
Complex task (score > 0.65)
    │
    ▼ LokaLLM.decompose()  < 200ms, local, free
    TaskGraph (DAG, max 8 subtasks, max depth 3)
    │
    ▼ DecompositionGate
    latencyOverhead < 15% AND tokenSaving > 20% AND costSaving > 0 ?
    YES → orchestrate   |   NO → direct LokaRoute
    │
    ├─ STAGE 1: PLAN  (LOCAL_STANDARD, Mistral 7B)
    │   → PlanDocument: scaffold, section needs, token budgets
    │
    ├─ STAGE 2: EXECUTE (parallel, respects DAG edges)
    │   Each subtask → cheapest capable tier:
    │   0.00–0.30 → LOCAL_NANO   (TinyLlama 1.1B)
    │   0.30–0.55 → LOCAL_STANDARD (Mistral 7B)
    │   0.55–0.68 → LOCAL_LARGE  (Qwen 72B, if available)
    │   0.50–0.72 → CLOUD_LIGHT  (Claude Haiku / Gemini Flash)
    │   0.65–0.87 → CLOUD_STANDARD (Claude Sonnet / GPT-4o)
    │   0.83–1.00 → CLOUD_PREMIUM (Claude Opus / GPT-5.2 Thinking)
    │
    ├─ STAGE 3: VERIFY (optional, LOCAL_STANDARD or CLOUD_LIGHT)
    │   Precision dimension > 0.70? → consistency + completeness check
    │   Gaps found? → targeted re-execution of gap subtask only
    │
    └─ STAGE 4: ASSEMBLE (LOCAL_NANO, always free)
        Merge subtask outputs → consistent formatting → final response

Result: 2/6 subtasks need cloud. Token reduction: 60%. Latency: 40% faster.
```

### 3.5 LokaAudit (packages/audit) — V2.4

```
CLI: lokaaudit conversations.json
Web: browser WASM (zero server, zero data upload)

AutoDetectParser → ClaudeExportParser / ChatGPTExportParser / GeminiExportParser
    → ParsedExport (normalised schema)

CL100kTokeniser (exact) / GeminiTokeniser (chars/4 ±15%)
    → token counts per conversation

CostCalculator
    actualCostEur   = tokens × API rates (updated monthly, source URLs required)
    subscriptionEur = €20.00 (Claude Pro) | €20.00 (ChatGPT Plus)
    utilisationRate = actualCost / subscriptionCost × 100
    overpayEur      = subscriptionCost - actualCostEur

LocalQueryClassifier → localEligiblePercent (trivial + moderate)

Output:
  CLI: terminal gauge display
  HTML: self-contained shareable file
  CTA: https://lokaflow.io?saving=XX&ref=audit
```

---

## 4. Data Flow — Privacy Guarantees

```
┌──────────────────────────────────────────────────────────────┐
│ NEVER leaves device:                                          │
│  • Raw query content                                          │
│  • Conversation history (memory store)                        │
│  • User profile (custom instructions, language, topics)       │
│  • PII — routed to LOCAL before any API call                  │
│  • LokaAudit export data (processed in memory, then discarded)│
│  • LokaLLM meta-decisions (decomposition, complexity scoring) │
└──────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────┐
│ Logged locally only (metadata, no content):                   │
│  • model name, tier, latency, cost, routing reason            │
│  • token counts (no tokens themselves)                        │
│  • → ~/.lokaflow/costs.db, lokaflow-routing.log (rotates 10MB)│
└──────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────┐
│ Sent to cloud only (when cloud tier is selected):             │
│  • Query content after PII scan passes                        │
│  • No session IDs, no account data, no routing metadata       │
└──────────────────────────────────────────────────────────────┘
```

---

## 5. Build Order — Status

| Step | Feature | Package | Status |
|---|---|---|---|
| V1 | **Core router** (PII, classify, budget, providers) | `packages/core/` | ✅ Done |
| V1 | **CLI** (chat, cost, supporters) | `packages/cli/` | ✅ Done |
| V2.1 | **REST API** (OpenAI-compatible proxy on :4141) | `packages/api/` | ✅ Done |
| V2.2 | **LokaRoute** (intelligent proxy + savings tracker) | `packages/route/` | ✅ Done |
| V2.3 | **LokaAgent** (8-stage DAG orchestration pipeline) | `packages/agent/` | ✅ Done |
| V2.4 | **LokaOrchestrator** (task decomposition + DAG execution) | `packages/orchestrator/` | ✅ Done |
| V2.5 | **LokaMesh** (mDNS discovery, WoL, battery, carbon) | `packages/mesh/` | ✅ Done |
| V2.6 | **LokaAudit** (ChatGPT/Claude subscription analyser) | `packages/audit/` | ✅ Done |
| V2.7 | **LokaCommons** (cooperative compute, credits ledger) | `packages/commons/` | ✅ Done |
| V2.8 | **LokaSwap** (token exchange, group purchasing) | `packages/swap/` | ✅ Done |
| V2.9 | **Web UI** (dashboard + chat) | `apps/web/` | 🔧 In progress |
| V2.10 | **VS Code plugin** | `packages/vscode/` | 🔧 Scaffold |
| V2.11 | **LokaLLM** (fine-tuned Phi-3 Mini INT4) | `packages/lokallm/` | 🔧 In progress |
| V2.12 | **LokaMobile** (React Native + llama.cpp) | `apps/mobile/` | 🔧 Scaffold |

---

## 6. Configuration Reference

### lokaflow.yaml (current)

```yaml
local:
  base_urls: ["http://localhost:11434", "http://192.168.2.65:11434"]
  default_model: "qwen2.5-coder:7b"
  timeout_seconds: 120

router:
  specialist_provider: gemini          # gemini | ollama | openai
  specialist_model: "gemini-2.0-flash"
  complexity_local_threshold: 0.35
  complexity_cloud_threshold: 0.65
  max_local_tokens: 8000
  fallback_to_local: true

cloud:
  claude_model: "claude-sonnet-4-20250514"
  openai_model: "gpt-4o"
  gemini_model: "gemini-2.0-flash"
  groq_model: "llama-3.3-70b-versatile"

budget:
  daily_limit_eur: 2.00
  monthly_limit_eur: 20.00
  warn_at_percent: 80

search:
  enabled: false        # opt-in — enable with BRAVE_API_KEY
  brave_enabled: true
  arxiv_enabled: true
  max_results: 5
  filter_threshold: 5.0

memory:
  enabled: false        # opt-in
  top_k: 4
  session_id: "default"
```

### lokanet.yaml (V2 — LokaMesh)

```yaml
nodes:
  - id: mac-mini-m2
    role: always_on
    ip: 192.168.2.65
    port: 11434
    models: ["qwen2.5-coder:7b", "mistral:7b"]
    ram_gb: 8
    inference_watts: 10
    gpu_acceleration: true      # Apple Silicon Metal
    always_on: true

  - id: macbook-air-m4
    role: orchestrator
    ip: auto                    # auto-discovered via mDNS
    models: ["qwen2.5-coder:7b", "phi3:mini"]
    ram_gb: 16
    sleep:
      enabled: true
      idle_minutes: 15
      wol: false                 # no WoL on laptop (lid close)

  - id: desktop-i5
    role: storage
    ip: auto
    models: []                   # no inference — storage only
    ram_gb: 32
    mac_address: "xx:xx:xx:xx:xx:xx"
    sleep:
      enabled: true
      idle_minutes: 30
      wol: true                  # WoL for burst demand
```

---

## 7. Complexity Score — Quick Reference

| Score | Tier | Provider | Example queries |
|---|---|---|---|
| 0.00–0.35 | LOCAL | Ollama (round-robin) | "What is 2+2?", "Format this JSON" |
| 0.35–0.65 | SPECIALIST → DELEGATED | Gemini (planner) + Local (workers) | "Review this function", "Summarise this doc" |
| 0.65–1.00 | CLOUD | Gemini / Claude / OpenAI | "Design an auth architecture", "DORA compliance analysis" |

**Fallback chain (cloud unavailable / no API key):**
`CLOUD → SPECIALIST → LOCAL` — always graceful, never crashes.

---

## 8. Cost Model

| Provider | Input (EUR/1K) | Output (EUR/1K) | Tier |
|---|---|---|---|
| Ollama (local) | €0.00 | €0.00 | LOCAL |
| Gemini 2.0 Flash | €0.00069 | €0.00276 | SPECIALIST/CLOUD |
| Groq Llama 70B | €0.00053 | €0.00071 | CLOUD |
| Claude Sonnet | €0.0028 | €0.014 | CLOUD |
| OpenAI GPT-4o | €0.0046 | €0.0138 | CLOUD |
| Claude Opus | €0.015 | €0.075 | CLOUD_PREMIUM |

**V2 blended saving target:**
```
total_saving% = local_route%(60–70%)
              + orchestrator_reduction%(30–65% of cloud queries)
              + subscription_maximiser%(35–60% of premium tokens)
= 80–95% vs naive all-cloud approach
```

---

*© 2026 LearnHubPlay BV · LokaFlow™ · BUSL 1.1 · lokaflow.io*
