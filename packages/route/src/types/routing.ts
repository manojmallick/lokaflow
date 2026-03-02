// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaRoute™ — lokaflow.io

import type { RoutingTier, QueryClassification } from "./classification.js";

export type { RoutingTier } from "./classification.js";

/** Default model pair for each tier. Configurable via lokaflow.yaml. */
export interface ModelAssignment {
  preferred: string;
  fallback: string;
  localOnly: boolean;
}

/** The routing decision produced by RouteDecisionEngine. */
export interface RouteDecision {
  tier: RoutingTier;
  model: string;
  fallbackModel: string;
  localOnly: boolean;
  classification: QueryClassification;
  /** Set if a RoutingPolicy override forced a different tier. */
  policyOverride?: string;
  /** Propagated from classification — relevant for proxy to skip cloud. */
  piiDetected?: boolean;
}

/** A single pattern-based policy override from config. */
export interface PolicyOverride {
  pattern: RegExp | string;
  forceTier: RoutingTier;
  reason: string;
}

/** User routing preferences loaded from lokaflow.yaml. */
export interface RoutingPolicy {
  forceLocal: boolean;
  monthlyCloudBudgetEur: number;
  optimiseFor: "speed" | "cost" | "balanced";
  overrides: PolicyOverride[];
}

/** Default model assignments per tier. */
export const DEFAULT_TIER_MODELS: Record<RoutingTier, ModelAssignment> = {
  "local-trivial": {
    preferred: "tinyllama:1.1b",
    fallback: "phi3:mini",
    localOnly: true,
  },
  "local-capable": {
    preferred: "mistral:7b",
    fallback: "llama3.2:3b",
    localOnly: true,
  },
  "cloud-mid": {
    preferred: "gemini-2.0-flash",
    fallback: "claude-haiku-3-5",
    localOnly: false,
  },
  "cloud-capable": {
    preferred: "claude-sonnet-4",
    fallback: "gpt-4o-mini",
    localOnly: false,
  },
  "cloud-frontier": {
    preferred: "claude-sonnet-4",
    fallback: "gpt-4o",
    localOnly: false,
  },
};

/** Tier score thresholds. */
export const TIER_THRESHOLDS: Array<{ min: number; max: number; tier: RoutingTier }> = [
  { min: 0.0, max: 0.35, tier: "local-trivial" },
  { min: 0.35, max: 0.55, tier: "local-capable" },
  { min: 0.55, max: 0.7, tier: "cloud-mid" },
  { min: 0.7, max: 0.85, tier: "cloud-capable" },
  { min: 0.85, max: 1.01, tier: "cloud-frontier" },
];

/** Map a 0–1 score to its routing tier. */
export function scoreToTier(score: number): RoutingTier {
  for (const { min, max, tier } of TIER_THRESHOLDS) {
    if (score >= min && score < max) return tier;
  }
  return "cloud-frontier";
}

/** True if a tier routes to local infrastructure only. */
export function isLocalTier(tier: RoutingTier): boolean {
  return tier === "local-trivial" || tier === "local-capable";
}
