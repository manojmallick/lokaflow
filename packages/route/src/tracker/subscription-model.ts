// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaRoute™ — lokaflow.io
//
// packages/route/src/tracker/subscription-model.ts
// Subscription cost modelling — what would you spend if you stayed on a
// paid subscription instead of routing through LokaRoute?

export interface SubscriptionPlan {
  /** Monthly USD cost of the subscription. */
  monthlyUsd: number;
  /** Inclusive queries-per-month limit (0 = unlimited). */
  queryLimit: number;
  /** Human-readable plan name. */
  label: string;
}

/** Well-known SaaS subscription plans (as of H1 2026). */
export const SUBSCRIPTION_PLANS: Record<string, SubscriptionPlan> = {
  "claude-pro": {
    monthlyUsd: 20.0,
    queryLimit: 0, // "unlimited" (rate-limited)
    label: "Anthropic Claude Pro",
  },
  "chatgpt-plus": {
    monthlyUsd: 20.0,
    queryLimit: 0,
    label: "OpenAI ChatGPT Plus",
  },
  "gemini-advanced": {
    monthlyUsd: 19.99,
    queryLimit: 0,
    label: "Google Gemini Advanced",
  },
  "copilot-individual": {
    monthlyUsd: 10.0,
    queryLimit: 0,
    label: "GitHub Copilot Individual",
  },
  "cursor-pro": {
    monthlyUsd: 20.0,
    queryLimit: 500, // 500 fast requests / month
    label: "Cursor Pro",
  },
};

export interface SavingsAnalysis {
  /** Total USD spent via LokaRoute API calls this period. */
  actualSpendUsd: number;
  /** Total USD that equivalent queries would cost on the subscription plan. */
  subscriptionCostUsd: number;
  /** How much money LokaRoute saved (positive = saved, negative = LokaRoute cost more). */
  netSavedUsd: number;
  /** Percentage of queries deflected to local models (no cloud cost). */
  localDeflectionPercent: number;
  /** Whether the user should keep / drop the subscription based on actual usage. */
  keepSubscription: boolean;
  /** Human-readable recommendation. */
  recommendation: string;
}

/**
 * Given actual cloud spend and the number of local + cloud queries run
 * over a period, compute whether the chosen subscription is still worth
 * paying for — or whether LokaRoute has effectively replaced it.
 */
export function calculateSavingsAnalysis(
  actualCloudSpendUsd: number,
  totalQueries: number,
  localQueries: number,
  subscriptionKey: string,
): SavingsAnalysis {
  const plan = SUBSCRIPTION_PLANS[subscriptionKey];
  if (!plan) {
    throw new Error(
      `Unknown subscription plan: "${subscriptionKey}". Known: ${Object.keys(SUBSCRIPTION_PLANS).join(", ")}`,
    );
  }

  const subscriptionCostUsd = plan.monthlyUsd;
  const netSavedUsd = subscriptionCostUsd - actualCloudSpendUsd;
  const localPercent = totalQueries > 0 ? (localQueries / totalQueries) * 100 : 0;
  const keepSubscription = actualCloudSpendUsd > subscriptionCostUsd;

  let recommendation: string;
  if (netSavedUsd >= subscriptionCostUsd * 0.9) {
    recommendation =
      `You're saving ${fmt(netSavedUsd)}/mo vs ${plan.label} — ` +
      `${localPercent.toFixed(0)}% of queries run locally at €0. ` +
      `Cancel your ${plan.label} subscription.`;
  } else if (netSavedUsd > 0) {
    recommendation =
      `LokaRoute saves you ${fmt(netSavedUsd)}/mo vs ${plan.label}. ` +
      `Keep going — local deflection is at ${localPercent.toFixed(0)}%.`;
  } else if (netSavedUsd < 0) {
    recommendation =
      `${plan.label} (${fmt(subscriptionCostUsd)}/mo) would be cheaper than your current API spend ` +
      `(${fmt(actualCloudSpendUsd)}/mo). Consider routing more to local models.`;
  } else {
    recommendation = `Your API spend equals the ${plan.label} subscription cost. Break-even.`;
  }

  return {
    actualSpendUsd: actualCloudSpendUsd,
    subscriptionCostUsd,
    netSavedUsd,
    localDeflectionPercent: localPercent,
    keepSubscription,
    recommendation,
  };
}

function fmt(usd: number): string {
  return `$${usd.toFixed(2)}`;
}
