# Changelog — LokaFlow™

All notable changes to LokaFlow™ will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added — Product Family (2026-03-02)

- **Pricing model revised** — free for all individuals, NGOs, schools, and any
  organisation with < 100 employees OR < €1M annual revenue. Both conditions
  must be exceeded simultaneously to require a commercial license.

- **LokaGuard™ module** (`packages/guard/`) — _In progress_
  DORA Article 11 / SOX Section 404 / GDPR Article 30 compliance module
  for Business and Enterprise tiers. Single SQLite table (`audit_log`) appended
  to existing `lokaflow.db`. Planned components:
  - `audit/trail.ts` — append-only audit trail with signed export (CSV/JSON)
  - `audit/schema.ts` — `AuditEntry` type with compliance flags per framework
  - `reports/dora.ts` — DORA Article 11 PDF report generator (pdfkit)
  - `reports/sox.ts` — SOX Section 404 internal controls report
  - `reports/gdpr.ts` — GDPR Article 30 records of processing activities
  - `pii/custom-rules.ts` — custom PII rule engine (pattern + NLP entity)
  - `pii/residency.ts` — `DataResidencyGuard` (EU / US / any enforcement)
  - `compliance/checker.ts` — per-framework compliance flag evaluator
  - Dashboard tab: compliance status, report generator, audit log viewer
  - Feature-flagged: `lokaGuard.enabled` in `lokaflow.yaml`

- **LokaEnterprise deployment** (`packages/enterprise/`, `docker/`) — _Planned_
  Corporate on-premise deployment mode. Not a separate product — same codebase,
  different deployment configuration. Planned components:
  - `docker/docker-compose.yml` — full stack (api + web + ollama + postgres)
  - `docker/docker-compose.air-gap.yml` — zero external network mode
  - `docker/Dockerfile.api` and `docker/Dockerfile.web` — production images
  - `packages/enterprise/src/admin/` — user management, department routing policies
  - `packages/enterprise/src/sso/` — Entra ID, Google Workspace, SAML 2.0
  - `packages/enterprise/src/licence/` — licence key validation + tier resolver
  - `packages/enterprise/src/white-label/` — branding config (name, logo, colours)
  - Postgres support (replaces SQLite for enterprise multi-user deployments)

- **LokaLearn content pack** (`packages/content/packs/lokalearn.json`) — _Planned_
  Education prompt pack. 30+ templates across:
  - Coding education (explain code, debug guide, coding exercises)
  - Essay writing (feedback, outline builder, citation helper)
  - Mathematics (concept explainer, step-by-step solver)
  - Language learning (translation + explain, conversation practice)
  - Science and research (ELI5, research starter, study plan)
  - Exam preparation (flashcard creator, quiz generator, revision guide)
    Free for all users. Pre-installed for NGO and School tier.
    Offline-capable via local Qwen 2.5 multilingual models (29 languages).

- **Prompt pack system** (`packages/core/src/prompts/pack.ts`) — _Planned_
  Pack install/list/remove API for distributing curated prompt template
  collections. Enables community packs from registry URL.

- **LokaAccess initiative** (`docs/partnerships/`, `docs/mobile/`) — _Planned 2028_
  Global access programme for users with limited internet or mobile-only access.
  2026 deliverables: landing page (lokaaccess.io), partnership brief for telcos/NGOs,
  Android technical spike document. Mobile build deferred to 2028.

---

### Added — v2 monorepo packages (2026-03-01)

- `packages/agent/` — `@lokaflow/agent` v0.1.0: LokaAgent™ 8-stage orchestration pipeline
  - `dag/`: cycle-detector, topological-sort (11 unit tests)
  - `decomposer/`: decomposition-gate (complexity-gated), interim-decomposer, lokallm-decomposer
  - `pipeline/`: assembler, complexity-scorer, context-packer, execution-engine, model-matcher, prompt-guard, quality-gate, task-splitter
  - `registry/`: model-registry, interim-models, warm-tracker
  - `utils/`: ollama health helpers, token counting
  - 65 unit tests + 5 skipped integration tests; pre-push CI green

