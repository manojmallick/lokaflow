// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaRoute™ — lokaflow.io

import type { RoutingTier } from "./classification.js";

/** Per-day rollup for dashboard sparklines. */
export interface DailySummary {
  date: string; // YYYY-MM-DD
  totalQueries: number;
  localQueries: number;
  cloudQueries: number;
  actualCostUsd: number;
  savedUsd: number;
}

/** Percentage breakdown of queries per tier for a period. */
export interface TierDistribution {
  [tier: string]: { count: number; pct: number };
}

/** Per-query learning feedback. */
export type FeedbackSignal = "insufficient" | "overkill";

/** Stored as a row in route.db — query TEXT never stored (privacy). */
export interface LearningRecord {
  id: string;
  timestamp: string;
  tokenCount: number;
  classifierScore: number;
  tier: RoutingTier;
  feedback: FeedbackSignal;
}

/**
 * Personalised thresholds derived from the user's correction history.
 * Confidence starts at 0 (no data) and approaches 1 after ~100 corrections.
 */
export interface UserClassificationBaseline {
  confidenceScore: number; // 0–1
  adjustments: Partial<Record<RoutingTier, number>>; // additive score delta per tier
}
