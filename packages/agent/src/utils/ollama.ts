// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaFlow™ — lokaflow.io
//
// packages/agent/src/utils/ollama.ts
// Minimal Ollama HTTP client for agent use — chat completions only.
// Uses the existing Ollama REST API at localhost:11434.

export interface OllamaMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface OllamaCompletionOptions {
  model: string;
  messages: OllamaMessage[];
  temperature?: number;
  /** Stop generating at these tokens */
  stop?: string[];
  timeoutMs?: number;
  /**
   * External AbortSignal (e.g. from a per-node timeout controller).
   * Combined with the internal timeout signal so whichever fires first wins.
   */
  signal?: AbortSignal;
}

export interface OllamaCompletionResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export class OllamaClient {
  constructor(private readonly baseUrl = "http://localhost:11434") {}

  async complete(opts: OllamaCompletionOptions): Promise<OllamaCompletionResult> {
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 120_000);

    // Combine the internal timeout signal with any caller-supplied signal so
    // whichever fires first (execution-engine deadline or internal timeout) wins.
    const signal =
      opts.signal !== undefined
        ? AbortSignal.any([controller.signal, opts.signal])
        : controller.signal;

    try {
      const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.stripPrefix(opts.model),
          messages: opts.messages,
          stream: false,
          options: {
            temperature: opts.temperature ?? 0.1,
            stop: opts.stop,
          },
        }),
        signal,
      });

      if (!res.ok) {
        throw new Error(`Ollama API error ${res.status}: ${await res.text()}`);
      }

      const data = (await res.json()) as {
        message: { content: string };
        prompt_eval_count?: number;
        eval_count?: number;
      };

      return {
        content: data.message.content,
        inputTokens: data.prompt_eval_count ?? 0,
        outputTokens: data.eval_count ?? 0,
        latencyMs: Date.now() - start,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { method: "GET" });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Strips "ollama:" prefix so model IDs are consistent. */
  private stripPrefix(modelId: string): string {
    return modelId.replace(/^ollama:/, "");
  }
}
