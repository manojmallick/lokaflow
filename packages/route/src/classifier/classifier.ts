// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaRoute™ — lokaflow.io
//
// packages/route/src/classifier/classifier.ts
// QueryClassifier — the hot-path routing brain.
// All public methods are synchronous and must resolve in < 5ms.

import type { QueryClassification, QueryContext } from "../types/classification.js";
import { scoreToTier } from "../types/routing.js";
import { RuleEngine } from "./rules.js";
import { FeatureExtractor, computeCompositeScore } from "./features.js";
import type { PersonalisedLearner } from "./learner.js";
import type { PIIScanner } from "@lokaflow/core";

export interface ClassifierOptions {
  /** Bias toward local ("aggressive") or cloud ("conservative"). Default: "balanced". */
  sensitivity?: "conservative" | "balanced" | "aggressive";
  learner?: PersonalisedLearner;
  piiScanner?: PIIScanner;
}

const SENSITIVITY_DELTA: Record<NonNullable<ClassifierOptions["sensitivity"]>, number> = {
  conservative: 0.05, // nudge scores up → more cloud routing
  balanced: 0.0,
  aggressive: -0.05, // nudge scores down → more local routing
};

export class QueryClassifier {
  private readonly rules: RuleEngine;
  private readonly extractor: FeatureExtractor;
  private readonly sensitivity: "conservative" | "balanced" | "aggressive";
  private readonly learner?: PersonalisedLearner;
  private readonly piiScanner?: PIIScanner;

  constructor(opts: ClassifierOptions = {}) {
    this.rules = new RuleEngine();
    this.extractor = new FeatureExtractor();
    this.sensitivity = opts.sensitivity ?? "balanced";
    if (opts.learner !== undefined) this.learner = opts.learner;
    if (opts.piiScanner !== undefined) this.piiScanner = opts.piiScanner;
  }

  /**
   * Classify a query. Synchronous, < 5ms per call.
   *
   * Priority order:
   *  1. PII detected → force local-capable (privacy gate)
   *  2. Rule match   → deterministic tier
   *  3. ML scoring   → weighted feature composite
   */
  classify(query: string, ctx: QueryContext = {}): QueryClassification {
    // ── 1. PII check (synchronous scan using core's sync API) ────────────────
    let piiDetected = false;
    if (this.piiScanner) {
      try {
        const result = this.piiScanner.scanSync(query);
        if (result.containsPii) {
          piiDetected = true;
          return {
            tier: "local-capable",
            score: 0.45,
            features: this.extractor.extract(query, ctx),
            reason: "PII detected — forced to local tier",
            piiDetected: true,
          };
        }
      } catch {
        // PII scanner failure is non-fatal — continue with normal classification
      }
    }

    // ── 2. Rule engine (regex pre-filter) ────────────────────────────────────
    const ruleResult = this.rules.match(query);
    if (ruleResult) {
      const adjScore = Math.max(
        0,
        Math.min(ruleResult.score + SENSITIVITY_DELTA[this.sensitivity], 1),
      );
      return { ...ruleResult, score: adjScore, tier: scoreToTier(adjScore), piiDetected };
    }

    // ── 3. ML scoring ────────────────────────────────────────────────────────
    const userBaseline = this.learner?.currentBaseline() ?? 0.5;
    const features = this.extractor.extract(query, { ...ctx, userBaseline });

    let score = computeCompositeScore(features);

    // Apply personalised learner delta first
    if (this.learner) {
      score = this.learner.adjustScore(score);
    }

    // Apply sensitivity bias
    score = Math.max(0, Math.min(score + SENSITIVITY_DELTA[this.sensitivity], 1));

    const tier = scoreToTier(score);
    const reason = buildReason(tier, score, features);

    return { tier, score, features, reason, piiDetected };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildReason(
  tier: string,
  score: number,
  f: ReturnType<FeatureExtractor["extract"]>,
): string {
  const drivers: string[] = [];
  if (f.regulatoryKeywords) drivers.push("regulatory domain");
  if (f.imperativeComplexity >= 0.65) drivers.push("complex task verb");
  if (f.questionDepth >= 0.7) drivers.push("deep analytical question");
  if (f.multiPartDetected) drivers.push("multi-part request");
  if (f.technicalTermDensity >= 0.5) drivers.push("high technical density");
  if (f.outputFormatRequested) drivers.push("structured output required");
  if (f.lengthRequested) drivers.push("long/detailed output requested");
  if (f.codeDetected) drivers.push("code present");
  const driverStr = drivers.length ? drivers.join(", ") : "baseline heuristics";
  return `score ${score.toFixed(2)} → ${tier} (${driverStr})`;
}
