// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.

/**
 * TaskClassifier — scores query complexity from 0.0 (trivial) to 1.0 (research-level).
 *
 * Seven weighted signals:
 *   1. tokenCountScore    — normalised log of token count                weight=0.05
 *   2. questionComplexity — reasoning/comparison question words          weight=0.20
 *   3. technicalDensity   — code blocks, stack traces, file paths        weight=0.15
 *   4. reasoningKeywords  — analysis/explanation vocabulary              weight=0.15
 *   5. cotIndicators      — chain-of-thought markers                     weight=0.05
 *   6. lengthBonus        — sentence count signal                        weight=0.10
 *   7. codingTaskScore    — imperative coding tasks (create/build + lang) weight=0.30
 */

import type { RoutingTier } from "../types.js";

export interface ClassificationResult {
  score: number;
  tier: RoutingTier;
  signals: Record<string, number>;
}

// ── Signal keyword sets ───────────────────────────────────────────────────────

const COMPLEXITY_WORDS = [
  "why",
  "how",
  "compare",
  "analyse",
  "analyze",
  "trade-off",
  "tradeoff",
  "versus",
  " vs ",
  "explain",
  "evaluate",
  "difference",
  "contrast",
  "pros and cons",
  "recommend",
  "should i",
  "best approach",
  "design",
  "architecture",
  "distributed",
  "system",
  "scale",
  "microservices",
  "concurrency",
  "performance",
];

const REASONING_KEYWORDS = [
  "because",
  "therefore",
  "hence",
  "thus",
  "however",
  "nevertheless",
  "evaluate",
  "assess",
  "critique",
  "implication",
  "consequence",
  "impact",
  "justify",
  "rationale",
  "reasoning",
  "argument",
];

const COT_INDICATORS = [
  "step by step",
  "step-by-step",
  "let me think",
  "chain of thought",
  "let's break",
  "first,",
  "second,",
  "third,",
  "finally,",
  "to summarise",
  "to summarize",
  "in conclusion",
];

const CODE_PATTERNS = [
  /```[\s\S]*?```/g, // fenced code blocks
  /`[^`]+`/g, // inline code
  /at\s+\w+\.\w+\s*\(/g, // stack trace lines
  /\w+\.\w+\.\w+/g, // dotted paths (file.module.class)
  /\/[a-z][\w/.-]+\.\w+/g, // file paths
  /Error:\s/g, // error messages
  /Traceback/g, // Python tracebacks
  /TypeError|ReferenceError|SyntaxError/g,
];

// ── Coding-task signals ───────────────────────────────────────────────────────

/** Programming / scripting language names. */
const CODING_LANGUAGES = [
  "java",
  "python",
  "typescript",
  "javascript",
  "kotlin",
  "swift",
  "rust",
  "golang",
  "go ",
  "c++",
  "c#",
  "csharp",
  "ruby",
  "php",
  "scala",
  "dart",
  "bash",
  "shell",
  "sql",
  "r ",
  "matlab",
  "react",
  "vue",
  "angular",
  "nextjs",
  "next.js",
  "spring",
  "django",
  "fastapi",
  "express",
  "node",
  "nodejs",
];

/** Imperative creation/modification verbs. */
const CODING_ACTIONS = [
  "create",
  "build",
  "implement",
  "write",
  "develop",
  "generate",
  "code",
  "program",
  "make",
  "construct",
  "design",
  "refactor",
  "fix",
  "debug",
  "add",
  "update",
  "migrate",
  "deploy",
  "set up",
  "integrate",
  "connect",
  "parse",
  "convert",
  "transform",
];

/** Coding artefact nouns. */
const CODING_SUBJECTS = [
  "program",
  "application",
  "app",
  "function",
  "method",
  "class",
  "api",
  "endpoint",
  "service",
  "microservice",
  "component",
  "module",
  "script",
  "cli",
  "tool",
  "library",
  "package",
  "plugin",
  "bot",
  "algorithm",
  "data structure",
  "query",
  "schema",
  "model",
  "pipeline",
  "workflow",
  "server",
  "client",
  "interface",
];

// ── Scoring helpers ───────────────────────────────────────────────────────────

function countMatches(text: string, terms: string[]): number {
  const lower = text.toLowerCase();
  return terms.reduce((acc, term) => acc + (lower.includes(term) ? 1 : 0), 0);
}

function countRegexMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce((acc, p) => {
    const matches = text.match(new RegExp(p.source, p.flags));
    return acc + (matches?.length ?? 0);
  }, 0);
}

function estimateTokens(text: string): number {
  // Rough approximation: ~1.3 tokens per word
  return Math.round(text.split(/\s+/).filter(Boolean).length * 1.3);
}

function countSentences(text: string): number {
  return text.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Coding-task detector.
 *
 * Uses word-boundary matching for short terms (≤4 chars) to avoid false
 * substring matches (e.g. "api" inside "capitals").
 *
 * Scoring:
 *   - language + action + subject → 1.0  (e.g. "create java program")
 *   - language + (action OR subject) → 0.90  (e.g. "java api endpoint")
 *   - action + subject (no language) → 1.0  (e.g. "build a rest api")
 *   - action only → 0.30  (e.g. "create a list" — no coding subject)
 *   - subject only → 0.20 (e.g. "api response")
 */
function hasWordMatch(lower: string, terms: string[]): boolean {
  return terms.some((term) => {
    const t = term.trimEnd(); // strip intentional trailing spaces like "go "
    if (t.length <= 4) {
      const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(?:^|[^a-z])${escaped}(?:[^a-z]|$)`).test(lower);
    }
    return lower.includes(term);
  });
}

