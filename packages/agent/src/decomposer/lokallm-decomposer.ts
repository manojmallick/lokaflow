// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaFlow™ — lokaflow.io
//
// packages/agent/src/decomposer/lokallm-decomposer.ts
// LokaLLM decomposer — production replacement for InterimDecomposer.
// Activated via config: agent.decomposer: 'lokallm'
//
// NOT YET ACTIVE — LokaLLM graduation criteria not met.
// Target: ≥88% tier accuracy, <50ms scoring, <200ms decomposition.

import type { TaskGraph, IntentProfile } from "../types/agent.js";

export class LokaLLMDecomposer {
  constructor() {
    throw new Error(
      "LokaLLMDecomposer is not yet active. Use InterimDecomposer (agent.decomposer: interim).",
    );
  }

  async decompose(
    _task: string,
    _intent: IntentProfile,
    _complexityIndex: number,
    _graphId: string,
    _depth?: number,
  ): Promise<TaskGraph> {
    throw new Error("Not implemented");
  }
}
