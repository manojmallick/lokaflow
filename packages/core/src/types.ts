// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// Free for personal/non-commercial use.
// Commercial use: legal@learnhubplay.com

/**
 * Core shared types for LokaFlow™.
 * All LLM providers, the router, and the CLI operate on these types.
 */

import type { BaseProvider } from "./providers/base.js";

export type MessageRole = "user" | "assistant" | "system";

export interface Message {
  role: MessageRole;
  content: string;
}

export interface CompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  onStream?: (chunk: string) => void;
}

/** Normalised response returned by every provider. */
export interface LLMResponse {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Cost in EUR. 0.0 for local models. */
  costEur: number;
  latencyMs: number;
}

export type RoutingTier = "local" | "specialist" | "cloud" | "delegated";

/** JSON structure returned by the Specialist planner. */
export interface ExecutionPlan {
  subtasks: string[];
}
export type RoutingReason =
  | "pii_detected"
  | "token_limit"
  | "low_complexity"
  | "medium_complexity"
  | "high_complexity"
  | "budget_exceeded"
  | "forced_local"
  | "forced_cloud"
  | "provider_unavailable"
  | "search_augmented";

/** A single result returned by the search pipeline. */
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  /** Relevance score assigned by the LocalFilter (0–10). Present after filtering. */
  score?: number;
}

export interface RouterProviders {
  local: BaseProvider[];
  cloud: BaseProvider;
  specialist?: BaseProvider;
}

export interface RoutingDecision {
  tier: RoutingTier;
  model: string;
  reason: RoutingReason;
  complexityScore: number;
  response: LLMResponse;
}

/** Full configuration schema — loaded from lokaflow.yaml */
export interface LokaFlowConfig {
  router: {
    complexityLocalThreshold: number;
    complexityCloudThreshold: number;
    maxLocalTokens: number;
    piiScan: boolean;
    piiAction: "force_local" | "redact" | "block";
    fallbackToLocal: boolean;
    specialistProvider?: string;
    specialistModel?: string;
  };
  budget: {
    dailyEur: number;
    monthlyEur: number;
    warnAtPercent: number;
  };
  local: {
    provider: "ollama";
    baseUrls: string[];
    defaultModel: string;
    timeoutSeconds: number;
  };
  specialist?: {
    provider: string;
    model: string;
  };
  cloud: {
    primary: string;
    fallback: string;
    claudeModel: string;
    openaiModel: string;
    geminiModel: string;
    groqModel: string;
    mistralModel?: string;
    togetherModel?: string;
    perplexityModel?: string;
    azureDeployment?: string;
    cohereModel?: string;
  };
  privacy: {
    telemetry: boolean;
    logQueries: boolean;
    logLevel: "DEBUG" | "INFO" | "WARNING" | "ERROR";
  };
  output: {
    showRoutingDecision: boolean;
    showCost: boolean;
    showSavings: boolean;
    stream: boolean;
  };
  search: {
    enabled: boolean;
    maxResults: number;
    braveEnabled: boolean;
    arxivEnabled: boolean;
    /** Minimum LocalFilter score (0–10) to keep a result. */
    filterThreshold: number;
  };
  memory: {
    enabled: boolean;
    /** Maximum entries to retrieve for context per query. */
    topK: number;
    /** Session ID — used to scope memory per user/project. */
    sessionId: string;
  };
}
