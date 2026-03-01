// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
//
// packages/api/src/routes/chat.ts
// POST /v1/chat/completions — OpenAI-compatible endpoint.
// Drop-in replacement for any OpenAI client — just point baseURL to localhost:4141/v1

import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "crypto";
import type { Router } from "../@lokaflow/core/router/router.js";
import type { Message } from "../@lokaflow/core/types.js";
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
                reply.raw.setHeader("Content-Type", "text/event-stream");
                reply.raw.setHeader("Cache-Control", "no-cache");
                reply.raw.setHeader("Connection", "keep-alive");
                reply.raw.setHeader("X-Accel-Buffering", "no");

                const decision = await opts.router.route(internalMessages);
                const provider = decision.provider;
                const modelName = provider.name;

                // Send role chunk first
                const roleChunk: OpenAIChatChunk = {
                    id: requestId,
                    object: "chat.completion.chunk",
                    created,
                    model: modelName,
                    choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
                };
                reply.raw.write(`data: ${JSON.stringify(roleChunk)}\n\n`);

                try {
                    for await (const token of provider.stream(internalMessages)) {
                        if (reply.raw.destroyed) break;
                        const chunk: OpenAIChatChunk = {
                            id: requestId,
                            object: "chat.completion.chunk",
                            created,
                            model: modelName,
                            choices: [{ index: 0, delta: { content: token }, finish_reason: null }],
                        };
                        reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
                    }
                } finally {
                    // Stop chunk + done sentinel
                    const stopChunk: OpenAIChatChunk = {
                        id: requestId,
                        object: "chat.completion.chunk",
                        created,
                        model: modelName,
                        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
                    };
                    reply.raw.write(`data: ${JSON.stringify(stopChunk)}\n\n`);
                    reply.raw.write("data: [DONE]\n\n");
                    reply.raw.end();
                }
                return;
            }

            // ── Non-streaming response ────────────────────────────────────────────
            const decision = await opts.router.route(internalMessages);
            const response = await decision.provider.complete(internalMessages);

            return reply.send({
                id: requestId,
                object: "chat.completion",
                created,
                model: decision.provider.name,
                choices: [
                    {
                        index: 0,
                        message: { role: "assistant", content: response.content },
                        finish_reason: "stop",
                    },
                ],
                usage: {
                    prompt_tokens: response.inputTokens,
                    completion_tokens: response.outputTokens,
                    total_tokens: response.inputTokens + response.outputTokens,
                },
            } satisfies OpenAIChatResponse);
        },
    );
};

export default chatRoute;
