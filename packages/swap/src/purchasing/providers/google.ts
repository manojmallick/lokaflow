// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaSwap™ — lokaflow.io

import { ApiProviderIntegration, ProviderBalance, ProviderRate } from "./base.js";

// Current Google AI pay-as-you-go rates (USD/1M tokens) — update quarterly
const GOOGLE_RATES: Record<string, { input: number; output: number }> = {
  "gemini-2.5-pro":        { input: 1.25, output: 10.00 },
  "gemini-2.0-flash":      { input: 0.075, output: 0.30  },
  "gemini-2.0-flash-lite": { input: 0.0375, output: 0.15 },
  "gemini-1.5-pro":        { input: 1.25,  output: 5.00  },
  "default":               { input: 0.075, output: 0.30  },
};

/**
 * GoogleProvider — manages the cooperative's Google AI (Gemini) API account.
 *
 * Enterprise volume deals with Google typically include:
 * - 40–60% discount on Gemini Flash pricing
 * - Dedicated project quota (no shared burst caps)
 * - Option for Vertex AI data residency in EU
 * - Committed-use discounts for 12-month agreements
 */
export class GoogleProvider implements ApiProviderIntegration {
  readonly provider = "google" as const;
  readonly displayName = "Google (Gemini)";

  constructor(private readonly apiKey: string) {}

  async getBalance(): Promise<ProviderBalance> {
    // Google AI Studio does not expose a balance endpoint publicly.
    // For enterprise Vertex AI, billing is via GCP billing API.
    // We return an "unknown" balance and let finance track it manually.
    return {
      provider: "google",
      balance: -1,
      unit: "usd",
      fetchedAt: new Date().toISOString(),
    };
  }

  async validateKey(): Promise<boolean> {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1/models?key=${this.apiKey}`,
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  async getStandardRate(model?: string): Promise<ProviderRate> {
    const key = model ?? "default";
    const rates = GOOGLE_RATES[key] ?? GOOGLE_RATES["default"]!;
    return {
      provider: "google",
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
