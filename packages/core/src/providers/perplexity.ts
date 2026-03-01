// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.

/**
 * PerplexityProvider — search-augmented cloud LLM via Perplexity AI (OpenAI-compatible).
 * Models automatically search the web before responding.
 * Requires PERPLEXITY_API_KEY environment variable.
 * Docs: https://docs.perplexity.ai/api-reference/chat-completions
 */

import OpenAI from "openai";

import { ProviderUnavailableError } from "../exceptions.js";
import type { CompletionOptions, LLMResponse, Message } from "../types.js";
import { requireEnvVar } from "@lokaflow/core/utils/security.js";
import { BaseProvider } from "./base.js";

// sonar-pro pricing in EUR (approx)
const INPUT_COST_EUR_PER_1K = 0.0028;  // $3.00/1M → ~€2.80/1M
const OUTPUT_COST_EUR_PER_1K = 0.0140; // $15.00/1M → ~€14.00/1M
const SEARCH_COST_EUR_PER_REQ = 0.005; // $0.005 per search request

export class PerplexityProvider extends BaseProvider {
    readonly name = "perplexity";
    private readonly client: OpenAI;
    private readonly defaultModel: string;

    constructor(apiKey?: string, defaultModel: string = "sonar-pro") {
        super();
        this.client = new OpenAI({
            apiKey: apiKey ?? requireEnvVar("PERPLEXITY_API_KEY"),
            baseURL: "https://api.perplexity.ai",
        });
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
                // Add per-request search cost on top of token cost
                costEur: this.calcCostEur(inputTokens, outputTokens) + SEARCH_COST_EUR_PER_REQ,
                latencyMs: Date.now() - start,
            };
        } catch (err) {
            throw new ProviderUnavailableError("perplexity", String(err));
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
            throw new ProviderUnavailableError("perplexity", String(err));
        }
    }

    async healthCheck(): Promise<boolean> {
        try {
            // Perplexity doesn't expose /models endpoint; try a minimal completion
            await this.client.chat.completions.create({
                model: this.defaultModel,
                messages: [{ role: "user", content: "ping" }],
                max_tokens: 1,
                stream: false,
            });
            return true;
        } catch {
            return false;
        }
    }
}
