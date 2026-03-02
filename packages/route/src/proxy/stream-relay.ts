// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaRoute™ — lokaflow.io
//
// packages/route/src/proxy/stream-relay.ts
// StreamRelay — transparently relays SSE streams from provider to client.
//
// Key constraint: first token must reach the client within 200ms of what it
// would have been without the proxy (overhead budget: <50ms classify + relay).
//
// The relay never buffers the full response in memory — it pipes chunk by chunk.

import type { FastifyReply } from "fastify";
import type { RouteDecision } from "../types/routing.js";
import { buildRoutingHeaders } from "./interceptor.js";
import type { SavingsTracker, RouteRecord } from "../tracker/savings-tracker.js";
import { randomUUID } from "crypto";

export interface StreamRelayOptions {
  tracker?: SavingsTracker;
  /** Alternative subscription cost used to calculate savings. Defaults to claude-sonnet rate. */
  alternativeCostUsdPer1KTokens?: number;
}

/** Approximate cost per 1K output tokens for Claude Sonnet (subscription equivalent). */
const CLAUDE_SONNET_USD_PER_1K_OUT = 0.015;

export class StreamRelay {
  constructor(private readonly opts: StreamRelayOptions = {}) {}

  /**
   * Relay an SSE stream from `providerFetch` → Fastify reply.
   *
   * `providerFetch` must return a raw `Response` with a streaming body
   * (e.g. from `node-fetch`, native `fetch`, or a provider SDK's stream mode).
   */
  async relay(
    decision: RouteDecision,
    providerResponse: Response,
    reply: FastifyReply,
    startTime: number,
    query: string,
  ): Promise<void> {
    const headers = buildRoutingHeaders(decision, Date.now() - startTime);

    // Send SSE headers immediately to minimise time-to-first-byte
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      ...headers,
    });

    const body = providerResponse.body;
    if (!body) {
      reply.raw.write("data: [DONE]\n\n");
      reply.raw.end();
      return;
    }

    let tokenCount = 0;
    const decoder = new TextDecoder();

    // @ts-expect-error — ReadableStream types differ between environments
    const reader = (body as ReadableStream<Uint8Array>).getReader?.();

    if (!reader) {
      // Fallback for environments without ReadableStream.getReader
      reply.raw.write("data: [DONE]\n\n");
      reply.raw.end();
      return;
    }

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        reply.raw.write(chunk);

        // Rough token count from data: lines
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (line.startsWith("data:") && !line.includes("[DONE]")) {
            try {
              const json = JSON.parse(line.slice(5).trim());
              const delta = json?.choices?.[0]?.delta?.content ?? "";
              tokenCount += Math.ceil(delta.split(/\s+/).length * 1.3);
            } catch {
              /* non-JSON chunk, skip */
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
      reply.raw.end();
    }

    // Record to savings tracker after stream ends
    if (this.opts.tracker) {
      const latencyMs = Date.now() - startTime;
      const queryTokens = Math.ceil(query.split(/\s+/).length / 0.75);
      const altRate = this.opts.alternativeCostUsdPer1KTokens ?? CLAUDE_SONNET_USD_PER_1K_OUT;
      const alternativeCostUsd = (tokenCount / 1000) * altRate;
      const isCloud = decision.tier.startsWith("cloud");
      const actualCostUsd = isCloud ? alternativeCostUsd * 0.25 : 0; // cloud-mid ≈ 25% of frontier

      const record: RouteRecord = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        queryTokensEstimate: queryTokens,
        tier: decision.tier,
        modelUsed: decision.model,
        actualCostUsd,
        alternativeCostUsd,
        savedUsd: alternativeCostUsd - actualCostUsd,
        latencyMs,
        classifierScore: decision.classification.score,
        localAvailable: true,
        reason: decision.classification.reason,
      };
      this.opts.tracker.record(record);
    }
  }
}
