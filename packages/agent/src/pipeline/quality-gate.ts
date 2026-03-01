// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaFlow™ — lokaflow.io
//
// packages/agent/src/pipeline/quality-gate.ts
// Stage 7 — QualityGate: per-subtask output validation before passing to dependents.

import type { ValidationResult, CheckResult, OutputSchema, ModelOutput } from "../types/agent.js";
import { estimateTokens } from "../utils/tokens.js";

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

function checkSchema(content: string, schema: OutputSchema): CheckResult {
  let passed = true;
  let detail: string | undefined;

  if (schema.format === "JSON") {
    try {
      JSON.parse(content.trim());
    } catch {
      passed = false;
      detail = "Output is not valid JSON";
    }
  } else if (schema.format === "CODE") {
    // Very loose check: must contain at least a function/class/def keyword or code symbols
    const hasCode = /\b(function|class|def|const|let|var|=>|return|import|export)\b/.test(content);
    if (!hasCode) {
      passed = false;
      detail = "Output does not appear to contain code";
    }
  }

  const base: CheckResult = { name: "schema", passed, score: passed ? 1.0 : 0.0, weight: 0.3 };
  if (detail !== undefined) base.detail = detail;
  return base;
}

function checkCompleteness(content: string, required: string[]): CheckResult {
  if (required.length === 0)
    return { name: "completeness", passed: true, score: 1.0, weight: 0.25 };

  const lower = content.toLowerCase();
  const present = required.filter((r) => lower.includes(r.toLowerCase()));
  const score = required.length > 0 ? present.length / required.length : 1.0;
  const passed = score >= 0.75;
  const base: CheckResult = { name: "completeness", passed, score, weight: 0.25 };
  if (!passed) {
    base.detail = `Missing elements: ${required.filter((r) => !lower.includes(r.toLowerCase())).join(", ")}`;
  }
  return base;
}

function checkSelfReference(content: string): CheckResult {
  const selfRef =
    /\b(as an? (ai|ai language model|language model|llm)|i (cannot|can't|am unable to))\b/i.test(
      content,
    );
  const base: CheckResult = {
    name: "self_reference",
    passed: !selfRef,
    score: selfRef ? 0.0 : 1.0,
    weight: 0.25,
  };
  if (selfRef) base.detail = "Model described itself instead of completing the task";
  return base;
}

function checkTokenBudget(outputTokens: number, maxOutputTokens: number): CheckResult {
  const ratio = outputTokens / Math.max(maxOutputTokens, 1);
  const passed = ratio <= 1.5; // allow 50% overrun before hard fail
  const base: CheckResult = {
    name: "token_budget",
    passed,
    score: passed ? Math.max(0, 1 - Math.max(0, ratio - 1)) : 0.3,
    weight: 0.1,
  };
  if (!passed) base.detail = `Output tokens ${outputTokens} exceeded budget ${maxOutputTokens}`;
  return base;
}

function checkMinimumLength(content: string, format: string): CheckResult {
  const tokens = estimateTokens(content);
  const tooShort = tokens < 10 && format !== "JSON";
  const base: CheckResult = {
    name: "minimum_length",
    passed: !tooShort,
    score: tooShort ? 0.0 : 1.0,
    weight: 0.15,
  };
  if (tooShort) base.detail = "Output is suspiciously short";
  return base;
}

// ---------------------------------------------------------------------------
// QualityGate
// ---------------------------------------------------------------------------

export class QualityGate {
  constructor(
    private readonly config = {
      minQualityScore: 0.65,
    },
  ) {}

  validate(raw: ModelOutput, schema: OutputSchema): ValidationResult {
    const checks: CheckResult[] = [
      checkSchema(raw.content, schema),
      checkCompleteness(raw.content, schema.requiredElements),
      checkSelfReference(raw.content),
      checkTokenBudget(raw.usage.outputTokens, schema.maxTokens),
      checkMinimumLength(raw.content, schema.format),
    ];

    const weightedScore =
      checks.reduce((sum, c) => sum + c.weight * c.score, 0) /
      checks.reduce((sum, c) => sum + c.weight, 0);

    const failedChecks = checks.filter((c) => !c.passed);
    const hardFailed = failedChecks.some((c) => c.weight >= 0.25 && c.score === 0);
    const passed = !hardFailed && weightedScore >= this.config.minQualityScore;

    const firstFailed = failedChecks[0];
    return {
      passed,
      score: weightedScore,
      failedChecks,
      output: raw.content,
      failedReason: firstFailed?.name,
    };
  }
}
