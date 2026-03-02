// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaRoute™ — lokaflow.io

/**
 * The five routing tiers LokaRoute selects between.
 *
 *  0.00–0.35  →  local-trivial   (7B or smaller, fastest)
 *  0.35–0.55  →  local-capable   (7B–13B, good quality locally)
 *  0.55–0.70  →  cloud-mid       (Gemini Flash, Claude Haiku)
 *  0.70–0.85  →  cloud-capable   (Claude Sonnet, GPT-4o-mini)
 *  0.85–1.00  →  cloud-frontier  (Claude Sonnet/Opus, GPT-4o)
 */
export type RoutingTier =
  | "local-trivial"
  | "local-capable"
  | "cloud-mid"
  | "cloud-capable"
  | "cloud-frontier";

/** All 14 features the FeatureExtractor produces per query. */
export interface ClassifierFeatures {
  // ── Length signals ──────────────────────────────────────────────────────────
  /** Rough token count (words / 0.75). */
  tokenCount: number;
  /** Number of file or image attachments. */
  attachmentCount: number;

  // ── Linguistic signals ──────────────────────────────────────────────────────
  /** 0–1: "what" < "why" < "how should" < "design/architect". */
  questionDepth: number;
  /** 0–1: density of technical jargon, code terms, stack trace markers. */
  technicalTermDensity: number;
  /** True if the query contains multiple distinct sub-questions. */
  multiPartDetected: boolean;
  /** 0–1: "summarise" (0) → "write" (0.4) → "design/review/justify" (0.8+). */
  imperativeComplexity: number;

  // ── Domain signals ──────────────────────────────────────────────────────────
  /** True if regulatory terms (DORA, SOX, GDPR, MiFID, Basel III) detected. */
  regulatoryKeywords: boolean;
  /** True if code blocks, backticks, or programming syntax detected. */
  codeDetected: boolean;
  /** True if mathematical notation or heavy numerics detected. */
  mathDetected: boolean;

  // ── Context signals ──────────────────────────────────────────────────────────
  /** Number of prior conversation turns. */
  priorTurns: number;
  /** 0–1: complexity of the system prompt (if any). */
  systemPromptComplexity: number;

  // ── Output signals ──────────────────────────────────────────────────────────
  /** True if JSON schema, table, report, or structured output requested. */
  outputFormatRequested: boolean;
  /** True if "detailed", "comprehensive", "exhaustive", "full" etc. detected. */
  lengthRequested: boolean;

  // ── Learning signal ──────────────────────────────────────────────────────────
  /** User-specific baseline (0.5 until enough history). */
  historicalComplexityBaseline: number;
}

/** Context passed alongside the raw query to the classifier. */
export interface QueryContext {
  attachments?: unknown[];
  conversationLength?: number;
  systemPrompt?: string;
  /** Pre-computed baseline from PersonalisedLearner (0.5 default). */
  userBaseline?: number;
}

/** The output of QueryClassifier. */
export interface QueryClassification {
  tier: RoutingTier;
  /** 0.0–1.0 composite complexity score. */
  score: number;
  features: ClassifierFeatures;
  /** Human-readable explanation of the decision. */
  reason: string;
  /** Set when a deterministic rule matched (bypasses ML scoring). */
  ruleMatch?: string;
  /** True if PII was detected — constrains tier to local-only. */
  piiDetected?: boolean;
}
