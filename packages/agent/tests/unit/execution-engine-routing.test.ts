// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaFlow™ — lokaflow.io

import { describe, it, expect, vi, afterEach } from "vitest";
import { ExecutionEngine } from "../../src/pipeline/execution-engine.js";
import { CLOUD_FALLBACK_MODEL } from "../../src/registry/interim-models.js";
import type { TaskGraph } from "../../src/types/agent.js";

// ---------------------------------------------------------------------------
// Minimal mock registry \u2014 satisfies ModelCapabilityRegistry interface
// ---------------------------------------------------------------------------
const mockRegistry = {
  getCapabilities: vi.fn(() => ({
    contextWindow: 4096,
    strengths: ["code"],
    supportsStreaming: false,
  })),
  contextTokens: vi.fn(() => 4096),
  listModels: vi.fn(() => []),
} as unknown as import("../../src/registry/model-registry.js").ModelCapabilityRegistry;

const engineConfig = {
  defaultTimeoutMs: 5_000,
  maxTimeoutMs: 10_000,
  preWarmNextModel: false,
  ollamaBaseUrl: "http://localhost:11434",
} as const;

// ---------------------------------------------------------------------------
// Minimal single-node graph (all required TaskNode fields provided)
// ---------------------------------------------------------------------------
function makeGraph(modelId = "ollama:tinyllama:1.1b"): TaskGraph {
  return {
    nodes: [
      {
        id: "n1",
        description: "Do something",
        assignedModel: modelId,
        dependsOn: [],
        inputContext: "",
        outputSchema: { format: "text", maxTokens: 200, requiredElements: [] },
        qualityThreshold: 0.3,
        priority: 1,
        complexity: 0.2,
        tokenBudget: { inputMax: 1000, outputMax: 200 },
      },
    ],
    meta: { createdAt: Date.now(), totalBudgetTokens: 2000 },
  };
}

/** Mock ContextPacker.pack on the engine so we don't need a real Ollama connection. */
function stubPacker(engine: ExecutionEngine): void {
  vi.spyOn((engine as unknown as { packer: { pack: unknown } }).packer, "pack").mockResolvedValue({
    systemPrompt: "system",
    userPrompt: "user",
    packedTokens: 100,
    totalTokens: 100,
    dependencyOutputs: [],
    relevantContext: "",
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// localOnly: cloud escalation must never be attempted
// ---------------------------------------------------------------------------
describe("ExecutionEngine — localOnly flag", () => {
  it("does not escalate to cloud when localOnly=true, even on model failure", async () => {
    const engine = new ExecutionEngine(mockRegistry, engineConfig);
    stubPacker(engine);

    // Force the Ollama call to fail so handleFailure is triggered
    vi.spyOn(engine as unknown as { callModel: unknown }, "callModel").mockRejectedValue(
      new Error("ollama offline"),
    );

    const result = await engine.execute(makeGraph(), /* localOnly */ true);
    const results = [...result.nodeResults.values()];

    // All node results should have escalated=false
    expect(results.every((r) => r.escalated === false)).toBe(true);
    // No result should reference the cloud model
    expect(results.every((r) => r.model !== CLOUD_FALLBACK_MODEL)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Non-Ollama model: callModel must throw, handleFailure must degrade honestly
// ---------------------------------------------------------------------------
describe("ExecutionEngine — non-Ollama model graceful degradation", () => {
  it("returns escalated=false when cloud model throws (offline mode)", async () => {
    const engine = new ExecutionEngine(mockRegistry, engineConfig);
    stubPacker(engine);

    // Both local and cloud calls fail (simulates fully offline mode)
    vi.spyOn(engine as unknown as { callModel: unknown }, "callModel").mockRejectedValue(
      new Error("network error"),
    );

    const result = await engine.execute(makeGraph(), /* localOnly */ false);
    const results = [...result.nodeResults.values()];

    expect(results.every((r) => r.escalated === false)).toBe(true);
  });

  it("returns escalated=true when cloud fallback succeeds", async () => {
    const engine = new ExecutionEngine(mockRegistry, engineConfig);
    stubPacker(engine);

    let callCount = 0;
    vi.spyOn(engine as unknown as { callModel: unknown }, "callModel").mockImplementation(
      async () => {
        callCount++;
        if (callCount === 1) throw new Error("local model failed"); // first call: local
        // second call: cloud succeeds
        return {
          content: "cloud result",
          usage: { inputTokens: 10, outputTokens: 20 },
          latencyMs: 50,
        };
      },
    );

    const result = await engine.execute(makeGraph(), /* localOnly */ false);

    const node = result.nodeResults.get("n1");
    expect(node?.escalated).toBe(true);
    expect(node?.model).toBe(CLOUD_FALLBACK_MODEL);
  });
});
