// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
//
// packages/api/src/routes/chat.ts
// POST /v1/chat/completions — OpenAI-compatible endpoint.
// Drop-in replacement for any OpenAI client — just point baseURL to localhost:4141/v1

import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "crypto";
import type { Router } from "@lokaflow/core";
import type { Message } from "@lokaflow/core";
import type { OpenAIChatRequest, OpenAIChatResponse, OpenAIChatChunk } from "../types.js";

interface ChatRouteOptions {
  router: Router;
}

const chatRoute: FastifyPluginAsync<ChatRouteOptions> = async (fastify, opts) => {
  fastify.post<{ Body: OpenAIChatRequest }>(
    "/v1/chat/completions",
    {
      schema: {
        summary: "Chat completions (OpenAI-compatible)",
        description:
          "Drop-in replacement for the OpenAI /v1/chat/completions endpoint. " +
          "Automatically routes the request to the cheapest capable model.",
        tags: ["Chat"],
        body: {
          type: "object",
          required: ["messages"],
          properties: {
            model: { type: "string" },
            messages: {
              type: "array",
              items: {
                type: "object",
                required: ["role", "content"],
                properties: {
                  role: { type: "string", enum: ["system", "user", "assistant"] },
                  content: { type: "string" },
                },
              },
            },
            stream: { type: "boolean", default: false },
          },
        },
      },
    },
    async (request, reply): Promise<OpenAIChatResponse | void> => {
      const { messages, stream = false } = request.body;

      // Convert OpenAI message format → LokaFlow internal format
      const internalMessages: Message[] = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const requestId = `chatcmpl-${randomUUID()}`;
      const created = Math.floor(Date.now() / 1000);

      if (stream) {
        // ── Streaming response (SSE) ──────────────────────────────────────
        // Set ALL response headers via setHeader() — this stores them in
        // Node's kOutHeaders map. The first reply.raw.write() call flushes
        // them to the network atomically. Do NOT use writeHead() — it
        // replaces previously stored headers set by the onRequest CORS hook.
        // reply.hijack() tells Fastify not to call reply.send() after the
        // handler returns, avoiding a double-send error.
        const origin = (request.headers["origin"] as string) ?? "*";
        reply.raw.setHeader("Access-Control-Allow-Origin", origin);
        reply.raw.setHeader("Access-Control-Allow-Credentials", "true");
        reply.raw.setHeader("Vary", "Origin");
        reply.raw.setHeader("Content-Type", "text/event-stream");
        reply.raw.setHeader("Cache-Control", "no-cache");
        reply.raw.setHeader("Connection", "keep-alive");
        reply.raw.setHeader("X-Accel-Buffering", "no");

        const decision = await opts.router.route(internalMessages);
        const modelName = decision.model;

        // Hijack AFTER the async work so Fastify won't try to manage the reply
        reply.hijack();

        // Send role chunk first — this also flushes all the headers above
        const roleChunk: OpenAIChatChunk = {
          id: requestId,
          object: "chat.completion.chunk",
          created,
          model: modelName,
          choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
        };
        reply.raw.write(`data: ${JSON.stringify(roleChunk)}\n\n`);

        // MVP: Router.route() executes completely; send response as a single content chunk
        const contentChunk: OpenAIChatChunk = {
          id: requestId,
          object: "chat.completion.chunk",
          created,
          model: modelName,
          choices: [
            { index: 0, delta: { content: decision.response.content }, finish_reason: null },
          ],
        };
        reply.raw.write(`data: ${JSON.stringify(contentChunk)}\n\n`);

        // Stop chunk
        const stopChunk: OpenAIChatChunk = {
          id: requestId,
          object: "chat.completion.chunk",
          created,
          model: modelName,
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        };
        reply.raw.write(`data: ${JSON.stringify(stopChunk)}\n\n`);

        // LokaFlow trace event — carries the full routing trace + decision metadata
        const traceEvent = {
          _lokaflow_trace: {
            tier: decision.tier,
            model: decision.model,
            reason: decision.reason,
            complexityScore: decision.complexityScore,
            inputTokens: decision.response.inputTokens,
            outputTokens: decision.response.outputTokens,
            costEur: decision.response.costEur,
            latencyMs: decision.response.latencyMs,
            trace: decision.trace,
          },
        };
        reply.raw.write(`data: ${JSON.stringify(traceEvent)}\n\n`);

        reply.raw.write("data: [DONE]\n\n");
        reply.raw.end();
        return;
      }

      // ── Non-streaming response ────────────────────────────────────────────
      const decision = await opts.router.route(internalMessages);

      return reply.send({
        id: requestId,
        object: "chat.completion",
        created,
        model: decision.model,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: decision.response.content },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: decision.response.inputTokens,
          completion_tokens: decision.response.outputTokens,
          total_tokens: decision.response.inputTokens + decision.response.outputTokens,
        },
        _lokaflow_trace: {
          tier: decision.tier,
          model: decision.model,
          reason: decision.reason,
          complexityScore: decision.complexityScore,
          inputTokens: decision.response.inputTokens,
          outputTokens: decision.response.outputTokens,
          costEur: decision.response.costEur,
          latencyMs: decision.response.latencyMs,
          trace: decision.trace,
        },
      } satisfies OpenAIChatResponse);
    },
  );
};

export default chatRoute;
