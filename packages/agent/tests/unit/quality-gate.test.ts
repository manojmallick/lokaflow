// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaFlow™ — lokaflow.io

import { describe, it, expect } from "vitest";
import { QualityGate } from "../../src/pipeline/quality-gate.js";
import type { ModelOutput, OutputSchema } from "../../src/types/agent.js";

const PLAIN_SCHEMA: OutputSchema = {
  format: "PLAIN",
  requiredElements: [],
  maxTokens: 500,
};

const JSON_SCHEMA: OutputSchema = {
  format: "JSON",
  requiredElements: [],
  maxTokens: 500,
};

const SCHEMA_WITH_REQUIRED: OutputSchema = {
  format: "PLAIN",
  requiredElements: ["summary", "findings", "recommendation"],
  maxTokens: 1000,
};

function makeOutput(content: string, outputTokens = 100): ModelOutput {
  return {
    content,
    usage: { inputTokens: 200, outputTokens },
    latencyMs: 500,
  };
}

describe("QualityGate", () => {
  const gate = new QualityGate();

  it("passes a valid plain text response", () => {
    const result = gate.validate(
      makeOutput(
        "Here is the analysis of the provided data. Key finding: the system is available 99.9% of the time.",
      ),
      PLAIN_SCHEMA,
    );
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.65);
  });

  it("passes a valid JSON response", () => {
    const result = gate.validate(
      makeOutput('{"status": "ok", "score": 0.87, "details": "All checks passed"}'),
      JSON_SCHEMA,
    );
    expect(result.passed).toBe(true);
  });

  it("fails on invalid JSON when JSON format required", () => {
    const result = gate.validate(
      makeOutput("This is not JSON at all, it is just plain text."),
      JSON_SCHEMA,
    );
    expect(result.passed).toBe(false);
    expect(result.failedChecks.some((c) => c.name === "schema")).toBe(true);
  });

  it("fails when self-reference is detected", () => {
    const result = gate.validate(
      makeOutput(
        "As an AI language model, I would approach this by considering multiple factors...",
      ),
      PLAIN_SCHEMA,
    );
    expect(result.passed).toBe(false);
    expect(result.failedChecks.some((c) => c.name === "self_reference")).toBe(true);
  });

  it("flags missing required elements in completeness check", () => {
    const result = gate.validate(
      makeOutput("Only a short note. Nothing comprehensive here."),
      SCHEMA_WITH_REQUIRED,
    );
    // completeness check should catch missing elements
    expect(result.score).toBeLessThan(1.0);
  });

  it("passes when required elements are present", () => {
    const result = gate.validate(
      makeOutput(
        "summary: The system is stable.\nfindings: No critical issues found.\nrecommendation: Continue current monitoring.",
      ),
      SCHEMA_WITH_REQUIRED,
    );
    expect(result.passed).toBe(true);
  });

  it("flags suspiciously short output", () => {
    const result = gate.validate(makeOutput("ok"), PLAIN_SCHEMA);
    expect(result.score).toBeLessThan(0.9); // minimum_length should reduce score
  });

  it("flags output exceeding token budget by more than 50%", () => {
    const result = gate.validate(
      makeOutput("A very long response that goes way over budget.", 1200), // max is 500, 1200 is > 1.5×
      PLAIN_SCHEMA,
    );
    const tokenCheck = result.failedChecks.find((c) => c.name === "token_budget");
    expect(tokenCheck?.passed).toBe(false);
  });
});
