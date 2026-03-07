// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaRoute™ — lokaflow.io
//
// packages/route/src/proxy/interceptor.ts
// RequestInterceptor — modifies inbound OpenAI-format requests before forwarding.
// Responsibilities:
//   1. Extract the query text for classification
//   2. Swap the model field to the RouteDecision's model
//   3. Inject privacy headers / strip PII metadata
//   4. Track request start time

import type { FastifyRequest } from "fastify";
import type { RouteDecision } from "../types/routing.js";

export interface InterceptedRequest {
  originalBody: Record<string, unknown>;
  query: string;
  messages: Array<{ role: string; content: string }>;
  stream: boolean;
  startTime: number;
}

/**
 * Parse and extract fields from an inbound chat completions request.
 * Returns a structured object the classifier and router can act on.
 */
export function interceptRequest(req: FastifyRequest): InterceptedRequest {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const messages = Array.isArray(body["messages"])
    ? (body["messages"] as Array<{ role: string; content: string }>)
    : [];

  // Extract query from the last user message (the one being routed)
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const query = typeof lastUser?.content === "string" ? lastUser.content : "";

  return {
    originalBody: body,
    query,
    messages,
    stream: Boolean(body["stream"]),
    startTime: Date.now(),
  };
}

/**
 * Build the outbound request body to forward to the provider.
 * Swaps `model` to the RouteDecision's chosen model; all other fields pass through.
 */
export function buildForwardBody(
  intercepted: InterceptedRequest,
  decision: RouteDecision,
): Record<string, unknown> {
  return {
    ...intercepted.originalBody,
    model: decision.model,
    // Never forward internal LokaRoute metadata to providers
    _lokaroute: undefined,
  };
}

/**
 * Build the routing metadata headers injected on every proxied response.
 * Clients that care can read these; clients that don't will ignore them.
 */
export function buildRoutingHeaders(
  decision: RouteDecision,
  latencyMs: number,
): Record<string, string> {
  return {
    "X-LokaRoute-Tier": decision.tier,
    "X-LokaRoute-Model": decision.model,
    "X-LokaRoute-Score": decision.classification.score.toFixed(3),
    "X-LokaRoute-Latency-Ms": String(latencyMs),
    ...(decision.policyOverride ? { "X-LokaRoute-Override": decision.policyOverride } : {}),
    ...(decision.piiDetected ? { "X-LokaRoute-PII": "detected" } : {}),
  };
}
