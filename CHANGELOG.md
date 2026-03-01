# Changelog — LokaFlow™

All notable changes to LokaFlow™ will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- V3.5 Core Refactor: safely extracted monolithic `src/` logic into dedicated `@lokaflow/core`, `@lokaflow/api`, and `@lokaflow/cli` monorepo packages.
- Full TypeScript package scaffold (`src/`)
- `package.json` — pnpm, Node 22, ESM, scripts: dev, build, lint, typecheck, test, check
- `tsconfig.json` — strict TypeScript 5.5, NodeNext module resolution
- `vitest.config.ts` — unit tests with v8 coverage, 80% threshold on `src/router/`
- `vitest.integration.config.ts` — integration test config (120s timeout, single-fork sequential, auto-skip if Ollama unavailable)
- `eslint.config.mjs` — ESLint 9 flat config with `@typescript-eslint/recommended`
- `.prettierrc` — consistent formatting (100-char lines, double quotes)
- `.pre-commit-config.yaml` — hooks: trailing-whitespace, detect-private-key, detect-secrets, prettier, eslint, tsc
- `.github/workflows/ci.yml` — CI: lint, typecheck, unit tests matrix (Node 22 + 23), secret scan
- `src/types.ts` — shared types: `Message`, `LLMResponse`, `RoutingDecision`, `LokaFlowConfig`
- `src/exceptions.ts` — typed error hierarchy: `BudgetExceededError`, `PIIDetectedError`, `ProviderUnavailableError`
- `src/config.ts` — Zod-validated YAML config loader with camelCase mapping and safe defaults
- `src/utils/security.ts` — `maskKey()`, `envVar()`, `requireEnvVar()`
- `src/providers/base.ts` — `BaseProvider` abstract class with `complete()`, `stream()`, `healthCheck()`
- `src/providers/local.ts` — `OllamaProvider` (native fetch, streaming via ReadableStream)
- `src/providers/claude.ts` — `ClaudeProvider` (@anthropic-ai/sdk, streaming)
- `src/providers/openai.ts` — `OpenAIProvider` (openai sdk, streaming)
- `src/providers/gemini.ts` — `GeminiProvider` (streaming fully implemented via `generateContentStream`)
- `src/providers/groq.ts` — `GroqProvider` (groq-sdk, streaming)
- `src/router/classifier.ts` — `TaskClassifier` with 6 weighted signals (0.0–1.0 complexity score)
- `src/router/piiScanner.ts` — `PIIScanner`: regex (email, IBAN, BSN/Elfproef, phone, CC/Luhn, IP) + compromise NER
- `src/router/budget.ts` — `BudgetTracker`: SQLite daily/monthly EUR caps via better-sqlite3
- `src/router/router.ts` — `Router`: full 5-step pipeline (PII → tokens → classify → budget → execute) + specialist delegation with recursive subtask decomposition (maxDepth=2, parallel execution)
- `src/dashboard/tracker.ts` — `CostTracker`: query metadata logging (no content)
- `src/dashboard/report.ts` — CLI cost report with chalk formatting and savings calculation
- `src/cli/index.ts` — commander CLI entry: `lokaflow chat`, `lokaflow cost`, `--supporters`
- `src/cli/chat.ts` — interactive chat loop with streaming and routing decision display
- `src/cli/cost.ts` — cost report CLI command
- `src/cli/supporters.ts` — GitHub Sponsors display with 24h local cache
- `src/search/sources/brave.ts` — `BraveSource`: Brave Search API adapter (2,000 free req/mo, graceful no-key fallback)
- `src/search/sources/arxiv.ts` — `ArxivSource`: arXiv Atom API (no key required, keyword-gated, Atom XML parser)
- `src/search/expander.ts` — `QueryExpander`: local model generates 2–3 focused sub-queries; falls back to original query
- `src/search/filter.ts` — `LocalFilter`: local model scores search results 0–10; drops below configurable threshold
- `src/search/retriever.ts` — `ParallelRetriever`: all sources × sub-queries fired concurrently via `Promise.allSettled`; URL-deduplication
- `src/search/engine.ts` — `SearchEngine`: orchestrates expand → retrieve → filter; `formatAsContext()` formats results as a system message for prompt injection
- `src/search/index.ts` — exports full search pipeline
- `src/memory/store.ts` — `MemoryStore`: SQLite conversation memory with TF-IDF vector storage + cosine similarity search; tables: `memory_entries`, `memory_sessions`
- `src/memory/profile.ts` — `ProfileStore`: user preferences persisted in SQLite (language, model, timezone, custom instructions, tracked topics); upsert-safe partial saves
- `src/memory/rag.ts` — `TfidfVectorizer` (L2-normalised bag-of-words); `RagRetriever` (builds vocab, vectorizes, retrieves top-k similar entries); `MemoryManager` (high-level `remember()` + `recall()` facade)
- `src/memory/index.ts` — exports full memory/RAG pipeline
- `src/cli/chat.ts` — UserProfile integration: loads `customInstructions` from `ProfileStore` at startup (prepended as system message); `MemoryManager.remember()` called per exchange to persist conversation; memory status shown in banner; graceful `memoryManager.close()` on exit

- `config/lokaflow.example.yaml` — full config schema with all defaults documented
- `tests/unit/classifier.test.ts` — 12 unit tests covering all tier bands and signal behaviour
- `tests/unit/piiScanner.test.ts` — 14 unit tests (email, IBAN, BSN, phone, IP, multi-type, sync)
- `tests/unit/budget.test.ts` — 8 unit tests (daily/monthly limits, zero-cost local, accumulation)
- `tests/unit/router.test.ts` — 8 unit tests (PII routing, token limit, fallback, response shape)
- `tests/integration/local.test.ts` — OllamaProvider live integration tests (auto-skipped if Ollama absent)
- `tests/integration/pipeline.test.ts` — full routing pipeline live tests with PII blocking, token limit, budget enforcement
- `tests/fixtures/sampleQueries.json` — labelled queries for classifier regression testing
- `tests/fixtures/piiSamples.txt` — synthetic PII samples (no real data)

### Fixed
- `src/router/router.ts` — routing log now rotates at 10 MB (`lokaflow-routing.log.1`) to prevent unbounded disk growth
- `src/config.ts` — Zod `CloudSchema` now validates all 11 provider model fields; `SpecialistSchema` added as top-level `specialist:` section; `SearchSchema` added for deep search config
- `src/config.ts` — `RouterSchema` now includes `specialistProvider` and `specialistModel` so Gemini is correctly picked up as specialist provider from `lokaflow.yaml`
- `src/types.ts` — `LokaFlowConfig` now fully matches parsed Zod output: `specialist?` section added, redundant `router.specialistProvider/Model` removed; `SearchResult` and `search_augmented` routing reason added
- `src/types.ts` — `RouterProviders.specialist` is now correctly typed as `specialist?: BaseProvider`
- `tsconfig.json` — added `"DOM", "DOM.Iterable"` to `lib`; resolves pre-existing `fetch`, `URL`, `AbortSignal`, `TextDecoder`, `console` typecheck errors across all providers
- `config/lokaflow.example.yaml` — removed legacy `local.specialist_model` (use `specialist:` section instead)
- Router Step 2b added: when `search.enabled: true`, search pipeline runs between token estimate and complexity classification; results injected as system message

### Planned
- Memory / RAG module (ChromaDB)
- VS Code extension
- LokaMesh distributed cluster layer

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
