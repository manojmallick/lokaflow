// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaSwap™ — lokaflow.io

// Exchange rates are governance-controlled
// Initial rates (at cooperative launch):

export const INITIAL_CONVERSION_RATES: Record<string, { inputMultiplier: number; outputMultiplier: number }> = {
    // How many LokaCredits per 1M API tokens for each provider
    // (after accounting for negotiated group discount)
    // 1 LokaCredit = 1 community compute token
    'anthropic_sonnet': {
        inputMultiplier: 1_250_000,
        outputMultiplier: 5_000_000,   // 5M LokaCredits per 1M output tokens consumed
    },
    'openai_gpt4o': {
        inputMultiplier: 1_125_000,
        outputMultiplier: 4_500_000,
    },
    'google_gemini_flash': {
        inputMultiplier: 125_000,
        outputMultiplier: 500_000,
    }
};

export class CreditConverter {
    constructor(private rates: Record<string, { inputMultiplier: number; outputMultiplier: number }> = INITIAL_CONVERSION_RATES) { }

    // How many LokaCredits does this API request cost?
    calculateCost(provider: string, inputTokens: number, outputTokens: number): number {
        const rate = this.rates[provider];
        if (!rate) throw new Error(`[LokaSwap] No conversion rate set for provider ${provider}`);

        // All monetary operations must be in integer token units
        const cost = (inputTokens * rate.inputMultiplier / 1_000_000) + (outputTokens * rate.outputMultiplier / 1_000_000);
        return Math.ceil(cost); // Always round up to ensure the cooperative never loses fractions
    }

    // How many API credits can the member buy with their LokaCredits?
    calculatePurchasableCredits(lokaCreditsBudget: number, provider: string): number {
        const rate = this.rates[provider];
        if (!rate) throw new Error(`[LokaSwap] No conversion rate set for provider ${provider}`);

        return Math.floor((lokaCreditsBudget / rate.outputMultiplier) * 1_000_000);
    }
}
