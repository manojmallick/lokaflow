// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.

/**
 * TaskClassifier — scores query complexity from 0.0 (trivial) to 1.0 (research-level).
 *
 * Six weighted signals:
 *   1. tokenCountScore    — normalised log of token count           weight=0.05
 *   2. questionComplexity — reasoning/comparison question words     weight=0.40
 *   3. technicalDensity   — code blocks, stack traces, file paths   weight=0.20
 *   4. reasoningKeywords  — analysis/explanation vocabulary         weight=0.25
 *   5. cotIndicators      — chain-of-thought markers                weight=0.05
 *   6. lengthBonus        — sentence count signal                   weight=0.05
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

    // Weighted sum
    const score = clamp(
      tokenCountScore * 0.15 +
      questionComplexity * 0.25 +
      technicalDensity * 0.2 +
      reasoningKeywords * 0.2 +
      cotIndicators * 0.1 +
      lengthBonus * 0.1,
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
      },
    };
  }
}

/** Map a complexity score to a routing tier. */
export function scoreTier(score: number, config?: import("../types.js").LokaFlowConfig): RoutingTier {
  const localThresh = config?.router?.complexityLocalThreshold ?? 0.35;
  const cloudThresh = config?.router?.complexityCloudThreshold ?? 0.65;

  if (score < localThresh) return "local";
  if (score < cloudThresh) return "specialist";
  return "cloud";
}
