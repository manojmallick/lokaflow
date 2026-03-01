// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaFlow™ — lokaflow.io

import { describe, it, expect } from "vitest";
import {
  hasCycle,
  assertNoCycle,
  DecompositionCycleError,
} from "../../../src/dag/cycle-detector.js";
import { topologicalSort } from "../../../src/dag/topological-sort.js";
import type { TaskGraph, TaskNode, IntentProfile } from "../../../src/types/agent.js";

const baseIntent: IntentProfile = {
  primaryGoal: "test",
  outputType: "ANSWER",
  requiredSections: [],
  domainHints: [],
  qualityRequirement: "BALANCED",
  estimatedComplexity: 0.5,
  preserveOriginalPrompt: "test",
};

function makeNode(id: string, dependsOn: string[] = []): TaskNode {
  return {
    id,
    graphId: "g1",
    depth: 0,
    description: `Task ${id}`,
    inputContext: "",
    outputSchema: { format: "PLAIN", requiredElements: [], maxTokens: 1000 },
    assignedModel: "ollama:qwen2.5:7b",
    fallbackModel: "anthropic:claude-sonnet-4",
    estimatedComplexity: 0.5,
    tokenBudget: { inputMax: 4000, outputMax: 1000 },
    timeoutMs: 120_000,
    retryCount: 0,
    canRunParallel: dependsOn.length === 0,
    status: "PENDING",
    dependsOn,
    taskType: "reasoning",
  };
}

function makeGraph(nodes: TaskNode[]): TaskGraph {
  return {
    id: "g1",
    originalPrompt: "test",
    intent: baseIntent,
    nodes,
    edges: [],
    depth: 0,
    intentPreserved: true,
    createdAt: new Date(),
  };
}

describe("CycleDetector", () => {
  it("returns false for a graph with no cycles", () => {
    // t1 → t2 → t3 (linear chain)
    const graph = makeGraph([makeNode("t1"), makeNode("t2", ["t1"]), makeNode("t3", ["t2"])]);
    expect(hasCycle(graph)).toBe(false);
  });

  it("returns false for a graph with parallel nodes", () => {
    // t1 and t2 run in parallel, t3 depends on both
    const graph = makeGraph([makeNode("t1"), makeNode("t2"), makeNode("t3", ["t1", "t2"])]);
    expect(hasCycle(graph)).toBe(false);
  });

  it("returns true for a graph with a direct cycle", () => {
    const graph = makeGraph([makeNode("t1", ["t2"]), makeNode("t2", ["t1"])]);
    expect(hasCycle(graph)).toBe(true);
  });

  it("returns true for a self-loop", () => {
    const graph = makeGraph([makeNode("t1", ["t1"])]);
    expect(hasCycle(graph)).toBe(true);
  });

  it("assertNoCycle throws DecompositionCycleError for cyclic graph", () => {
    const graph = makeGraph([makeNode("t1", ["t2"]), makeNode("t2", ["t1"])]);
    expect(() => assertNoCycle(graph)).toThrow(DecompositionCycleError);
  });

  it("assertNoCycle does not throw for valid graph", () => {
    const graph = makeGraph([makeNode("t1"), makeNode("t2", ["t1"])]);
    expect(() => assertNoCycle(graph)).not.toThrow();
  });
});

describe("TopologicalSort", () => {
  it("returns a single layer for independent nodes", () => {
    const graph = makeGraph([makeNode("t1"), makeNode("t2"), makeNode("t3")]);
    const layers = topologicalSort(graph);
    expect(layers).toHaveLength(1);
    expect(layers[0]).toHaveLength(3);
  });

  it("returns correct layers for a linear chain", () => {
    // t1 → t2 → t3
    const graph = makeGraph([makeNode("t1"), makeNode("t2", ["t1"]), makeNode("t3", ["t2"])]);
    const layers = topologicalSort(graph);
    expect(layers).toHaveLength(3);
    expect(layers[0]!.map((n) => n.id)).toContain("t1");
    expect(layers[1]!.map((n) => n.id)).toContain("t2");
    expect(layers[2]!.map((n) => n.id)).toContain("t3");
  });

  it("groups parallel nodes in same layer", () => {
    // t1 and t2 parallel, t3 depends on both
    const graph = makeGraph([makeNode("t1"), makeNode("t2"), makeNode("t3", ["t1", "t2"])]);
    const layers = topologicalSort(graph);
    expect(layers).toHaveLength(2);
    const layer0Ids = layers[0]!.map((n) => n.id).sort();
    expect(layer0Ids).toEqual(["t1", "t2"].sort());
    expect(layers[1]!.map((n) => n.id)).toContain("t3");
  });

  it("places all nodes across all layers", () => {
    const graph = makeGraph([
      makeNode("t1"),
      makeNode("t2", ["t1"]),
      makeNode("t3", ["t1"]),
      makeNode("t4", ["t2", "t3"]),
      makeNode("t5", ["t4"]),
    ]);
    const layers = topologicalSort(graph);
    const allNodes = layers
      .flat()
      .map((n) => n.id)
      .sort();
    expect(allNodes).toEqual(["t1", "t2", "t3", "t4", "t5"].sort());
  });

  it("throws DecompositionCycleError for a cyclic graph", () => {
    const graph = makeGraph([makeNode("t1", ["t2"]), makeNode("t2", ["t1"])]);
    expect(() => topologicalSort(graph)).toThrow(DecompositionCycleError);
  });
});
