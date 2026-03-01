// © 2026 LearnHubPlay BV. All rights reserved.
// packages/orchestrator/tests/unit/pipeline.test.ts

import { describe, it, expect } from "vitest";
import { TokenBudgetAllocator } from "../../src/budget/allocator.js";
import { ComplexityMeasurer } from "../../src/complexity/measurer.js";
import { ModelRegistry } from "../../src/models/registry.js";
import type { TaskGraph, TaskNode } from "../../src/types.js";

// ── TokenBudgetAllocator ─────────────────────────────────────────────────────

describe("TokenBudgetAllocator", () => {
    const allocator = new TokenBudgetAllocator();

    it("allocates fairly based on complexity", () => {
        const graph: TaskGraph = {
            planId: "test-1",
            originalQuery: "test",
            criticalPathLength: 1,
            nodes: [
                { id: "A", description: "Easy", dependsOn: [], complexityScore: 0.2, requiredCapabilities: [] },
                { id: "B", description: "Hard", dependsOn: [], complexityScore: 0.8, requiredCapabilities: [] },
            ],
        };

        const allocated = allocator.allocate(graph, 1000);
        const nodeA = allocated.nodes.find(n => n.id === "A")!;
        const nodeB = allocated.nodes.find(n => n.id === "B")!;

        expect(nodeA.budgetTokens).toBeGreaterThan(100);
        expect(nodeB.budgetTokens).toBeGreaterThan(nodeA.budgetTokens!);
        expect(nodeA.budgetTokens! + nodeB.budgetTokens!).toBeLessThanOrEqual(1000);
    });

    it("gives bonus to deeply depended nodes", () => {
        const graph: TaskGraph = {
            planId: "test-2",
            originalQuery: "test",
            criticalPathLength: 2,
            nodes: [
                // Both same complexity, but A is a dependency for B and C
                { id: "A", description: "Base", dependsOn: [], complexityScore: 0.5, requiredCapabilities: [] },
                { id: "B", description: "Leaf 1", dependsOn: ["A"], complexityScore: 0.5, requiredCapabilities: [] },
                { id: "C", description: "Leaf 2", dependsOn: ["A"], complexityScore: 0.5, requiredCapabilities: [] },
            ],
        };

        const allocated = allocator.allocate(graph, 1200);
        const nodeA = allocated.nodes.find(n => n.id === "A")!;
        const nodeB = allocated.nodes.find(n => n.id === "B")!;

        expect(nodeA.budgetTokens).toBeGreaterThan(nodeB.budgetTokens!);
    });
});

// ── ComplexityMeasurer ───────────────────────────────────────────────────────

describe("ComplexityMeasurer", () => {
    const measurer = new ComplexityMeasurer();

    it("rates short simple queries as local_nano", () => {
        const res = measurer.measure([{ role: "user", content: "hello world" }]);
        expect(res.recommendedTier).toBe("local_nano");
    });

    it("detects math keywords and suggests higher tier", () => {
        const res = measurer.measure([{ role: "user", content: "calculate the integral of x^2 solve the probability" }]);
        expect(res.dimensions.math).toBeGreaterThan(0.5);
        expect(["cloud_standard", "cloud_premium"]).toContain(res.recommendedTier);
    });

    it("detects coding blocks", () => {
        const res = measurer.measure([{ role: "user", content: "refactor this:\n```python\ndef foo(): pass\n```" }]);
        expect(res.dimensions.coding).toBeGreaterThan(0.4);
        // Overall score might still be low enough for local_standard or local_large
        expect(["local_standard", "local_large", "cloud_light"]).toContain(res.recommendedTier);
    });
});

// ── ModelRegistry ────────────────────────────────────────────────────────────

describe("ModelRegistry", () => {
    const registry = new ModelRegistry();

    it("finds cheapest capable model", () => {
        // Requires math, standard tier
        const model = registry.findCheapestCapableModel("local_standard", ["math"]);
        expect(model).not.toBeNull();
        // qwen2.5-coder has math and is local_standard, mistral:7b does not have math
        expect(model?.name).toBe("qwen2.5-coder:7b");
    });

    it("upgrades tier if capabilities demand it", () => {
        // Requiring 'vision' forces it up to cloud_light (gemini) or cloud_standard (gpt-4o)
        const model = registry.findCheapestCapableModel("local_nano", ["vision"]);
        expect(model?.tier).not.toBe("local_nano");
        expect(model?.name).toBe("gemini-2.0-flash"); // cheapest with vision
    });

    it("returns null if impossible capability requested", () => {
        const model = registry.findCheapestCapableModel("local_nano", ["time_travel"]);
        expect(model).toBeNull();
    });
});
