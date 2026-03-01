// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
//
// packages/api/src/routes/health.ts
// GET /v1/health — provider status check

import type { FastifyPluginAsync } from "fastify";
import type { Router } from "@lokaflow/core";
import type { HealthResponse, ProviderHealth } from "../types.js";
import { VERSION } from "@lokaflow/core";

// uptime start
const startedAt = Date.now();

interface HealthRouteOptions {
  router: Router;
}

const healthRoute: FastifyPluginAsync<HealthRouteOptions> = async (fastify, opts) => {
  fastify.get(
    "/v1/health",
    {
      schema: {
        summary: "Provider health check",
        description: "Returns the status of all configured providers.",
        tags: ["System"],
      },
    },
    async (_request, reply): Promise<HealthResponse> => {
      const providers = opts.router.getProviders();
      const checks: ProviderHealth[] = [];

      // Check local providers
      for (const local of providers.local) {
        const start = Date.now();
        let status: ProviderHealth["status"] = "unavailable";
        try {
          const ok = await local.healthCheck();
          status = ok ? "ok" : "degraded";
        } catch {
          status = "unavailable";
        }
        const latencyMs = Date.now() - start;
        // Fetch installed models from Ollama (non-blocking, best-effort)
        let models: string[] | undefined;
        if (status !== "unavailable" && local.listModels) {
          models = await local.listModels().catch(() => []);
        }
        checks.push({
          name: local.name,
          tier: "local",
          status,
          latencyMs,
          ...((local as any).model != null ? { model: (local as any).model } : {}),
          ...(models && models.length > 0 ? { models } : {}),
        });
      }

      // Check specialist
      if (providers.specialist) {
        const start = Date.now();
        let status: ProviderHealth["status"] = "unavailable";
        try {
          const ok = await providers.specialist.healthCheck();
          status = ok ? "ok" : "degraded";
        } catch {
          status = "unavailable";
        }
        checks.push({
          name: providers.specialist.name,
          tier: "specialist",
          status,
          latencyMs: Date.now() - start,
        });
      }

      // Check cloud
      {
        const start = Date.now();
        let status: ProviderHealth["status"] = "unavailable";
        try {
          const ok = await providers.cloud.healthCheck();
          status = ok ? "ok" : "degraded";
        } catch {
          status = "unavailable";
        }
        checks.push({
          name: providers.cloud.name,
          tier: "cloud",
          status,
          latencyMs: Date.now() - start,
        });
      }

      const overallStatus = checks.some((c) => c.status === "ok") ? "ok" : "degraded";

      return reply.send({
        status: overallStatus,
        version: VERSION,
        uptime: Math.floor((Date.now() - startedAt) / 1000),
        providers: checks,
      });
    },
  );
};

export default healthRoute;
