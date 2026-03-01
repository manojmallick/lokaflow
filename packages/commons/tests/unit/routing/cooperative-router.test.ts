// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaCommons™ — lokaflow.io

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CreditLedger, InsufficientCreditsError } from "../../src/credits/ledger.js";
import { CommonsRegistry } from "../../src/registry/registry.js";
import { CooperativeRouter, NoAvailableNodesError } from "../../src/routing/cooperative-router.js";
import { NodeCapacityReport, CooperativeInferenceRequest } from "../../src/types/routing.js";
import { randomUUID } from "crypto";
import { unlinkSync } from "fs";

describe('CooperativeRouter', () => {
    let ledger: CreditLedger;
    let registry: CommonsRegistry;
    let router: CooperativeRouter;

    beforeEach(() => {
        ledger = new CreditLedger('./commons.routing.test.db');
        registry = new CommonsRegistry();
        router = new CooperativeRouter(registry, ledger);
    });

    afterEach(() => {
        try { unlinkSync('./commons.routing.test.db'); } catch (e) { }
    });

    function makeNode(overrides: Partial<NodeCapacityReport>): NodeCapacityReport {
        return {
            nodeId: overrides.nodeId || randomUUID(),
            memberId: overrides.memberId || 'charlie',
            timestamp: new Date().toISOString(),
            availableModels: overrides.availableModels || ['mistral:7b'],
            tokensPerSecond: overrides.tokensPerSecond || 10,
            queueDepth: overrides.queueDepth || 0,
            maxConcurrentTasks: overrides.maxConcurrentTasks || 1,
            acceptsBatchTasks: overrides.acceptsBatchTasks ?? true,
            dataResidencyRegion: overrides.dataResidencyRegion || 'NL',
            batteryStressScore: overrides.batteryStressScore || 0,
            thermalZone: overrides.thermalZone || 'optimal',
        };
    }

    function makeRequest(overrides: Partial<CooperativeInferenceRequest>): CooperativeInferenceRequest {
        return {
            memberId: overrides.memberId || 'alice',
            model: overrides.model || 'mistral:7b',
            requiredRegion: overrides.requiredRegion,
            latencyRequirement: overrides.latencyRequirement || 'batch',
            estimatedInputTokens: overrides.estimatedInputTokens || 100,
            estimatedOutputTokens: overrides.estimatedOutputTokens || 100
        };
    }

    it('rejects routing if member is broke', async () => {
        // Alice has 0 balance initially
        const req = makeRequest({ memberId: 'alice' });
        await expect(router.route(req)).rejects.toThrow(InsufficientCreditsError);
    });

    it('excludes nodes with high battery stress from selection', async () => {
        await ledger.record({ memberId: 'alice', type: 'governance-grant', amount: 500, memo: 'test' });

        registry.register(makeNode({ nodeId: 'node-stressed', batteryStressScore: 80 })); // should be excluded
        registry.register(makeNode({ nodeId: 'node-cool', batteryStressScore: 30 })); // should be selected

        const req = makeRequest({ memberId: 'alice' });
        const selected = await router.route(req);

        expect(selected.nodeId).toBe('node-cool');
        expect(selected.batteryStressScore).toBe(30);
    });

    it('throws NoAvailableNodesError and gives refund if no models found', async () => {
        await ledger.record({ memberId: 'alice', type: 'governance-grant', amount: 500, memo: 'test' });
        registry.register(makeNode({ availableModels: ['not-the-right-model'] }));

        const req = makeRequest({ memberId: 'alice', model: 'llama3:8b' });
        await expect(router.route(req)).rejects.toThrow(NoAvailableNodesError);

        // Confirm credit balance returned back up to 500 after the internal 'reserve'/'release' cycle
        expect(await ledger.getBalance('alice')).toBe(500);
    });

    it('enforces GDPR EU residency requirement routing blocks', async () => {
        await ledger.record({ memberId: 'alice', type: 'governance-grant', amount: 500, memo: 'test' });

        registry.register(makeNode({ nodeId: 'node-us', dataResidencyRegion: 'US' }));
        registry.register(makeNode({ nodeId: 'node-nl', dataResidencyRegion: 'NL' }));

        const req = makeRequest({ memberId: 'alice', requiredRegion: 'NL' });
        const selected = await router.route(req);

        expect(selected.nodeId).toBe('node-nl'); // The 'node-us' should be skipped entirely
    });
});
