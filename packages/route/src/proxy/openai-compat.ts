// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaRoute™ — lokaflow.io
//
// packages/route/src/proxy/openai-compat.ts
// OpenAICompatLayer — normalises request/response formats across all providers
// into a single canonical shape so the rest of the proxy never needs to branch.
/* eslint-disable @typescript-eslint/explicit-function-return-type */

import type { RouteDecision } from "../types/routing.js";

// ── Canonical types (superset of OpenAI format) ───────────────────────────────

export interface CanonicalMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CanonicalChatRequest {
  messages: CanonicalMessage[];
  model: string;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  /** Provider-normalised target URL (set by interceptor). */
  targetUrl?: string;
  /** Provider name for auth header injection. */
  targetProvider?: string;
}

export interface CanonicalChatResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: CanonicalMessage;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  /** LokaRoute metadata — not part of OpenAI spec but passed in headers. */
  _lokaroute?: {
    tier: string;
    originalModel: string;
    classifierScore: number;
    policyOverride?: string;
  };
}

// ── Normalisation ─────────────────────────────────────────────────────────────

/**
 * Rewrite the incoming OpenAI-format request body so the `model` field
 * reflects the RouteDecision rather than whatever the client sent.
 * All other fields pass through unchanged.
 */
export function normaliseRequest(
  body: Record<string, unknown>,
  decision: RouteDecision,
): CanonicalChatRequest {
  const messages = (body["messages"] as CanonicalMessage[]) ?? [];
  return {
    messages,
    model: decision.model,
    stream: (body["stream"] as boolean | undefined) ?? false,
    ...(body["temperature"] !== undefined && { temperature: body["temperature"] as number }),
    ...(body["max_tokens"] !== undefined || body["maxTokens"] !== undefined
      ? { max_tokens: (body["max_tokens"] ?? body["maxTokens"]) as number }
      : {}),
    targetProvider: tierToProvider(decision.tier),
  };
}

/**
 * Wrap a raw provider JSON response into the canonical OpenAI response
 * shape.  Handles minor format variations between Ollama, Claude, Gemini, etc.
 */
export function normaliseResponse(
  raw: Record<string, unknown>,
  decision: RouteDecision,
): CanonicalChatResponse {
  // OpenAI / Ollama-OpenAI-compat path
  if (raw["object"] === "chat.completion" && Array.isArray(raw["choices"])) {
    const resp = raw as unknown as CanonicalChatResponse;
    resp._lokaroute = buildLokaMeta(decision);
    return resp;
  }

  // Anthropic Claude path
  if (raw["type"] === "message" && Array.isArray(raw["content"])) {
    const content = (raw["content"] as Array<{ type: string; text: string }>)
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("");
    const usage = raw["usage"] as { input_tokens: number; output_tokens: number } | undefined;
    return {
      id: (raw["id"] as string) ?? `chatcmpl-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: decision.model,
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
      usage: {
        prompt_tokens: usage?.input_tokens ?? 0,
        completion_tokens: usage?.output_tokens ?? 0,
        total_tokens: (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0),
      },
      _lokaroute: buildLokaMeta(decision),
    };
  }

  // Google Gemini path
  if (Array.isArray(raw["candidates"])) {
    const candidates = raw["candidates"] as Array<{
      content: { parts: Array<{ text: string }>; role: string };
    }>;
    const content = candidates[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
    const usage = raw["usageMetadata"] as
      | { promptTokenCount?: number; candidatesTokenCount?: number }
      | undefined;
    return {
      id: `chatcmpl-gemini-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: decision.model,
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
      usage: {
        prompt_tokens: usage?.promptTokenCount ?? 0,
        completion_tokens: usage?.candidatesTokenCount ?? 0,
        total_tokens: (usage?.promptTokenCount ?? 0) + (usage?.candidatesTokenCount ?? 0),
      },
      _lokaroute: buildLokaMeta(decision),
    };
  }

  // Fallback: unknown format — return best-effort
  return {
    id: `chatcmpl-unknown-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: decision.model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: JSON.stringify(raw) },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    _lokaroute: buildLokaMeta(decision),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function tierToProvider(tier: string): string {
  if (tier.startsWith("local")) return "ollama";
  return "cloud";
}

function buildLokaMeta(decision: RouteDecision) {
  return {
    tier: decision.tier,
    originalModel: "auto",
    classifierScore: decision.classification.score,
    ...(decision.policyOverride !== undefined && { policyOverride: decision.policyOverride }),
  };
}
