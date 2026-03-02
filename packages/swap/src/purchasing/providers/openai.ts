// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaSwap™ — lokaflow.io

import { ApiProviderIntegration, ProviderBalance, ProviderRate } from "./base.js";

// Current OpenAI pay-as-you-go rates (USD/1M tokens) — update quarterly
const OPENAI_RATES: Record<string, { input: number; output: number }> = {
  "gpt-4o":           { input: 2.50, output: 10.00 },
  "gpt-4o-mini":      { input: 0.15, output:  0.60 },
  "gpt-4-turbo":      { input: 10.00, output: 30.00 },
  "o1":               { input: 15.00, output: 60.00 },
  "o3-mini":          { input: 1.10, output:  4.40 },
  "default":          { input: 2.50, output: 10.00 },
};

/**
 * OpenAIProvider — manages the cooperative's OpenAI API credit account.
 *
 * Enterprise volume deals with OpenAI typically include:
 * - 30–50% discount on gpt-4o / gpt-4o-mini
 * - Committed-use discounts for 12-month agreements
 * - Priority queue during peak demand
 */
export class OpenAIProvider implements ApiProviderIntegration {
  readonly provider = "openai" as const;
  readonly displayName = "OpenAI (GPT-4o)";

  constructor(private readonly apiKey: string) {}

  async getBalance(): Promise<ProviderBalance> {
    try {
      const response = await fetch("https://api.openai.com/v1/dashboard/billing/credit_grants", {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      if (response.ok) {
        const data: any = await response.json();
        const available = data?.total_available ?? 0;
        return {
          provider: "openai",
          balance: available,
          unit: "usd",
          fetchedAt: new Date().toISOString(),
          expiresAt: data?.grants?.[0]?.expires_at,
        };
      }
    } catch {
      // Fall through
    }

    return {
      provider: "openai",
      balance: -1,
      unit: "usd",
      fetchedAt: new Date().toISOString(),
    };
  }

  async validateKey(): Promise<boolean> {
    try {
      const response = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async getStandardRate(model?: string): Promise<ProviderRate> {
    const key = model ?? "default";
    const rates = OPENAI_RATES[key] ?? OPENAI_RATES["default"]!;
    return {
      provider: "openai",
      model: key,
      inputPerMToken: rates.input,
      outputPerMToken: rates.output,
      fetchedAt: new Date().toISOString(),
    };
  }

  async estimateTokens(eurBudget: number, model?: string): Promise<number> {
    const rate = await this.getStandardRate(model);
    const eurPerToken = (rate.outputPerMToken * 1.1) / 1_000_000;
    return eurPerToken > 0 ? Math.floor(eurBudget / eurPerToken) : 0;
  }
}
