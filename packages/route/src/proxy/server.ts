// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaRoute™ — lokaflow.io

import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import chalk from "chalk";
// Import dynamically or ignore the missing declarations if the root isn't compiled yet
import type { Router } from "@lokaflow/core";
import { loadConfig } from "@lokaflow/core";

// We import the existing root logic to avoid EPERM file locking issues
export class ProxyServer {
    private app: FastifyInstance;
    private router: Router | null = null;
    private port: number;

    constructor(port = 4041) {
        this.port = port;
        this.app = Fastify({
            logger: false, // We use custom chalk logging
        });

        this.setupRoutes();
    }

    private setupRoutes() {
        // Intercept standard OpenAI-compatible chat completion requests
        this.app.post("/v1/chat/completions", async (req: FastifyRequest, reply: FastifyReply) => {
            if (!this.router) {
                reply.status(503).send({ error: { message: "Router not initialized" } });
                return;
            }

            try {
                const body = req.body as any; // Standard OpenAIChatRequest
                const messages = body.messages || [];
                const lastMessage = messages[messages.length - 1];

                if (!lastMessage || typeof lastMessage.content !== "string") {
                    return reply.status(400).send({ error: { message: "Invalid message format" } });
                }

                // Use the core LokaFlow router pipeline to process the request
                const response = await this.router.route([{
                    role: (lastMessage.role ?? "user") as "user" | "assistant" | "system",
                    content: lastMessage.content,
                }]);

                // Map the LokaFlow unified response back to the OpenAI format the client expects
                // (For the MVP proxy, we return a standard non-streaming response)
                const format = {
                    id: `chatcmpl-${Date.now()}`,
                    object: "chat.completion",
                    created: Math.floor(Date.now() / 1000),
                    model: response.model,
                    choices: [
                        {
                            index: 0,
                            message: {
                                role: "assistant",
                                content: response.response.content,
                            },
                            logprobs: null,
                            finish_reason: "stop",
                        },
                    ],
                    usage: {
                        prompt_tokens: response.response.inputTokens,
                        completion_tokens: response.response.outputTokens,
                        total_tokens: response.response.inputTokens + response.response.outputTokens,
                    },
                };

                // Inject routing metadata headers so the client knows what happened (if they check)
                reply.header("X-LokaRoute-Tier", response.tier);
                reply.header("X-LokaRoute-Model", response.model);
                reply.header("X-LokaRoute-Cost", response.response.costEur.toFixed(4));
                reply.header("X-LokaRoute-Latency", response.response.latencyMs.toString());

                return reply.send(format);
            } catch (err: any) {
                console.error(chalk.red(`[Proxy Error] ${err.message}`));
                // Graceful degradation: never 500 the client if possible, but for MVP we return the error
                return reply.status(500).send({ error: { message: err.message } });
            }
        });
    }

    async start(): Promise<void> {
        try {
            const config = loadConfig();
            // Dynamically import providers and Router from core to support lazy loading
            const {
                Router,
                OllamaProvider,
                ClaudeProvider,
                OpenAIProvider,
            } = await import("@lokaflow/core");

            const baseUrl = config.local.baseUrls[0] ?? "http://localhost:11434";
            const localProvider = new OllamaProvider(baseUrl, config.local.defaultModel);

            // Try Claude first, then fall back to OpenAI, else throw
            let cloudProvider;
            try {
                cloudProvider = new ClaudeProvider(undefined, config.cloud.claudeModel);
            } catch {
                cloudProvider = new OpenAIProvider(undefined, config.cloud.openaiModel);
            }

            this.router = new Router({ local: [localProvider], cloud: cloudProvider }, config);

            await this.app.listen({ port: this.port, host: "127.0.0.1" }); // Always localhost only for privacy
            console.log(chalk.green(`\n🚀 LokaRoute Proxy listening on http://127.0.0.1:${this.port}`));
            console.log(chalk.gray(`Point your AI clients to http://127.0.0.1:${this.port}/v1`));
        } catch (err) {
            this.app.log.error(err);
            process.exit(1);
        }
    }

    async stop(): Promise<void> {
        await this.app.close();
    }
}
