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
/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/explicit-function-return-type */

import Fastify from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";

import type { ApiServerOptions } from "./types.js";
import {
  Router,
  DashboardTracker,
  OllamaProvider,
  ClaudeProvider,
  GeminiProvider,
  OpenAIProvider,
  GroqProvider,
  envVar,
  VERSION,
  BaseProvider,
} from "@lokaflow/core";

import authPlugin from "./middleware/auth.js";
import healthRoute from "./routes/health.js";
import chatRoute from "./routes/chat.js";
import routeRoute from "./routes/route.js";
import costRoute from "./routes/cost.js";
import modelsRoute from "./routes/models.js";
import historyRoute from "./routes/history.js";
import logsRoute from "./routes/logs.js";

export async function createServer(opts: ApiServerOptions) {
  // Use 0.0.0.0 (all IPv4 interfaces) so browsers can reach the server via both
  // http://localhost:4141 and http://127.0.0.1:4141. Binding to 127.0.0.1 only
  // causes failures on macOS where the browser tries IPv6 (::1) first.
  const { config, port = 4141, host = "0.0.0.0", apiKey, swagger: enableSwagger = true } = opts;

  const isDev = process.env["NODE_ENV"] !== "production";
  const fastify = Fastify({
    logger: isDev
      ? { level: "warn", transport: { target: "pino-pretty", options: { colorize: true } } }
      : { level: "warn" },
  });

  // ── CORS — manual hook at the raw socket level so it works for both normal
  // Fastify responses AND hijacked SSE streams (plugin onSend never fires for those).
  fastify.addHook("onRequest", async (request, reply) => {
    const origin = request.headers["origin"] as string | undefined;
    if (origin) {
      reply.raw.setHeader("Access-Control-Allow-Origin", origin);
      reply.raw.setHeader("Access-Control-Allow-Credentials", "true");
      reply.raw.setHeader("Vary", "Origin");
    }
    if (request.method === "OPTIONS") {
      reply.raw.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      reply.raw.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      reply.raw.setHeader("Access-Control-Max-Age", "86400");
      reply.code(204).send();
    }
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
  await fastify.register(authPlugin, { ...(apiKey !== undefined ? { apiKey } : {}) });

  // ── Build providers ──────────────────────────────────────────────────────────
  const localProviders = config.local.baseUrls.map(
    (url: string) =>
      new OllamaProvider(url, config.local.defaultModel, config.local.timeoutSeconds * 1000),
  );

  // Cloud provider: first available API key wins (same logic as chat.ts)
  let cloudProvider: BaseProvider = localProviders[0]!;
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

  // Specialist provider selection
  let specialistProvider: BaseProvider = localProviders[0]!;
  const wantedSpecialist = config.router.specialistProvider;
  const specialistModel = config.router.specialistModel;

  if (wantedSpecialist === "gemini") {
    if (geminiKey) {
      specialistProvider = new GeminiProvider(
        geminiKey,
        specialistModel ?? config.cloud.geminiModel,
      );
    } else {
      console.warn(
        `[LokaFlow] specialist_provider=gemini but GEMINI_API_KEY is not set. ` +
          `Falling back to local model for specialist tier. ` +
          `Set GEMINI_API_KEY or change specialist_provider to 'ollama' in lokaflow.yaml.`,
      );
    }
  } else if (wantedSpecialist === "ollama" && specialistModel) {
    // Use a dedicated Ollama model (e.g. llama3.3:70b) as the specialist planner.
    // Uses the primary base URL (first in the list).
    const primaryUrl = config.local.baseUrls[0] ?? "http://localhost:11434";
    specialistProvider = new OllamaProvider(
      primaryUrl,
      specialistModel,
      config.local.timeoutSeconds * 1000,
    );
  }

  const router = new Router(
    { local: localProviders, cloud: cloudProvider, specialist: specialistProvider },
    config,
  );

  const tracker = new DashboardTracker();

  // ── Register routes ──────────────────────────────────────────────────────────
  await fastify.register(healthRoute, { router });
  await fastify.register(chatRoute, { router });
  await fastify.register(routeRoute, { router });
  await fastify.register(costRoute, { tracker, config });
  await fastify.register(modelsRoute, { router });
  await fastify.register(historyRoute);
  await fastify.register(logsRoute);

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
