// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaRoute™ — lokaflow.io

import { describe, it, expect } from "vitest";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { rmSync } from "fs";

describe("SavingsTracker", () => {
    it("creates tables and records a route decision", async () => {
        const dbPath = join(tmpdir(), `test-route-${Date.now()}.db`);

        // Dynamic import
        const { SavingsTracker } = await import("../../src/tracker/savings-tracker.js");

        try {
            const tracker = new SavingsTracker(dbPath);
            expect(tracker).toBeDefined();

            tracker.record({
                id: randomUUID(),
                timestamp: new Date().toISOString(),
                queryTokensEstimate: 450,
                tier: "local-capable",
                modelUsed: "mistral:7b",
                actualCostUsd: 0.0,
                alternativeCostUsd: 0.015,
                savedUsd: 0.015,
                latencyMs: 3500,
                classifierScore: 0.42,
                localAvailable: true,
                reason: "Mock test"
            });

            const summary = tracker.monthToDateSummary();
            expect(summary.totalQueries).toBe(1);
            expect(summary.localQueries).toBe(1);
            expect(summary.cloudQueries).toBe(0);
            expect(summary.totalSavedUsd).toBeCloseTo(0.015);
        } finally {
            // Cleanup test DB
            try { rmSync(dbPath, { force: true }); } catch (e) { }
        }
    });
});
