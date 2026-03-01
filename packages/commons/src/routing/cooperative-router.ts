// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaCommons™ — lokaflow.io

import { CreditLedger, InsufficientCreditsError } from "../credits/ledger.js";
import { CommonsRegistry, NodeSelector } from "../registry/registry.js";
import { CooperativeInferenceRequest, NodeCapacityReport } from "../types/routing.js";

export class NoAvailableNodesError extends Error {
    constructor() {
        super("[LokaCommons] No available nodes on the network matching your requirements.");
    }
}

// Fixed rates for the test
const RATES = {
    earning: { outputTokenGenerated: 1, inputTokenProcessed: 0.25 },
    spending: { outputTokenConsumed: 1.1, inputTokenConsumed: 0.3 }
};

export class CooperativeRouter {
    private selector = new NodeSelector();

    constructor(
        private registry: CommonsRegistry,
        private ledger: CreditLedger
    ) { }

    estimateCreditCost(request: CooperativeInferenceRequest): number {
        return (request.estimatedOutputTokens * RATES.spending.outputTokenConsumed) +
            (request.estimatedInputTokens * RATES.spending.inputTokenConsumed);
    }

    async route(request: CooperativeInferenceRequest): Promise<NodeCapacityReport> {
        // 1. Check requester has sufficient credits
        const balance = await this.ledger.getBalance(request.memberId);
        const estimatedCost = this.estimateCreditCost(request);

        if (balance < estimatedCost) {
            throw new InsufficientCreditsError(balance, estimatedCost);
        }

        // 2. Reserve credits (prevent double-spend)
        await this.ledger.record({
            memberId: request.memberId,
            type: 'reserve',
            amount: -estimatedCost,
            memo: `Reserved for ${request.model} inference`
        });

        // 3. Find best available node
        const nodes = await this.registry.getAvailableNodes({
            modelRequired: request.model,
            dataResidencyRegion: request.requiredRegion,  // GDPR-relevant
            minTokensPerSecond: request.latencyRequirement === 'interactive' ? 5 : 1,
            maxBatteryStressScore: 60,
        });

        if (nodes.length === 0) {
            // Return reserved credits if routing failed
            await this.ledger.record({
                memberId: request.memberId,
                type: 'release',
                amount: estimatedCost,
                memo: `Released inference reservation (no nodes available)`
            });
            throw new NoAvailableNodesError();
        }

        // 4. Select by quality score: speed × reputation × battery health
        return this.selector.selectBest(nodes);
    }
}
