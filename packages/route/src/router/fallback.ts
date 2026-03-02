// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaRoute™ — lokaflow.io
//
// packages/route/src/router/fallback.ts
// FallbackChain — if the primary provider fails, escalate gracefully.
// Never 500s the client — always produces *some* response.

import type { RoutingTier } from "../types/routing.js";

type AsyncProvider = (model: string, messages: unknown[]) => Promise<string>;

export interface FallbackStep {
  tier: RoutingTier;
  model: string;
  provider: AsyncProvider;
  reason: string;
}

export interface FallbackResult {
  content: string;
  finalTier: RoutingTier;
  finalModel: string;
  wasEscalated: boolean;
  steps: number;
}

/**
 * FallbackChain executes an ordered list of provider+model pairs,
 * trying each in sequence until one succeeds.
 *
 * Design rule: the chain always ends with a cloud-capable step so
 * the client always receives a response, even if local Ollama is offline.
 */
export class FallbackChain {
  constructor(private readonly steps: FallbackStep[]) {
    if (steps.length === 0) throw new Error("FallbackChain must have at least one step");
  }

  async execute(messages: unknown[]): Promise<FallbackResult> {
    const errors: Array<{ step: FallbackStep; err: unknown }> = [];

    for (let i = 0; i < this.steps.length; i++) {
      const step = this.steps[i]!;
      try {
        const content = await step.provider(step.model, messages);
        return {
          content,
          finalTier: step.tier,
          finalModel: step.model,
          wasEscalated: i > 0,
          steps: i + 1,
        };
      } catch (err) {
        errors.push({ step, err });
        // try next step
      }
    }

    // All steps failed — synthesise an error response rather than throwing
    const reasons = errors.map((e) => `${e.step.model}: ${(e.err as Error).message}`).join("; ");
    return {
      content: `LokaRoute encountered errors contacting all providers: ${reasons}`,
      finalTier: this.steps.at(-1)!.tier,
      finalModel: this.steps.at(-1)!.model,
      wasEscalated: true,
      steps: this.steps.length,
    };
  }

  /**
   * Build a two-step chain: local Ollama first, cloud fallback second.
   * Both providers are simple fetch wrappers (injected by caller).
   */
  static localThenCloud(
    localModel: string,
    localCall: AsyncProvider,
    cloudModel: string,
    cloudCall: AsyncProvider,
  ): FallbackChain {
    return new FallbackChain([
      { tier: "local-capable", model: localModel, provider: localCall, reason: "primary local" },
      { tier: "cloud-capable", model: cloudModel, provider: cloudCall, reason: "cloud fallback" },
    ]);
  }
}
