// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
//
// packages/audit/src/engine/engine.ts
// AuditEngine — analyzes the parsed ExportData using the ComplexityMeasurer
// to figure out how many queries could have been handled locally for free,
// and how much the remaining cloud queries would cost via API instead of a monthly sub.

import type { AuditReport, ExportData } from "../types.js";

// We dynamically import Orchestrator's ComplexityMeasurer to reuse its 6-dimensional scoring
type ComplexityMeasurerType = import("../../../orchestrator/src/complexity/measurer.js").ComplexityMeasurer;

export class AuditEngine {
    private measurer: ComplexityMeasurerType | null = null;

    async analyze(data: ExportData, subscriptionEur: number = 22.99 /* ~ $20 + VAT */): Promise<AuditReport> {
        if (!this.measurer) {
            try {
                const mod = await import("../../../orchestrator/src/complexity/measurer.js");
                this.measurer = new mod.ComplexityMeasurer();
            } catch (err) {
                throw new Error("LokaOrchestrator package is required for AuditEngine. Is it built?");
            }
        }

        if (data.conversations.length === 0) {
            throw new Error("No conversations found in export geometry.");
        }

        // Find the total time span to establish the "periodDays"
        let minTime = Number.MAX_SAFE_INTEGER;
        let maxTime = 0;

        let totalTokensEstimated = 0;
        let totalMessages = 0;
        let complexCount = 0;
        let simpleCount = 0;

        // Hardcoded API usage estimates for cost modeling
        // Assuming Sonnet/GPT-4o standard tier pricing: €0.0028/1k in, €0.014/1k out
        const CLOUD_COST_PER_PROMPT_TOKEN = 0.000_003;
        const CLOUD_COST_PER_COMP_TOKEN = 0.000_014;

        let totalApiCostEur = 0;

        for (const conv of data.conversations) {
            if (conv.createTimeMs < minTime) minTime = conv.createTimeMs;
            if (conv.updateTimeMs > maxTime) maxTime = conv.updateTimeMs;

            // Group messages by turn (User -> Assistant)
            for (let i = 0; i < conv.messages.length; i++) {
                const msg = conv.messages[i];
                if (msg.role !== "user") continue;

                totalMessages++;

                // Rough token estimate (letters / 4)
                const promptTokens = Math.ceil(msg.content.length / 4);
                let compTokens = 0;

                // Find trailing assistant response lengths
                let j = i + 1;
                let assistantText = "";
                while (j < conv.messages.length && conv.messages[j]!.role === "assistant") {
                    assistantText += conv.messages[j]!.content;
                    j++;
                }
                compTokens = Math.ceil(assistantText.length / 4);
                totalTokensEstimated += (promptTokens + compTokens);

                // Measure complexity of this turn
                const profile = this.measurer!.measure([{ role: "user", content: msg.content }]);

                if (profile.overallScore < 0.35) {
                    // Simple local query — €0.00 cost locally
                    simpleCount++;
                } else {
                    // Complex query requiring cloud
                    complexCount++;
                    totalApiCostEur += (promptTokens * CLOUD_COST_PER_PROMPT_TOKEN) + (compTokens * CLOUD_COST_PER_COMP_TOKEN);
                }
            }
        }

        const periodDays = Math.max(1, Math.ceil((maxTime - minTime) / (1000 * 60 * 60 * 24)));

        // Extrapolate API cost to a monthly figure for comparison
        const monthlyApiCostEur = (totalApiCostEur / periodDays) * 30.4;

        const monthlySavingsEur = subscriptionEur - monthlyApiCostEur;
        const canCancel = monthlySavingsEur > 0;

        let reasoning = "";
        if (canCancel) {
            const pct = Math.round((simpleCount / totalMessages) * 100);
            reasoning = `${pct}% of your queries (${simpleCount}) are simple and can be handled locally for free. The remaining ${complexCount} complex queries would cost ~€${monthlyApiCostEur.toFixed(2)}/mo via API, saving you €${monthlySavingsEur.toFixed(2)}/mo compared to your current €${subscriptionEur} subscription.`;
        } else {
            reasoning = `You are a heavy user of complex queries. Routing those through LokaFlow API would cost ~€${monthlyApiCostEur.toFixed(2)}/mo, which is more than your €${subscriptionEur} subscription. Keep your current plan.`;
        }

        return {
            provider: data.provider,
            periodDays,
            totalConversations: data.conversations.length,
            totalUserMessages: totalMessages,
            totalTokensEstimated,
            complexQueriesCount: complexCount,
            simpleQueriesCount: simpleCount,
            currentMonthlySubscriptionEur: subscriptionEur,
            lokaflowEquivalentCostEur: Number(monthlyApiCostEur.toFixed(2)),
            monthlySavingsEur: Number(monthlySavingsEur.toFixed(2)),
            canCancel,
            reasoning,
        };
    }
}
