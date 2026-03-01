// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaSwap™ — lokaflow.io

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DemandAggregator } from "../../src/purchasing/demand-aggregator.js";
import { PoolUsageTracker } from "../../src/pools/pool.js";
import Database from "better-sqlite3";
import { unlinkSync } from "fs";

describe("DemandAggregator", () => {
    let db: Database.Database;
    let aggregator: DemandAggregator;

    beforeEach(() => {
        db = new Database("./swap.purchasing.test.db");
        aggregator = new DemandAggregator(db);
    });

    afterEach(() => {
        db.close();
        try { unlinkSync("./swap.purchasing.test.db"); } catch (e) { }
    });

    it("correctly sums demand across members", async () => {
        aggregator.addPledge({ memberId: 'alice', provider: 'anthropic', estimatedMonthlyTokens: 500_000, maxPricePerMToken: 2.00, commitmentMonths: 3 });
        aggregator.addPledge({ memberId: 'bob', provider: 'anthropic', estimatedMonthlyTokens: 1_200_000, maxPricePerMToken: 1.50, commitmentMonths: 12 });

        const demand = await aggregator.getMonthlyDemand('anthropic');
        expect(demand.totalTokensCommitted).toBe(1_700_000);
        expect(demand.totalMembers).toBe(2);
        expect(demand.tierBreakdown.committed12Month).toBe(1);
        expect(demand.tierBreakdown.committed3Month).toBe(1);
    });

    it("calculates volume weighted blended maximum price", async () => {
        aggregator.addPledge({ memberId: 'alice', provider: 'google', estimatedMonthlyTokens: 100_000, maxPricePerMToken: 2.00, commitmentMonths: 1 });
        aggregator.addPledge({ memberId: 'bob', provider: 'google', estimatedMonthlyTokens: 300_000, maxPricePerMToken: 1.00, commitmentMonths: 1 });

        const demand = await aggregator.getMonthlyDemand('google');
        // Alice: 100k * $2 = $200k. Bob: 300k * $1 = $300k. Total $500k.
        // Total Tokens: 400k. Blended max = $500k / 400k = $1.25.
        expect(demand.blendedMaxPrice).toBe(1.25);
    });
});

describe("PoolUsageTracker", () => {
    let db: Database.Database;
    let tracker: PoolUsageTracker;

    beforeEach(() => {
        db = new Database("./swap.pools.test.db");
        tracker = new PoolUsageTracker(db);
    });

    afterEach(() => {
        db.close();
        try { unlinkSync("./swap.pools.test.db"); } catch (e) { }
    });

    it("prevents member from consuming beyond their allocated tokens", async () => {
        const poolId = tracker.createPool("openai", 1_000_000);
        tracker.allocate(poolId, "charlie", 500_000);

        await expect(tracker.recordUsage(poolId, "charlie", 600_000)).rejects.toThrow();

        await tracker.recordUsage(poolId, "charlie", 400_000);
        expect(await tracker.getMemberRemaining(poolId, "charlie")).toBe(100_000);
    });
});
