// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.

/**
 * OllamaProvider — local LLM inference via Ollama HTTP API.
 * Zero cost, zero network (runs on localhost).
 * Docs: https://github.com/ollama/ollama/blob/main/docs/api.md
 */

import { ProviderUnavailableError } from "../exceptions.js";
import type { CompletionOptions, LLMResponse, Message } from "../types.js";
import { BaseProvider } from "./base.js";

interface OllamaChatRequest {
  model: string;
  messages: Message[];
  stream: boolean;
  options?: { temperature?: number; num_predict?: number };
}

interface OllamaChatResponse {
  model: string;
  message: { role: string; content: string };
  done: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
}

export class OllamaProvider extends BaseProvider {
  name: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly timeoutMs: number;
  private readonly host: string;

  constructor(baseUrl: string, defaultModel: string, timeoutMs: number = 30000) {
    super();
    this.baseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    this.defaultModel = defaultModel;
    this.timeoutMs = timeoutMs;
    // Extract hostname for better identification
    try {
      this.host = new URL(baseUrl).hostname;
    } catch {
      this.host = "unknown-host";
    }
    this.name = `ollama[@${this.host}]`;
  }

  get costPer1kInputTokens(): number {
    return 0.0;
  }
  get costPer1kOutputTokens(): number {
    return 0.0;
  }

  async complete(messages: Message[], options: CompletionOptions = {}): Promise<LLMResponse> {
    const model = options.model ?? this.defaultModel;
    const start = Date.now();

    const body: OllamaChatRequest = {
      model,
      messages,
      stream: !!options.onStream,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens ?? 2048,
      },
    };

    let resp: Response;
    try {
      resp = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new ProviderUnavailableError("ollama", String(err));
    }

    if (!resp.ok) {
      throw new ProviderUnavailableError("ollama", `HTTP ${resp.status}`);
    }

    if (options.onStream && resp.body) {
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let content = "";
      let inputTokens = 0;
      let outputTokens = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const lines = decoder.decode(value, { stream: true }).split("\n");
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line) as OllamaChatResponse;
            if (chunk.message?.content) {
              content += chunk.message.content;
              options.onStream(chunk.message.content);
            }
            if (chunk.done) {
              inputTokens = chunk.prompt_eval_count ?? 0;
              outputTokens = chunk.eval_count ?? 0;
            }
          } catch {
            // incomplete JSON chunk — continue
          }
        }
      }

      const latencyMs = Date.now() - start;
      return {
        content,
        model,
        inputTokens,
        outputTokens,
        costEur: 0.0,
        latencyMs,
      };
    } else {
      const data = (await resp.json()) as OllamaChatResponse;
      const latencyMs = Date.now() - start;
      const inputTokens = data.prompt_eval_count ?? 0;
      const outputTokens = data.eval_count ?? 0;

      return {
        content: data.message.content,
        model,
        inputTokens,
        outputTokens,
        costEur: 0.0,
        latencyMs,
      };
    }
  }

  async *stream(messages: Message[], options: CompletionOptions = {}): AsyncGenerator<string> {
    const model = options.model ?? this.defaultModel;

    const body: OllamaChatRequest = {
      model,
      messages,
      stream: true,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens ?? 2048,
      },
    };

    let resp: Response;
    try {
      resp = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new ProviderUnavailableError("ollama", String(err));
    }

    if (!resp.ok || !resp.body) {
      throw new ProviderUnavailableError("ollama", `HTTP ${resp.status}`);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const lines = decoder.decode(value, { stream: true }).split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const chunk = JSON.parse(line) as OllamaChatResponse;
          if (chunk.message?.content) {
            yield chunk.message.content;
          }
          if (chunk.done) return;
        } catch {
          // incomplete JSON chunk — continue
        }
      }
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const resp = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      return resp.ok;
    } catch {
      return false;
    }
  }
}
