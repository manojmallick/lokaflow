// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaFlow™ — lokaflow.io
//
// packages/agent/src/decomposer/decomposition-gate.ts
// Gate that decides whether decomposing a task is worth the overhead.

import type { GateDecision, TaskGraph, TaskNode } from "../types/agent.js";
import type { ModelCapabilityRegistry } from "../registry/model-registry.js";
import { estimateTokens } from "../utils/tokens.js";

export class DecompositionGate {
  constructor(
    private readonly registry: ModelCapabilityRegistry,
    private readonly config = {
      minTokenSavingPercent: 20, // top-level minimum saving
      recursiveMinTokenSavingPercent: 15, // deeper levels allow looser threshold
      maxLatencyOverheadPercent: 15,
      minSubtaskQuality: 0.65,
    },
  ) {}

  evaluate(original: TaskNode, proposed: TaskGraph, isRecursive = false): GateDecision {
    const naiveTokens = estimateTokens(original.description) * 10; // naive: one big context
    const orchestratedTokens = proposed.nodes.reduce(
      (sum, n) => sum + estimateTokens(n.description) * 6,
      0,
    );

    // Gate 1: Token saving
    const savingThreshold = isRecursive
      ? this.config.recursiveMinTokenSavingPercent
      : this.config.minTokenSavingPercent;
    const saving = naiveTokens > 0 ? ((naiveTokens - orchestratedTokens) / naiveTokens) * 100 : 0;

    if (saving < savingThreshold) {
      return { decompose: false, reason: "insufficient_token_saving" };
    }

    // Gate 2: Quality floor — every subtask must meet the floor on its assigned model
    for (const node of proposed.nodes) {
      const quality = this.registry.quality(node.assignedModel, node.taskType);
      if (quality < this.config.minSubtaskQuality) {
        return {
          decompose: false,
          reason: `quality_floor_violation:${node.id}:${node.assignedModel}:${quality}`,
        };
      }
    }

    // Gate 3: Intent preserved
    if (!proposed.intentPreserved) {
      return { decompose: false, reason: "intent_lost_in_decomposition" };
    }

    return { decompose: true };
  }
}
