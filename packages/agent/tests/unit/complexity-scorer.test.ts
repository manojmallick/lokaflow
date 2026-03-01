// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaFlow™ — lokaflow.io

import { describe, it, expect } from "vitest";
import { ComplexityScorer } from "../../src/pipeline/complexity-scorer.js";
import type { IntentProfile } from "../../src/types/agent.js";

const mockIntent: IntentProfile = {
  primaryGoal: "test",
  outputType: "ANSWER",
  requiredSections: [],
  domainHints: [],
  qualityRequirement: "BALANCED",
  estimatedComplexity: 0.3,
  preserveOriginalPrompt: "test",
};

describe("ComplexityScorer (heuristic mode)", () => {
  // Always use heuristic-only mode in unit tests (no Ollama dependency)
  const scorer = new ComplexityScorer({
    scorerModel: "ollama:qwen2.5:7b",
    heuristicOnlyMode: true,
    heuristicConfidenceThreshold: 0.8,
    ollamaBaseUrl: "http://localhost:11434",
  });

  it("scores trivial arithmetic as low complexity", async () => {
    const result = await scorer.score("What is 15% of 340?", mockIntent);
    expect(result.index).toBeLessThan(0.4);
  });

  it("scores a simple factual question as low complexity", async () => {
    const result = await scorer.score("What is the capital of France?", mockIntent);
    expect(result.index).toBeLessThan(0.4);
  });

  it("scores a complex analysis task as high complexity", async () => {
    const result = await scorer.score(
      "Analyse our DORA compliance gaps and compare the trade-offs between alternative remediation strategies.",
      { ...mockIntent, domainHints: ["regulatory"] },
    );
    expect(result.index).toBeGreaterThan(0.35);
  });

  it("scores reasoning-heavy prompts higher than factual prompts", async () => {
    const factual = await scorer.score("List the EU member states.", mockIntent);
    const reasoning = await scorer.score(
      "Explain why the EU expanded eastward and evaluate the political trade-offs involved.",
      mockIntent,
    );
    expect(reasoning.index).toBeGreaterThan(factual.index);
  });

  it("returns a score between 0 and 1", async () => {
    const result = await scorer.score("Some random task.", mockIntent);
    expect(result.index).toBeGreaterThanOrEqual(0.0);
    expect(result.index).toBeLessThanOrEqual(1.0);
  });

  it("returns a confidence value", async () => {
    const result = await scorer.score("Write a function.", mockIntent);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("includes all 6 dimension fields", async () => {
    const result = await scorer.score("Evaluate this architecture.", mockIntent);
    expect(result.dimensions).toHaveProperty("reasoning");
    expect(result.dimensions).toHaveProperty("domain");
    expect(result.dimensions).toHaveProperty("creativity");
    expect(result.dimensions).toHaveProperty("context");
    expect(result.dimensions).toHaveProperty("precision");
    expect(result.dimensions).toHaveProperty("interdependence");
  });
});
