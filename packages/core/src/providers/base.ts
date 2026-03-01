// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.

/**
 * BaseProvider — abstract contract that every LLM adapter must implement.
 * Adding a new provider: implement all abstract members, register in router.ts.
 */

import type { CompletionOptions, LLMResponse, Message } from "../types.js";

export abstract class BaseProvider {
  /** Display name used in logs and routing decision output. */
  abstract readonly name: string;

  /**
   * Single-shot completion. Must return a full LLMResponse including usage stats.
   */
  abstract complete(messages: Message[], options?: CompletionOptions): Promise<LLMResponse>;

  /**
   * Streaming completion. Must yield text chunks as they arrive from the model.
   * The caller is responsible for aggregating chunks if a full response is needed.
   */
  abstract stream(messages: Message[], options?: CompletionOptions): AsyncGenerator<string>;

  /** Cost in EUR per 1,000 input tokens. 0.0 for local models. */
  abstract get costPer1kInputTokens(): number;

  /** Cost in EUR per 1,000 output tokens. 0.0 for local models. */
  abstract get costPer1kOutputTokens(): number;

  /**
   * Health check — returns true if the provider is reachable.
   * Called at startup and before routing if the provider is the primary choice.
   */
  abstract healthCheck(): Promise<boolean>;

  /** Calculate cost in EUR given token counts. */
  protected calcCostEur(inputTokens: number, outputTokens: number): number {
    return (
      (inputTokens / 1000) * this.costPer1kInputTokens +
      (outputTokens / 1000) * this.costPer1kOutputTokens
    );
  }
}
