// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaSwap™ — lokaflow.io

/**
 * ApiProviderIntegration — standard interface for managing API credits
 * with Anthropic, OpenAI, and Google.
 *
 * Each provider implements this to: check current credit balance,
 * verify whether the cooperative's negotiated enterprise key is valid,
 * and retrieve the current pay-as-you-go rate for comparison.
 */
export interface ApiProviderIntegration {
  readonly provider: "anthropic" | "openai" | "google";
  readonly displayName: string;

  /**
   * Check current credit balance on the cooperative account.
   * Returns tokens remaining (or EUR equivalent for providers that use money).
   */
  getBalance(): Promise<ProviderBalance>;

  /**
   * Validate that the cooperative API key is working.
   */
  validateKey(): Promise<boolean>;

  /**
   * Retrieve the current pay-as-you-go pricing for the model tier.
   * Used to compare against our negotiated rate.
   */
  getStandardRate(model?: string): Promise<ProviderRate>;

  /**
   * Estimate tokens available given a EUR budget.
   */
  estimateTokens(eurBudget: number, model?: string): Promise<number>;
}

export interface ProviderBalance {
  provider: "anthropic" | "openai" | "google";
  /** Available balance; interpretation varies by provider */
  balance: number;
  /** "tokens" | "usd" | "eur" */
  unit: string;
  /** ISO 8601 timestamp when this was fetched */
  fetchedAt: string;
  /** When the credits expire (if applicable) */
  expiresAt?: string;
}

export interface ProviderRate {
  provider: "anthropic" | "openai" | "google";
  model: string;
  /** USD/1M input tokens */
  inputPerMToken: number;
  /** USD/1M output tokens */
  outputPerMToken: number;
  fetchedAt: string;
}
