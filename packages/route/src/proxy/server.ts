// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaRoute™ — lokaflow.io
//
// packages/route/src/proxy/server.ts
// ProxyServer — drop-in OpenAI-compatible proxy with LokaRoute classifier wired in.
// Clients point to http://127.0.0.1:4041/v1 and get transparent local/cloud routing.

import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import chalk from "chalk";
import { loadConfig } from "@lokaflow/core";
import { QueryClassifier }      from "../classifier/classifier.js";
import { PersonalisedLearner }  from "../classifier/learner.js";
import { RouteDecisionEngine }  from "../router/router.js";
import { buildPolicy }          from "../router/policy.js";
import { SavingsTracker }       from "../tracker/savings-tracker.js";
import { StreamRelay }          from "./stream-relay.js";
import {
  interceptRequest,
  buildForwardBody,
  buildRoutingHeaders,
} from "./interceptor.js";
import { normaliseResponse }    from "./openai-compat.js";
import { randomUUID }           from "crypto";

export interface ProxyServerConfig {
  port?:        number;
  ollamaUrl?:   string;
  cloudApiKey?: string;
  /** Privacy sensitivity: 'conservative' | 'balanced' | 'aggressive' */
  sensitivity?: "conservative" | "balanced" | "aggressive";
  /** Which subscription to compare savings against. Defaults to 'claude-pro'. */
  subscriptionKey?: string;
}

export class ProxyServer {
  private app: FastifyInstance;
  private port: number;
  private ollamaUrl: string;
  private classifier: QueryClassifier;
  private engine: RouteDecisionEngine;
  private tracker: SavingsTracker;
  private streamRelay: StreamRelay;

  constructor(config: ProxyServerConfig = {}) {
    this.port      = config.port      ?? 4041;
    this.ollamaUrl = config.ollamaUrl ?? "http://localhost:11434";
    this.app = Fastify({ logger: false });
    this.tracker     = new SavingsTracker();
    this.streamRelay = new StreamRelay({ tracker: this.tracker });

    try {
      const rawCfg = loadConfig();
      const policy  = buildPolicy(rawCfg as any);
      const learner = new PersonalisedLearner();
      this.classifier = new QueryClassifier({
        sensitivity: config.sensitivity ?? "balanced",
        learner,
      });
      this.engine = new RouteDecisionEngine({
        policy,
        tracker:      this.tracker,
        monthlySpend: () => this.tracker.monthToDateSummary().actualCostUsd,
      });
    } catch {
      // Boot without config — use all defaults
      const learner = new PersonalisedLearner();
      this.classifier = new QueryClassifier({ sensitivity: config.sensitivity ?? "balanced", learner });
      this.engine     = new RouteDecisionEngine({});
    }

    this.setupRoutes();
  }

