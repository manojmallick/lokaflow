// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaRoute™ — lokaflow.io

// ── Types ────────────────────────────────────────────────────────────────────
export type {
  RoutingTier,
  ClassifierFeatures,
  QueryContext,
  QueryClassification,
} from "./types/classification.js";
export type {
  ModelAssignment,
  RouteDecision,
  PolicyOverride,
  RoutingPolicy,
} from "./types/routing.js";
export { DEFAULT_TIER_MODELS, TIER_THRESHOLDS, scoreToTier, isLocalTier } from "./types/routing.js";
export type {
  DailySummary,
  TierDistribution,
  FeedbackSignal,
  LearningRecord,
  UserClassificationBaseline,
} from "./types/tracking.js";

// ── Classifier ───────────────────────────────────────────────────────────────
export { QueryClassifier } from "./classifier/classifier.js";
export { FeatureExtractor, SIGNAL_WEIGHTS, computeCompositeScore } from "./classifier/features.js";
export { RuleEngine } from "./classifier/rules.js";
export { PersonalisedLearner } from "./classifier/learner.js";

// ── Router ───────────────────────────────────────────────────────────────────
export { RouteDecisionEngine } from "./router/router.js";
export { FallbackChain } from "./router/fallback.js";
export { buildPolicy, DEFAULT_POLICY, matchPolicyOverride } from "./router/policy.js";

// ── Proxy ────────────────────────────────────────────────────────────────────
export { ProxyServer } from "./proxy/server.js";
export { StreamRelay } from "./proxy/stream-relay.js";
export { interceptRequest, buildForwardBody, buildRoutingHeaders } from "./proxy/interceptor.js";
export { normaliseRequest, normaliseResponse } from "./proxy/openai-compat.js";
export type {
  CanonicalChatRequest,
  CanonicalChatResponse,
  CanonicalMessage,
} from "./proxy/openai-compat.js";

// ── Tracker ──────────────────────────────────────────────────────────────────
export { SavingsTracker } from "./tracker/savings-tracker.js";
export { SavingsReport } from "./tracker/report.js";
export { SUBSCRIPTION_PLANS, calculateSavingsAnalysis } from "./tracker/subscription-model.js";
export type { RouteRecord, SavingsSummary } from "./tracker/savings-tracker.js";
export type { DailyTotal, TierBreakdown, ReportData } from "./tracker/report.js";
export type { SubscriptionPlan, SavingsAnalysis } from "./tracker/subscription-model.js";

// ── Dashboard ────────────────────────────────────────────────────────────────
export { DashboardServer } from "./dashboard/server.js";
export type { DashboardConfig } from "./dashboard/server.js";
