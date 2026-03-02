// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaSwap™ — lokaflow.io

import { ApiProviderIntegration, ProviderBalance, ProviderRate } from "./base.js";

// Current Anthropic pay-as-you-go rates (USD/1M tokens) — update quarterly
const ANTHROPIC_RATES: Record<string, { input: number; output: number }> = {
  "claude-opus-4": { input: 15.0, output: 75.0 },
  "claude-sonnet-4": { input: 3.0, output: 15.0 },
  "claude-haiku-3.5": { input: 0.8, output: 4.0 },
  default: { input: 3.0, output: 15.0 },
};

/**
 * AnthropicProvider — manages the cooperative's Anthropic API credit account.
 *
 * Enterprise volume deals with Anthropic typically provide:
 * - 40–60% discount vs pay-as-you-go
 * - Dedicated rate limits (no throttling during peak hours)
 * - Priority support channel
 * - Optional European data residency
 */
export class AnthropicProvider implements ApiProviderIntegration {
  readonly provider = "anthropic" as const;
  readonly displayName = "Anthropic (Claude)";

  constructor(private readonly apiKey: string) {}

  async getBalance(): Promise<ProviderBalance> {
    try {
      const response = await fetch("https://api.anthropic.com/v1/usage", {
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
      });

      if (response.ok) {
        const data: any = await response.json();
        return {
          provider: "anthropic",
          balance: data?.remaining_tokens ?? 0,
          unit: "tokens",
          fetchedAt: new Date().toISOString(),
          expiresAt: data?.expires_at,
        };
      }
    } catch {
      // API may not support balance endpoint — fall through
    }

    // Fallback: return unknown balance
    return {
      provider: "anthropic",
      balance: -1, // -1 = unknown
      unit: "tokens",
      fetchedAt: new Date().toISOString(),
    };
  }

  async validateKey(): Promise<boolean> {
    try {
      const response = await fetch("https://api.anthropic.com/v1/models", {
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async getStandardRate(model?: string): Promise<ProviderRate> {
    const key = model ?? "default";
    const rates = ANTHROPIC_RATES[key] ?? ANTHROPIC_RATES["default"]!;
    return {
      provider: "anthropic",
      model: key,
      inputPerMToken: rates.input,
      outputPerMToken: rates.output,
      fetchedAt: new Date().toISOString(),
    };
  }

  async estimateTokens(eurBudget: number, model?: string): Promise<number> {
    // Use output token rate as the binding constraint
    const rate = await this.getStandardRate(model);
    const eurPerToken = (rate.outputPerMToken * 1.1) / 1_000_000; // USD ≈ EUR +10% buffer
    return eurPerToken > 0 ? Math.floor(eurBudget / eurPerToken) : 0;
  }
}