  private setupRoutes(): void {
    // ── Health check ────────────────────────────────────────────────────────
    this.app.get("/health", async (_req, reply) => {
      return reply.send({ status: "ok", version: "2.0.0", timestamp: new Date().toISOString() });
    });

    // ── List models (OpenAI compat) ─────────────────────────────────────────
    this.app.get("/v1/models", async (_req, reply) => {
      return reply.send({
        object: "list",
        data: [
          { id: "lokaroute-auto", object: "model", created: 0, owned_by: "lokaflow" },
        ],
      });
    });

    // ── Chat completions — the main proxy route ─────────────────────────────
    this.app.post("/v1/chat/completions", async (req: FastifyRequest, reply: FastifyReply) => {
      const intercepted = interceptRequest(req);

      if (!intercepted.query) {
        return reply.status(400).send({ error: { message: "No user message found in request" } });
      }

      // 1. Classify the query
      const classification = this.classifier.classify(intercepted.query, {
        messages:     intercepted.messages.length,
        systemPrompt: intercepted.messages.find(m => m.role === "system")?.content,
      });

      // 2. Route decision
      const decision = this.engine.decide(classification, intercepted.query);

      // 3. Build forward body with swapped model
      const forwardBody = buildForwardBody(intercepted, decision);

      // 4. Determine provider URL from tier
      const targetUrl = this.resolveProviderUrl(decision);

      try {
        if (intercepted.stream) {
          // Streaming path — relay SSE chunk by chunk
          const providerResp = await fetch(targetUrl, {
            method:  "POST",
            headers: {
              "Content-Type":  "application/json",
              "Authorization": `Bearer ${this.resolveApiKey(decision)}`,
            },
            body: JSON.stringify(forwardBody),
          });

          if (!providerResp.ok) {
            const errText = await providerResp.text();
            console.error(chalk.red(`[LokaRoute] Provider error ${providerResp.status}: ${errText}`));
            return reply.status(providerResp.status).send({ error: { message: errText } });
          }

          await this.streamRelay.relay(
            decision, providerResp, reply, intercepted.startTime, intercepted.query,
          );
        } else {
          // Non-streaming path
          const providerResp = await fetch(targetUrl, {
            method:  "POST",
            headers: {
              "Content-Type":  "application/json",
              "Authorization": `Bearer ${this.resolveApiKey(decision)}`,
            },
            body: JSON.stringify(forwardBody),
          });

          const rawJson = await providerResp.json() as Record<string, unknown>;
          const canonical = normaliseResponse(rawJson, decision);
          const headers   = buildRoutingHeaders(decision, Date.now() - intercepted.startTime);

          for (const [k, v] of Object.entries(headers)) {
            reply.header(k, v);
          }

          // Record to tracker
          const tokens = canonical.usage.completion_tokens;
          const isCloud = decision.tier.startsWith("cloud");
          const altCost = (tokens / 1000) * 0.015;
          const actualCost = isCloud ? altCost * 0.25 : 0;
          this.tracker.record({
            id:                  randomUUID(),
            timestamp:           new Date().toISOString(),
            queryTokensEstimate: canonical.usage.prompt_tokens,
            tier:                decision.tier,
            modelUsed:           decision.model,
            actualCostUsd:       actualCost,
            alternativeCostUsd:  altCost,
            savedUsd:            altCost - actualCost,
            latencyMs:           Date.now() - intercepted.startTime,
            classifierScore:     classification.score,
            localAvailable:      true,
            reason:              classification.reason,
          });

          return reply.send(canonical);
        }
      } catch (err: any) {
        console.error(chalk.red(`[LokaRoute] Forward error: ${err.message}`));
        return reply.status(502).send({ error: { message: `Proxy forward failed: ${err.message}` } });
      }
    });

    // ── Embeddings passthrough ──────────────────────────────────────────────
    this.app.post("/v1/embeddings", async (req: FastifyRequest, reply: FastifyReply) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const targetUrl = `${this.ollamaUrl}/v1/embeddings`;
      const resp = await fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      reply.status(resp.status);
      return reply.send(await resp.json());
    });
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private resolveProviderUrl(decision: { tier: string; model: string }): string {
    if (decision.tier.startsWith("local")) {
      return `${this.ollamaUrl}/v1/chat/completions`;
    }
    // Cloud — Anthropic as default
    return "https://api.anthropic.com/v1/messages";
  }

  private resolveApiKey(decision: { tier: string }): string {
    if (decision.tier.startsWith("local")) return "local";
    return process.env["ANTHROPIC_API_KEY"] ??
           process.env["OPENAI_API_KEY"] ??
           "";
  }

  async start(): Promise<void> {
    try {
      await this.app.listen({ port: this.port, host: "127.0.0.1" });
      console.log(chalk.green(`\n  LokaRoute Proxy → http://127.0.0.1:${this.port}/v1`));
      console.log(chalk.gray(`  Point Claude Desktop / Cursor / any OpenAI client to that URL.`));
      console.log(chalk.gray(`  Dashboard → http://127.0.0.1:4040`));
    } catch (err) {
      console.error(chalk.red("[LokaRoute] Failed to start proxy:"), err);
      process.exit(1);
    }
  }

  async stop(): Promise<void> {
    await this.app.close();
  }
}
