// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
//
// packages/api/src/server.ts
// The LokaFlow REST API server — an OpenAI-compatible proxy at localhost:4141.
//
// Endpoints:
//   POST /v1/chat/completions  ← drop-in for any OpenAI client
//   POST /v1/route             ← explain routing decision (no execution)
//   GET  /v1/cost              ← cost + savings dashboard data
//   GET  /v1/models            ← list available models
//   GET  /v1/health            ← provider health check
//   GET  /docs                 ← Swagger UI (if enabled)

import Fastify from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import fp from "fastify-plugin";

import type { ApiServerOptions } from "./types.js";
import { Router } from "@lokaflow/core/router/router.js";
import { DashboardTracker } from "@lokaflow/core/dashboard/tracker.js";
import {
    OllamaProvider,
    ClaudeProvider,
    GeminiProvider,
    OpenAIProvider,
    GroqProvider,
} from "@lokaflow/core/providers/index.js";
import { envVar } from "@lokaflow/core/utils/security.js";
import { VERSION } from "@lokaflow/core/version.js";

import authPlugin from "./middleware/auth.js";
import healthRoute from "./routes/health.js";
import chatRoute from "./routes/chat.js";
import routeRoute from "./routes/route.js";
import costRoute from "./routes/cost.js";
import modelsRoute from "./routes/models.js";

export async function createServer(opts: ApiServerOptions) {
    const { config, port = 4141, host = "127.0.0.1", apiKey, swagger: enableSwagger = true } = opts;

    const fastify = Fastify({
        logger: {
            level: "warn",
            transport: { target: "pino-pretty", options: { colorize: true } },
        },
    });

    // ── CORS (allow any local app to call the proxy) ────────────────────────────
    await fastify.register(cors, {
        origin: (origin, cb) => {
            // Allow localhost origins (any port) and requests with no origin (curl, etc.)
            if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
                cb(null, true);
            } else {
                cb(new Error("CORS: origin not allowed"), false);
            }
        },
        methods: ["GET", "POST", "OPTIONS"],
    });

    // ── Swagger / OpenAPI docs ──────────────────────────────────────────────────
    if (enableSwagger) {
        await fastify.register(swagger, {
            openapi: {
                openapi: "3.0.0",
                info: {
                    title: "LokaFlow™ REST API",
                    description:
                        "OpenAI-compatible proxy with intelligent local-first routing. " +
                        "Point any OpenAI client to http://localhost:4141/v1 to use LokaFlow.",
                    version: VERSION,
                    contact: { name: "LearnHubPlay BV", url: "https://lokaflow.io" },
                    license: { name: "BUSL 1.1" },
                },
                servers: [{ url: `http://${host}:${port}`, description: "LokaFlow local proxy" }],
                tags: [
                    { name: "Chat", description: "OpenAI-compatible chat completion endpoints" },
                    { name: "Routing", description: "Routing decisions and explain mode" },
                    { name: "Metrics", description: "Cost tracking and savings dashboard" },
                    { name: "Models", description: "Model discovery" },
                    { name: "System", description: "Health and status" },
                ],
            },
        });

        await fastify.register(swaggerUi, {
            routePrefix: "/docs",
            uiConfig: { docExpansion: "list" },
        });
    }

    // ── Authentication (optional) ────────────────────────────────────────────────
    await fastify.register(authPlugin, { apiKey });

    // ── Build providers ──────────────────────────────────────────────────────────
    const localProviders = config.local.baseUrls.map((url: string) =>
        new OllamaProvider(url, config.local.defaultModel, config.local.timeoutSeconds * 1000),
    );

    // Cloud provider: first available API key wins (same logic as chat.ts)
    let cloudProvider = localProviders[0]!;
    const anthropicKey = envVar("ANTHROPIC_API_KEY");
    const openaiKey = envVar("OPENAI_API_KEY");
    const geminiKey = envVar("GEMINI_API_KEY");
    const groqKey = envVar("GROQ_API_KEY");

    if (anthropicKey) {
        cloudProvider = new ClaudeProvider(anthropicKey, config.cloud.claudeModel);
    } else if (openaiKey) {
        cloudProvider = new OpenAIProvider(openaiKey, config.cloud.openaiModel);
    } else if (geminiKey) {
        cloudProvider = new GeminiProvider(geminiKey, config.cloud.geminiModel);
    } else if (groqKey) {
        cloudProvider = new GroqProvider(groqKey, config.cloud.groqModel);
    }

    // Specialist (Gemini preferred)
    let specialistProvider = localProviders[0]!;
    if (config.router.specialistProvider === "gemini" && geminiKey) {
        specialistProvider = new GeminiProvider(
            geminiKey,
            config.router.specialistModel ?? config.cloud.geminiModel,
        );
    }

    const router = new Router(
        { local: localProviders, cloud: cloudProvider, specialist: specialistProvider },
        config.router,
    );

    const tracker = new DashboardTracker();

    // ── Register routes ──────────────────────────────────────────────────────────
    await fastify.register(healthRoute, { router });
    await fastify.register(chatRoute, { router });
    await fastify.register(routeRoute, { router });
    await fastify.register(costRoute, { tracker, config });
    await fastify.register(modelsRoute, { router });

    // Root redirect
    fastify.get("/", async (_req, reply) => {
        return reply.redirect("/docs");
    });

    return { fastify, router, tracker, port, host };
}

export async function startServer(opts: ApiServerOptions): Promise<void> {
    const { fastify, port, host } = await createServer(opts);

    try {
        await fastify.listen({ port, host });
        console.log(
            `\n  LokaFlow™ API  v${VERSION}\n` +
            `  Listening  → http://${host}:${port}/v1\n` +
            `  Swagger UI → http://${host}:${port}/docs\n` +
            `  OpenAI base_url: http://${host}:${port}/v1\n`,
        );
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
}
