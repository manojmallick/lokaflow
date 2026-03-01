// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.

/**
 * CohereProvider — cloud LLM via Cohere v2 Chat API (native fetch, no SDK needed).
 * Requires COHERE_API_KEY environment variable.
 * Docs: https://docs.cohere.com/reference/chat
 */

import { ProviderUnavailableError } from "../exceptions.js";
import type { CompletionOptions, LLMResponse, Message } from "../types.js";
import { requireEnvVar } from "@lokaflow/core/utils/security.js";
import { BaseProvider } from "./base.js";

// command-r-plus pricing in EUR (approx)
const INPUT_COST_EUR_PER_1K = 0.0028;  // $3.00/1M → ~€2.80/1M
const OUTPUT_COST_EUR_PER_1K = 0.0140; // $15.00/1M → ~€14.00/1M

interface CohereChatRequest {
    model: string;
    messages: Array<{ role: string; content: string }>;
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
}

interface CohereChatResponse {
    id: string;
    message: { role: string; content: Array<{ type: string; text: string }> };
    usage: {
        tokens: { input_tokens: number; output_tokens: number };
    };
}

export class CohereProvider extends BaseProvider {
    readonly name = "cohere";
    private readonly apiKey: string;
    private readonly defaultModel: string;
    private readonly baseUrl = "https://api.cohere.com/v2";

    constructor(apiKey?: string, defaultModel: string = "command-r-plus") {
        super();
        this.apiKey = apiKey ?? requireEnvVar("COHERE_API_KEY");
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

        const body: CohereChatRequest = {
            model,
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
            temperature: options.temperature ?? 0.7,
            max_tokens: options.maxTokens ?? 2048,
            stream: false,
        };

        let resp: Response;
        try {
            resp = await fetch(`${this.baseUrl}/chat`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(60_000),
            });
        } catch (err) {
            throw new ProviderUnavailableError("cohere", String(err));
        }

        if (!resp.ok) {
            throw new ProviderUnavailableError("cohere", `HTTP ${resp.status}`);
        }

        const data = (await resp.json()) as CohereChatResponse;
        const inputTokens = data.usage?.tokens?.input_tokens ?? 0;
        const outputTokens = data.usage?.tokens?.output_tokens ?? 0;
        const content = data.message?.content?.map((c) => c.text).join("") ?? "";

        return {
            content,
            model,
            inputTokens,
            outputTokens,
            costEur: this.calcCostEur(inputTokens, outputTokens),
            latencyMs: Date.now() - start,
        };
    }

    async *stream(messages: Message[], options: CompletionOptions = {}): AsyncGenerator<string> {
        const model = options.model ?? this.defaultModel;

        const body: CohereChatRequest = {
            model,
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
            temperature: options.temperature ?? 0.7,
            max_tokens: options.maxTokens ?? 2048,
            stream: true,
        };

        let resp: Response;
        try {
            resp = await fetch(`${this.baseUrl}/chat`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(60_000),
            });
        } catch (err) {
            throw new ProviderUnavailableError("cohere", String(err));
        }

        if (!resp.ok || !resp.body) {
            throw new ProviderUnavailableError("cohere", `HTTP ${resp.status}`);
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const lines = decoder.decode(value, { stream: true }).split("\n");
            for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                const json = line.slice(6).trim();
                if (json === "[DONE]") return;
                try {
                    const chunk = JSON.parse(json) as {
                        type: string;
                        delta?: { message?: { content?: Array<{ text?: string }> } };
                    };
                    if (chunk.type === "content-delta") {
                        const text = chunk.delta?.message?.content?.[0]?.text;
                        if (text) yield text;
                    }
                } catch {
                    // incomplete JSON chunk — continue
                }
            }
        }
    }

    async healthCheck(): Promise<boolean> {
        try {
            const resp = await fetch(`${this.baseUrl}/models`, {
                headers: { Authorization: `Bearer ${this.apiKey}` },
                signal: AbortSignal.timeout(3000),
            });
            return resp.ok;
        } catch {
            return false;
        }
    }
}
