// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
//
// packages/api/src/routes/models.ts
// GET /v1/models — list available models in OpenAI-compatible format.

import type { FastifyPluginAsync } from "fastify";
import type { Router } from "../@lokaflow/core/router/router.js";

interface ModelsRouteOptions {
    router: Router;
}

interface OpenAIModel {
    id: string;
    object: "model";
    created: number;
    owned_by: string;
    /** LokaFlow extension — routing tier for this model */
    loka_tier?: "local" | "specialist" | "cloud";
    loka_cost_per_1k_input_eur?: number;
}

interface ModelsListResponse {
    object: "list";
    data: OpenAIModel[];
}

const modelsRoute: FastifyPluginAsync<ModelsRouteOptions> = async (fastify, opts) => {
    fastify.get(
        "/v1/models",
        {
            schema: {
                summary: "List available models",
                description:
                    "Returns all configured models in OpenAI-compatible format, with LokaFlow routing tier extensions.",
                tags: ["Models"],
            },
        },
        async (_request, reply): Promise<ModelsListResponse> => {
            const providers = opts.router.providers;
            const created = Math.floor(Date.now() / 1000);
            const models: OpenAIModel[] = [];

            // Local providers
            for (const local of providers.local) {
                models.push({
                    id: local.name,
                    object: "model",
                    created,
                    owned_by: "lokaflow-local",
                    loka_tier: "local",
                    loka_cost_per_1k_input_eur: 0,
                });
            }

            // Specialist
            if (providers.specialist) {
                models.push({
                    id: providers.specialist.name,
                    object: "model",
                    created,
                    owned_by: "lokaflow-specialist",
                    loka_tier: "specialist",
                    loka_cost_per_1k_input_eur: providers.specialist.costPer1kInputTokens,
                });
            }

            // Cloud
            if (providers.cloud && providers.cloud !== providers.specialist) {
                models.push({
                    id: providers.cloud.name,
                    object: "model",
                    created,
                    owned_by: "lokaflow-cloud",
                    loka_tier: "cloud",
                    loka_cost_per_1k_input_eur: providers.cloud.costPer1kInputTokens,
                });
            }

            return reply.send({ object: "list", data: models } satisfies ModelsListResponse);
        },
    );
};

export default modelsRoute;
