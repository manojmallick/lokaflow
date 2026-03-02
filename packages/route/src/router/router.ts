// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaRoute™ — lokaflow.io
//
// packages/route/src/router/router.ts
// RouteDecisionEngine — maps a QueryClassification to a concrete RouteDecision.
// Applies policy overrides, budget guard, and PII gate in that order.

import type { QueryClassification } from "../types/classification.js";
import type { RouteDecision, RoutingTier } from "../types/routing.js";
import { DEFAULT_TIER_MODELS, isLocalTier } from "../types/routing.js";
import type { RoutingPolicy } from "./policy.js";
import { DEFAULT_POLICY, matchPolicyOverride } from "./policy.js";
import type { SavingsTracker } from "../tracker/savings-tracker.js";

export interface RouteDecisionEngineOptions {
  policy?: RoutingPolicy;
  tracker?: SavingsTracker;
  /** Current monthly cloud spend in EUR — checked against budget cap. */
  currentMonthlySpendEur?: () => number;
  /** Override model assignments per tier (from lokaflow.yaml route.tiers). */
  tierModels?: Partial<Record<RoutingTier, { preferred?: string; fallback?: string }>>;
}

export class RouteDecisionEngine {
  private readonly policy: RoutingPolicy;
  private readonly tierModels: Record<RoutingTier, { preferred: string; fallback: string }>;
  private readonly getMonthlySpend: () => number;
  private readonly tracker?: SavingsTracker;

  constructor(opts: RouteDecisionEngineOptions = {}) {
    this.policy = opts.policy ?? DEFAULT_POLICY;
    this.getMonthlySpend = opts.currentMonthlySpendEur ?? (() => 0);
    if (opts.tracker !== undefined) this.tracker = opts.tracker;

    // Merge user overrides over defaults
    const defaults = DEFAULT_TIER_MODELS;
    this.tierModels = {
      "local-trivial": {
        preferred:
          opts.tierModels?.["local-trivial"]?.preferred ?? defaults["local-trivial"].preferred,
        fallback:
          opts.tierModels?.["local-trivial"]?.fallback ?? defaults["local-trivial"].fallback,
      },
      "local-capable": {
        preferred:
          opts.tierModels?.["local-capable"]?.preferred ?? defaults["local-capable"].preferred,
        fallback:
          opts.tierModels?.["local-capable"]?.fallback ?? defaults["local-capable"].fallback,
      },
      "cloud-mid": {
        preferred: opts.tierModels?.["cloud-mid"]?.preferred ?? defaults["cloud-mid"].preferred,
        fallback: opts.tierModels?.["cloud-mid"]?.fallback ?? defaults["cloud-mid"].fallback,
      },
      "cloud-capable": {
        preferred:
          opts.tierModels?.["cloud-capable"]?.preferred ?? defaults["cloud-capable"].preferred,
        fallback:
          opts.tierModels?.["cloud-capable"]?.fallback ?? defaults["cloud-capable"].fallback,
      },
      "cloud-frontier": {
        preferred:
          opts.tierModels?.["cloud-frontier"]?.preferred ?? defaults["cloud-frontier"].preferred,
        fallback:
          opts.tierModels?.["cloud-frontier"]?.fallback ?? defaults["cloud-frontier"].fallback,
      },
    };
  }

  /**
   * Produce a RouteDecision for a given QueryClassification.
   *
   * Precedence:
   *  1. PII detected                   → force local-capable (security gate)
   *  2. RoutingPolicy override match   → respect user rule
   *  3. Budget cap exceeded            → downgrade to local-capable
   *  4. ML classification tier         → use classifier result
   */
  decide(classification: QueryClassification, query: string): RouteDecision {
    // ── Gate 1: PII ──────────────────────────────────────────────────────────
    if (classification.piiDetected) {
      return this.makeDecision("local-capable", classification, "PII gate: forced local");
    }

    // ── Gate 2: Policy override ──────────────────────────────────────────────
    const override = matchPolicyOverride(query, this.policy);
    if (override) {
      return this.makeDecision(override.tier, classification, override.reason, override.reason);
    }

    // ── Gate 3: Budget cap ───────────────────────────────────────────────────
    const spend = this.getMonthlySpend();
    if (spend >= this.policy.monthlyCloudBudgetEur && !isLocalTier(classification.tier)) {
      return this.makeDecision(
        "local-capable",
        classification,
        `budget cap (€${this.policy.monthlyCloudBudgetEur}/mo reached at €${spend.toFixed(2)})`,
      );
    }

    // ── Gate 4: Use classifier result ────────────────────────────────────────
    return this.makeDecision(classification.tier, classification);
  }

  private makeDecision(
    tier: RoutingTier,
    classification: QueryClassification,
    overrideReason?: string,
    policyOverride?: string,
  ): RouteDecision {
    const assignment = this.tierModels[tier];
    return {
      tier,
      model: assignment.preferred,
      fallbackModel: assignment.fallback,
      localOnly: isLocalTier(tier),
      classification: overrideReason
        ? { ...classification, tier, reason: overrideReason }
        : classification,
      ...(policyOverride !== undefined && { policyOverride }),
      ...(classification.piiDetected !== undefined && { piiDetected: classification.piiDetected }),
    };
  }
}
