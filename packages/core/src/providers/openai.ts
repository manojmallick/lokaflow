// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.

/**
 * OpenAIProvider — cloud LLM via OpenAI SDK.
 * Requires OPENAI_API_KEY environment variable.
 */

import OpenAI from "openai";

import { ProviderUnavailableError } from "../exceptions.js";
import type { CompletionOptions, LLMResponse, Message } from "../types.js";
import { requireEnvVar } from "@lokaflow/core/utils/security.js";
import { BaseProvider } from "./base.js";

// gpt-4o pricing in EUR (approx)
const INPUT_COST_EUR_PER_1K = 0.0046; // $5.00/1M → ~€4.60/1M
const OUTPUT_COST_EUR_PER_1K = 0.0138; // $15.00/1M → ~€13.80/1M

export class OpenAIProvider extends BaseProvider {
  readonly name = "openai";
  private readonly client: OpenAI;
  private readonly defaultModel: string;

  constructor(apiKey?: string, defaultModel: string = "gpt-4o") {
    super();
    this.client = new OpenAI({ apiKey: apiKey ?? requireEnvVar("OPENAI_API_KEY") });
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

    try {
      const response = await this.client.chat.completions.create({
        model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 2048,
        stream: false,
      });

      const choice = response.choices[0];
      const content = choice?.message?.content ?? "";
      const inputTokens = response.usage?.prompt_tokens ?? 0;
      const outputTokens = response.usage?.completion_tokens ?? 0;

      return {
        content,
        model,
        inputTokens,
        outputTokens,
        costEur: this.calcCostEur(inputTokens, outputTokens),
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      throw new ProviderUnavailableError("openai", String(err));
    }
  }

  async *stream(messages: Message[], options: CompletionOptions = {}): AsyncGenerator<string> {
    const model = options.model ?? this.defaultModel;

    try {
      const stream = await this.client.chat.completions.create({
        model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 2048,
        stream: true,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) yield delta;
      }
    } catch (err) {
      throw new ProviderUnavailableError("openai", String(err));
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
