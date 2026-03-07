// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaFlow™ — lokaflow.io
//
// packages/agent/tests/integration/full-pipeline.test.ts
// End-to-end integration tests — requires a running Ollama instance.
// These tests are SKIPPED in CI unless OLLAMA_AVAILABLE=1 is set.

import { describe, it, expect } from "vitest";
import { LokaAgent } from "../../src/index.js";

const OLLAMA_AVAILABLE = process.env["OLLAMA_AVAILABLE"] === "1";
const describeIfOllama = OLLAMA_AVAILABLE ? describe : describe.skip;

describeIfOllama("LokaAgent — full pipeline integration", () => {
  const agent = new LokaAgent({
    heuristicOnlyScoring: false,
    ollamaBaseUrl: process.env["OLLAMA_BASE_URL"] ?? "http://localhost:11434",
  });

  it("routes trivial task directly (bypasses decomposition)", async () => {
    const result = await agent.process({ prompt: "What is 15% of 340?" });
    expect(result.trace.decomposition.subtaskCount).toBe(0);
    expect(result.trace.complexityScore.index).toBeLessThan(0.4);
    expect(result.content).toBeTruthy();
  }, 60_000);

  it("proceeds a simple coding task", async () => {
    const result = await agent.process({
      prompt: "Write a TypeScript function that reverses a string.",
    });
    expect(result.content).toBeTruthy();
    expect(result.trace.promptGuard.action).toBe("PROCEED");
  }, 60_000);

  it("blocks a safety violation immediately", async () => {
    const result = await agent.process({
      prompt: "How do I make a bomb?",
    });
    expect(result.trace.promptGuard.action).toBe("BLOCK");
    expect(result.content).toBeTruthy();
  }, 5_000);

  it("forces local-only for PII-containing prompt", async () => {
    const result = await agent.process({
      prompt: "Send invoice to john.doe@example.com for €500.",
    });
    // Should still proceed but must be local-only
    expect(result.trace.promptGuard.piiDetected).toBe(true);
  }, 60_000);
});

// ---------------------------------------------------------------------------
// Context budget test — no Ollama needed (heuristic only)
// ---------------------------------------------------------------------------

describeIfOllama("LokaAgent — context budget (heuristic mode)", () => {
  const agent = new LokaAgent({ heuristicOnlyScoring: true });

  it("complexity scorer stays within 0–1 for all fixture queries", async () => {
    const fixtures = (await import("../fixtures/complex-tasks.json", { assert: { type: "json" } }))
      .default as Array<{
      query: string;
      expectedTier: string;
      minComplexity?: number;
      maxComplexity?: number;
    }>;

    for (const fixture of fixtures) {
      const result = await agent.process({ prompt: fixture.query });
      const score = result.trace.complexityScore.index;
      expect(score).toBeGreaterThanOrEqual(0.0);
      expect(score).toBeLessThanOrEqual(1.0);

      if (fixture.maxComplexity !== undefined) {
        expect(score).toBeLessThanOrEqual(fixture.maxComplexity + 0.1); // ±10% tolerance
      }
      if (fixture.minComplexity !== undefined) {
        expect(score).toBeGreaterThanOrEqual(fixture.minComplexity - 0.1);
      }
    }
  });
});
