// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.

/**
 * GeminiProvider — cloud LLM via Google Generative AI SDK.
 * Streaming is fully implemented.
 * Requires GEMINI_API_KEY environment variable.
 */

import {
  GoogleGenerativeAI,
  type Content,
  type GenerateContentStreamResult,
} from "@google/generative-ai";

import { ProviderUnavailableError } from "../exceptions.js";
import type { CompletionOptions, LLMResponse, Message } from "../types.js";
import { requireEnvVar } from "../utils/security.js";
import { BaseProvider } from "./base.js";

// gemini-2.0-flash pricing in EUR (approx)
const INPUT_COST_EUR_PER_1K = 0.00007; // $0.075/1M → ~€0.069/1M
const OUTPUT_COST_EUR_PER_1K = 0.00028; // $0.30/1M → ~€0.276/1M

/** Map LokaFlow message roles to Gemini roles. */
function toGeminiRole(role: string): "user" | "model" {
  return role === "assistant" ? "model" : "user";
}

/** Convert LokaFlow messages to Gemini Content array, collapsing system prompts. */
function buildContents(messages: Message[]): { system: string | undefined; contents: Content[] } {
  const systemMessages = messages.filter((m) => m.role === "system");
  const system =
    systemMessages.length > 0 ? systemMessages.map((m) => m.content).join("\n") : undefined;

  let contents: Content[] = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: toGeminiRole(m.role),
      parts: [{ text: m.content }],
    }));

  // Gemini requires conversations to start with a user turn.
  // Strip leading model turns (e.g. injected welcome/greeting assistant messages).
  while (contents.length > 0 && contents[0]!.role === "model") {
    contents = contents.slice(1);
  }

  return { system, contents };
}

export class GeminiProvider extends BaseProvider {
  readonly name = "gemini";
  private readonly genAI: GoogleGenerativeAI;
  private readonly defaultModel: string;

  constructor(apiKey?: string, defaultModel: string = "gemini-2.0-flash") {
    super();
    this.genAI = new GoogleGenerativeAI(apiKey ?? requireEnvVar("GEMINI_API_KEY"));
    this.defaultModel = defaultModel;
  }

  get costPer1kInputTokens(): number {
    return INPUT_COST_EUR_PER_1K;
  }
  get costPer1kOutputTokens(): number {
    return OUTPUT_COST_EUR_PER_1K;
  }

  async complete(messages: Message[], options: CompletionOptions = {}): Promise<LLMResponse> {
    const modelName = options.model ?? this.defaultModel;
    const start = Date.now();
    const { system, contents } = buildContents(messages);

    try {
      const model = this.genAI.getGenerativeModel({
        model: modelName,
        ...(system ? { systemInstruction: system } : {}),
        generationConfig: {
          temperature: options.temperature ?? 0.7,
          maxOutputTokens: options.maxTokens ?? 8192,  // 8192 allows full coding/analysis responses
        },
      });

      const result = await model.generateContent({ contents });
      const response = result.response;

      // Read text directly from candidates to avoid response.text() silently
      // returning "" when candidates exist but have an unexpected finish reason.
      const candidate = response.candidates?.[0];
      let content: string;
      if (candidate?.content?.parts) {
        content = candidate.content.parts
          .map((p: { text?: string }) => p.text ?? "")
          .join("");
      } else {
        // Fallback to SDK helper (may throw on bad finish reason)
        content = response.text();
      }

      const usage = response.usageMetadata;
      const inputTokens = usage?.promptTokenCount ?? 0;
      const outputTokens = usage?.candidatesTokenCount ?? 0;

      return {
        content,
        model: modelName,
        inputTokens,
        outputTokens,
        costEur: this.calcCostEur(inputTokens, outputTokens),
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      throw new ProviderUnavailableError("gemini", String(err));
    }
  }

  async *stream(messages: Message[], options: CompletionOptions = {}): AsyncGenerator<string> {
    const modelName = options.model ?? this.defaultModel;
    const { system, contents } = buildContents(messages);

    let streamResult: GenerateContentStreamResult;
    try {
      const model = this.genAI.getGenerativeModel({
        model: modelName,
        ...(system ? { systemInstruction: system } : {}),
        generationConfig: {
          temperature: options.temperature ?? 0.7,
          maxOutputTokens: options.maxTokens ?? 8192,  // 8192 allows full responses
        },
      });

      streamResult = await model.generateContentStream({ contents });
    } catch (err) {
      throw new ProviderUnavailableError("gemini", String(err));
    }

    try {
      for await (const chunk of streamResult.stream) {
        const text = chunk.text();
        if (text) yield text;
      }
    } catch (err) {
      throw new ProviderUnavailableError("gemini", `Streaming error: ${String(err)}`);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const model = this.genAI.getGenerativeModel({ model: this.defaultModel });
      await model.generateContent({ contents: [{ role: "user", parts: [{ text: "hi" }] }] });
      return true;
    } catch {
      return false;
    }
  }
}
