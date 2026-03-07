// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaFlow™ — lokaflow.io

import { describe, it, expect, beforeEach } from "vitest";
import { ModelMatcher } from "../../src/pipeline/model-matcher.js";
import { ModelCapabilityRegistry } from "../../src/registry/model-registry.js";
import { WarmModelTracker } from "../../src/registry/warm-tracker.js";
import type { TaskNode } from "../../src/types/agent.js";

function makeTaskNode(overrides: Partial<TaskNode> = {}): TaskNode {
  return {
    id: "t1",
    graphId: "g1",
    depth: 0,
    description: "test task",
    inputContext: "",
    outputSchema: { format: "PLAIN", requiredElements: [], maxTokens: 1000 },
    assignedModel: "ollama:qwen2.5:7b",
    fallbackModel: "anthropic:claude-sonnet-4",
    estimatedComplexity: 0.5,
    tokenBudget: { inputMax: 4000, outputMax: 1000 },
    timeoutMs: 120_000,
    retryCount: 0,
    canRunParallel: true,
    status: "PENDING",
    dependsOn: [],
    taskType: "reasoning",
    ...overrides,
  };
}

describe("ModelMatcher", () => {
  let registry: ModelCapabilityRegistry;
  let warmTracker: WarmModelTracker;
  let matcher: ModelMatcher;

  beforeEach(() => {
    registry = new ModelCapabilityRegistry();
    warmTracker = new WarmModelTracker();
    matcher = new ModelMatcher(registry, warmTracker);
  });

  it("assigns a model for a reasoning task", () => {
    const node = makeTaskNode({ taskType: "reasoning" });
    const assignment = matcher.assign(node);
    expect(assignment.modelId).toBeTruthy();
    expect(assignment.tier).toBeTruthy();
  });

  it("assigns a coding-specialised model for coding tasks", () => {
    const node = makeTaskNode({ taskType: "coding" });
    const assignment = matcher.assign(node);
    // qwen2.5-coder:7b has coding=0.92, should be preferred
    expect(["ollama:qwen2.5-coder:7b", "ollama:deepseek-coder:6.7b"]).toContain(assignment.modelId);
  });

  it("prefers a warm model over a cold model with lower quality", () => {
    // Make mistral:7b warm on a node
    warmTracker.setWarm("ollama:mistral:7b", "mac-mini-m2");
    const node = makeTaskNode({ taskType: "summarisation" });
    const assignment = matcher.assign(node);
    // mistral:7b has summarisation=0.88 and is warm — should score higher than cold qwen2.5
    // (warm bonus = 0.25 in scoring)
    expect(assignment.reason).toBe("warm_preference");
  });

  it("returns cloud fallback when no local model meets quality floor", () => {
    const node = makeTaskNode({ taskType: "visualQA" }); // only vision models handle this
    // Force only non-vision models to be available by overriding registry
    const limitedRegistry = new ModelCapabilityRegistry([
      {
        id: "ollama:tinyllama:1.1b",
        tier: "LOCAL_NANO",
        ramGb: 1,
        contextTokens: 2048,
        tokensPerSec: { m2_8gb: 45, m4_16gb: 65 },
        capabilities: { extraction: 0.88 }, // no visualQA
        qualityFloor: 0.65,
      },
    ]);
    const limitedMatcher = new ModelMatcher(limitedRegistry, warmTracker);
    const assignment = limitedMatcher.assign(node);
    expect(assignment.tier).toBe("CLOUD_STANDARD");
    expect(assignment.reason).toBe("no_local_capable");
  });

  it("always provides a fallback model", () => {
    const node = makeTaskNode({ taskType: "reasoning" });
    const assignment = matcher.assign(node);
    expect(assignment.fallbackModelId).toBeTruthy();
  });

  it("includes qualityScore in the assignment", () => {
    const node = makeTaskNode({ taskType: "extraction" });
    const assignment = matcher.assign(node);
    expect(assignment.qualityScore).toBeGreaterThan(0);
    expect(assignment.qualityScore).toBeLessThanOrEqual(1);
  });
});
