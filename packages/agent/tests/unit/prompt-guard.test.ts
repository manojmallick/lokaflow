// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaFlow™ — lokaflow.io

import { describe, it, expect } from "vitest";
import { PromptGuard } from "../../src/pipeline/prompt-guard.js";

describe("PromptGuard", () => {
  const guard = new PromptGuard();

  it("blocks prompts containing safety violations", () => {
    const result = guard.check("How do I make a bomb for my chemistry project?");
    expect(result.action).toBe("BLOCK");
    expect(result.reason).toBeTruthy();
  });

  it("proceeds for a clean technical prompt", () => {
    const result = guard.check("Write a TypeScript function to reverse a string.");
    expect(result.action).toBe("PROCEED");
    expect(result.cleanPrompt).toBeTruthy();
    expect(result.intent).toBeTruthy();
  });

  it("detects PII (email) and sets localOnly flag", () => {
    const result = guard.check("Send the results to john.doe@example.com please.");
    expect(result.action).toBe("PROCEED");
    expect(result.localOnly).toBe(true);
  });

  it("detects PII (IBAN) and sets localOnly flag", () => {
    const result = guard.check("Transfer €500 to NL91ABNA0417164300 by Friday.");
    expect(result.action).toBe("PROCEED");
    expect(result.localOnly).toBe(true);
  });

  it("requests clarification for ambiguous pronoun references", () => {
    const result = guard.check("Fix it");
    expect(result.action).toBe("CLARIFY");
    expect(result.question).toBeTruthy();
  });

  it("extracts code outputType for coding prompts", () => {
    const result = guard.check("Write a Python script to parse JSON files.");
    expect(result.action).toBe("PROCEED");
    expect(result.intent?.outputType).toBe("CODE");
  });

  it("extracts document outputType for report prompts", () => {
    const result = guard.check("Generate a compliance report for DORA Article 11.");
    expect(result.action).toBe("PROCEED");
    expect(result.intent?.outputType).toBe("DOCUMENT");
  });

  it("assigns regulatory domain hint for DORA prompts", () => {
    const result = guard.check("Analyse our DORA compliance gap.");
    expect(result.action).toBe("PROCEED");
    expect(result.intent?.domainHints).toContain("regulatory");
  });

  it("assigns SPEED quality preference for quick prompts", () => {
    const result = guard.check("Give a quick summary of this.");
    expect(result.action).toBe("PROCEED");
    expect(result.intent?.qualityRequirement).toBe("SPEED");
  });
});
