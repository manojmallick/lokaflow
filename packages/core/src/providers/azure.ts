// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.

/**
 * AzureOpenAIProvider — OpenAI models hosted on Microsoft Azure.
 * Uses the official OpenAI SDK with Azure-specific baseURL and api-version header.
 * Requires AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, and AZURE_OPENAI_DEPLOYMENT env vars.
 * Docs: https://learn.microsoft.com/en-us/azure/ai-services/openai/reference
 */

import OpenAI from "openai";

import { ProviderUnavailableError } from "../exceptions.js";
import type { CompletionOptions, LLMResponse, Message } from "../types.js";
import { requireEnvVar } from "@lokaflow/core/utils/security.js";
import { BaseProvider } from "./base.js";

// gpt-4o on Azure pricing in EUR (same as OpenAI, approx)
const INPUT_COST_EUR_PER_1K = 0.0046;  // $5.00/1M → ~€4.60/1M
const OUTPUT_COST_EUR_PER_1K = 0.0138; // $15.00/1M → ~€13.80/1M

const AZURE_API_VERSION = "2024-10-21";

export class AzureOpenAIProvider extends BaseProvider {
    readonly name = "azure";
    private readonly client: OpenAI;
    private readonly deploymentName: string;

    constructor(apiKey?: string, endpoint?: string, deployment?: string) {
        super();
        const resolvedEndpoint = endpoint ?? requireEnvVar("AZURE_OPENAI_ENDPOINT");
        const resolvedDeployment = deployment ?? requireEnvVar("AZURE_OPENAI_DEPLOYMENT");

        this.client = new OpenAI({
            apiKey: apiKey ?? requireEnvVar("AZURE_OPENAI_API_KEY"),
            baseURL: `${resolvedEndpoint}/openai/deployments/${resolvedDeployment}`,
            defaultQuery: { "api-version": AZURE_API_VERSION },
            defaultHeaders: { "api-key": apiKey ?? requireEnvVar("AZURE_OPENAI_API_KEY") },
        });
        this.deploymentName = resolvedDeployment;
    }

    get costPer1kInputTokens(): number {
        return INPUT_COST_EUR_PER_1K;
    }
    get costPer1kOutputTokens(): number {
        return OUTPUT_COST_EUR_PER_1K;
    }

    async complete(messages: Message[], options: CompletionOptions = {}): Promise<LLMResponse> {
        // Azure uses deployment name as the model identifier
        const model = this.deploymentName;
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
            throw new ProviderUnavailableError("azure", String(err));
        }
    }

    async *stream(messages: Message[], options: CompletionOptions = {}): AsyncGenerator<string> {
        const model = this.deploymentName;

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
            throw new ProviderUnavailableError("azure", String(err));
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