- `packages/orchestrator/` — `@lokaflow/orchestrator` v0.1.0: LokaOrchestrator™ task DAG engine
  - `complexity/`: ComplexityMeasurer with 6 dimension scorers
  - `decomposer/`: TaskDecomposer, TaskGraph DAG
  - `pipeline/`: Plan→Execute→Verify→Assemble stages
  - `models/`: ModelCapabilityRegistry
  - `budget/`: TokenBudgetAllocator
  - 8 unit tests

- `packages/mesh/` — `@lokaflow/mesh` v0.1.0: LokaMesh™ distributed compute layer
  - `discovery/`: MdnsDiscovery (\_lokaflow.\_tcp.local), NodeRegistry
  - `scheduler/`: MeshScheduler (score = tokensPerSec×0.40 + alwaysOnBonus - batteryStress×0.20)
  - `executor/`: RemoteExecutor, health checks
  - `power/`: WolSender (magic packet), SleepStateMachine (ONLINE→LIGHT_SLEEP→DEEP_SLEEP)
  - `battery/`: ClusterBatteryStore, ChargeGuardian, ThermalGuard, BatteryWorkloadBalancer, HealthTracker, BatteryReport
  - `green/`: carbon.ts (electricity maps integration)
  - 24 unit tests

- `packages/audit/` — `@lokaflow/audit` v0.1.0: LokaAudit™ subscription analyser
  - Parsers: ChatGPTExportParser, ClaudeExportParser
  - AuditEngine: utilisation rate, overpay calculation, local-eligible classification
  - 3 unit tests

- `packages/commons/` — `@lokaflow/commons` v1.0.0: LokaCommons™ cooperative compute
  - `credits/`: credits ledger with transaction history
  - `routing/`: CooperativeRouter (peer discovery + task distribution)
  - `registry/`: node registry
  - 7 unit tests

- `packages/swap/` — `@lokaflow/swap` v1.0.0: LokaSwap™ token exchange
  - `exchange/`: listing, TradeSettlement (idempotent, rollback on failure)
  - `pools/`: token pools
  - `purchasing/`: DemandAggregator (group purchasing)
  - `conversion/`: token converter
  - 6 unit tests

- `packages/route/` — `@lokaflow/route` v0.1.0: LokaRoute™ intelligent LLM proxy
  - `proxy/server.ts`: OpenAI-compatible proxy router
  - `tracker/savings-tracker.ts`: per-request savings calculation
  - 2 unit tests

- `packages/api/` — `@lokaflow/api` v1.0.0: REST API + OpenAI-compatible proxy on :4141
  - Fastify server
  - Source extracted from monolithic server layer

- **Monorepo migration**: all packages moved to `packages/*/`, root `tests/` for integration,
  `pnpm-workspace.yaml` wiring 12 TypeScript packages + 2 apps

- `fix: improve Gemini empty-response diagnostics with proper SDK typing`
  - Import `GenerateContentCandidate` type; replace manual `as {}` cast on candidate
  - `finishReason` now uses SDK's real `FinishReason` enum value
  - Error message includes candidate count and safetyRatings when present
  - Distinguishes safety blocks from quota/network empty responses