function scoreCodingTask(text: string): number {
  const lower = text.toLowerCase();
  const hasLang = hasWordMatch(lower, CODING_LANGUAGES);
  const hasAction = hasWordMatch(lower, CODING_ACTIONS);
  const hasSubject = hasWordMatch(lower, CODING_SUBJECTS);

  if (hasLang && hasAction && hasSubject) return 1.0;
  if (hasLang && (hasAction || hasSubject)) return 1.0;
  if (hasAction && hasSubject) return 1.0;
  if (hasAction) return 0.3;
  if (hasSubject) return 0.2;
  return 0;
}

// ── Classifier ────────────────────────────────────────────────────────────────

export class TaskClassifier {
  private readonly config: import("../types.js").LokaFlowConfig | undefined;

  constructor(config?: import("../types.js").LokaFlowConfig) {
    this.config = config;
  }

  /**
   * Score a query text.
   * @returns Complexity score in [0.0, 1.0]
   */
  score(text: string): number {
    return this.classify(text).score;
  }

  /** Full classification with individual signal breakdown. */
  classify(text: string): ClassificationResult {
    const tokens = estimateTokens(text);
    const sentences = countSentences(text);

    // Signal 1 — token count (longer queries tend to be more complex)
    const tokenCountScore = clamp(Math.log(tokens + 1) / Math.log(8001));

    // Signal 2 — question complexity words
    const complexityHits = countMatches(text, COMPLEXITY_WORDS);
    const questionComplexity = clamp(complexityHits / 4);

    // Signal 3 — technical density (code, stack traces, file paths)
    const codeHits = countRegexMatches(text, CODE_PATTERNS);
    const technicalDensity = clamp(codeHits / 5);

    // Signal 4 — reasoning vocabulary
    const reasoningHits = countMatches(text, REASONING_KEYWORDS);
    const reasoningKeywords = clamp(reasoningHits / 4);

    // Signal 5 — chain-of-thought indicators
    const cotHits = countMatches(text, COT_INDICATORS);
    const cotIndicators = clamp(cotHits / 2);

    // Signal 6 — length bonus (multi-sentence queries are more complex)
    const lengthBonus = clamp(Math.max(0, sentences - 1) / 10);

    // Signal 7 — imperative coding task (language + action + subject)
    const codingTaskScore = scoreCodingTask(text);

    // Weighted sum
    // Total weights = 0.05 + 0.20 + 0.15 + 0.15 + 0.05 + 0.10 + 0.30 = 1.00
    const score = clamp(
      tokenCountScore * 0.05 +
        questionComplexity * 0.2 +
        technicalDensity * 0.15 +
        reasoningKeywords * 0.15 +
        cotIndicators * 0.05 +
        lengthBonus * 0.1 +
        codingTaskScore * 0.3,
    );

    return {
      score,
      tier: scoreTier(score, this.config),
      signals: {
        tokenCountScore,
        questionComplexity,
        technicalDensity,
        reasoningKeywords,
        cotIndicators,
        lengthBonus,
        codingTaskScore,
      },
    };
  }
}

/** Map a complexity score to a routing tier. */
export function scoreTier(
  score: number,
  config?: import("../types.js").LokaFlowConfig,
): RoutingTier {
  const localThresh = config?.router?.complexityLocalThreshold ?? 0.35;
  const cloudThresh = config?.router?.complexityCloudThreshold ?? 0.65;

  if (score < localThresh) return "local";
  if (score < cloudThresh) return "specialist";
  return "cloud";
}
