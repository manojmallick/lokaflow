// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.

/**
 * ClaudeProvider — cloud LLM via Anthropic SDK.
 * Requires ANTHROPIC_API_KEY environment variable.
 */

import Anthropic from "@anthropic-ai/sdk";

import { ProviderUnavailableError } from "../exceptions.js";
import type { CompletionOptions, LLMResponse, Message } from "../types.js";
import { requireEnvVar } from "@lokaflow/core/utils/security.js";
import { BaseProvider } from "./base.js";

// claude-sonnet-4-20250514 pricing in EUR (approx, at 0.92 USD/EUR)
const INPUT_COST_EUR_PER_1K = 0.0028; // $3.00 / 1M input → ~€0.00276/1K
const OUTPUT_COST_EUR_PER_1K = 0.014; // $15.00 / 1M output → ~€0.0138/1K

export class ClaudeProvider extends BaseProvider {
  readonly name = "claude";
  private readonly client: Anthropic;
  private readonly defaultModel: string;

  constructor(apiKey?: string, defaultModel: string = "claude-sonnet-4-20250514") {
    super();
    this.client = new Anthropic({ apiKey: apiKey ?? requireEnvVar("ANTHROPIC_API_KEY") });
    this.defaultModel = defaultModel;
  }

  get costPer1kInputTokens(): number {
    return INPUT_COST_EUR_PER_1K;
  }
  get costPer1kOutputTokens(): number {
    return OUTPUT_COST_EUR_PER_1K;
  }

  async complete(messages: Message[], options: CompletionOptions = {}): Promise<LLMResponse> {
    const model = options.model ?? this.defaultModel;
    const start = Date.now();

    // Separate system messages from conversation
    const systemMessages = messages.filter((m) => m.role === "system");
    const userMessages = messages.filter((m) => m.role !== "system");
    const systemPrompt = systemMessages.map((m) => m.content).join("\n") || undefined;

    try {
      const response = await this.client.messages.create({
        model,
        max_tokens: options.maxTokens ?? 2048,
        temperature: options.temperature ?? 0.7,
        system: systemPrompt,
        messages: userMessages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      });

      const content = response.content[0]?.type === "text" ? response.content[0].text : "";
      const inputTokens = response.usage.input_tokens;
      const outputTokens = response.usage.output_tokens;

      return {
        content,
        model,
        inputTokens,
        outputTokens,
        costEur: this.calcCostEur(inputTokens, outputTokens),
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      throw new ProviderUnavailableError("claude", String(err));
    }
  }

  async *stream(messages: Message[], options: CompletionOptions = {}): AsyncGenerator<string> {
    const model = options.model ?? this.defaultModel;
    const systemMessages = messages.filter((m) => m.role === "system");
    const userMessages = messages.filter((m) => m.role !== "system");
    const systemPrompt = systemMessages.map((m) => m.content).join("\n") || undefined;

    try {
      const stream = this.client.messages.stream({
        model,
        max_tokens: options.maxTokens ?? 2048,
        temperature: options.temperature ?? 0.7,
        system: systemPrompt,
        messages: userMessages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      });

      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          yield event.delta.text;
        }
      }
    } catch (err) {
      throw new ProviderUnavailableError("claude", String(err));
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }
}