- V3.5 Core Refactor: extracted monolithic `src/` logic into `@lokaflow/core`,
  `@lokaflow/api`, and `@lokaflow/cli` monorepo packages
  - Full TypeScript package scaffold (`src/`)
  - `package.json` — pnpm, Node 22, ESM, scripts: dev, build, lint, typecheck, test, check
  - `tsconfig.json` — strict TypeScript 5.5, NodeNext module resolution
  - `vitest.config.ts` — unit tests with v8 coverage, 80% threshold on `src/router/`
  - `vitest.integration.config.ts` — integration test config (120s timeout, single-fork, auto-skip if Ollama absent)
  - `eslint.config.mjs` — ESLint 9 flat config with `@typescript-eslint/recommended`
  - `.prettierrc` — 100-char lines, double quotes
  - `.pre-commit-config.yaml` — trailing-whitespace, detect-private-key, detect-secrets, prettier, eslint, tsc
  - `.github/workflows/ci.yml` — CI: lint, typecheck, unit tests matrix (Node 22 + 23), secret scan
  - `src/types.ts` — `Message`, `LLMResponse`, `RoutingDecision`, `LokaFlowConfig`
  - `src/exceptions.ts` — `BudgetExceededError`, `PIIDetectedError`, `ProviderUnavailableError`
  - `src/config.ts` — Zod-validated YAML config loader
  - `src/providers/` — BaseProvider, OllamaProvider, ClaudeProvider, OpenAIProvider, GeminiProvider, GroqProvider
  - `src/router/classifier.ts` — TaskClassifier with 6 weighted signals
  - `src/router/piiScanner.ts` — regex (email, IBAN, BSN/Elfproef, phone, CC/Luhn, IP) + compromise NER
  - `src/router/budget.ts` — SQLite daily/monthly EUR caps
  - `src/router/router.ts` — 5-step pipeline + specialist delegation + recursive subtask decomposition
  - `src/search/` — BraveSource, ArxivSource, QueryExpander, LocalFilter, ParallelRetriever, SearchEngine
  - `src/memory/` — MemoryStore (SQLite TF-IDF), ProfileStore, RagRetriever, MemoryManager
  - `src/cli/` — chat, cost, supporters commands
  - `config/lokaflow.example.yaml` — full config schema with all defaults documented
  - 115 unit tests across 9 packages

### Fixed

- `src/router/router.ts` — routing log rotates at 10 MB to prevent unbounded disk growth
- `src/config.ts` — Zod `CloudSchema` validates all 11 provider model fields
- `src/config.ts` — `RouterSchema` includes `specialistProvider` and `specialistModel`
- `src/types.ts` — `LokaFlowConfig` fully matches parsed Zod output
- `tsconfig.json` — `"DOM", "DOM.Iterable"` added to `lib`
- Router Step 2b: search pipeline runs between token estimate and complexity classification

### Planned

- `@lokaflow/guard` — LokaGuard compliance module (4 weeks)
- `@lokaflow/enterprise` — admin panel, SSO, licence management (3 weeks)
- `@lokaflow/content` — prompt pack system + LokaLearn pack (1 week)
- `docker/` — enterprise on-premise deployment (included in enterprise work)
- VS Code extension (full implementation)
- LokaMobile React Native app
- LokaAccess Android (2028, telco partnership required)

---

## [0.1.0-pre] — 2026-02-27

### Added

- Repository initialised under Business Source License 1.1
- `COPYRIGHT.md` — EU copyright notice (LearnHubPlay BV, KvK 97741825)
- `LICENSE` — BUSL 1.1, converts to Apache 2.0 on 2030-01-01
- `README.md` — Platform overview and routing architecture
- `CONTRIBUTING.md` — Contributor guidelines and CLA
- `THIRD_PARTY_LICENSES.md` — License compatibility policy and model attributions
- `SECURITY.md` — Security policy and vulnerability reporting
- `VISION.md` — Project vision and roadmap
- `.gitignore` — Excludes OS files, secrets, model weights, confidential docs

### Legal

- Domains registered: `lokaflow.com` and `lokaflow.nl`
- Copyright established across EU (Dutch Auteurswet + EU Directive 2019/790)
- IP assignment to LearnHubPlay BV pending formal agreement

---

[Unreleased]: https://github.com/manojmallick/lokaflow/compare/v0.1.0-pre...HEAD
[0.1.0-pre]: https://github.com/manojmallick/lokaflow/releases/tag/v0.1.0-pre
