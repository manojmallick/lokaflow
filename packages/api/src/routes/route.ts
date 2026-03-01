// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
//
// packages/api/src/routes/route.ts
// POST /v1/route — explain the routing decision for a given query.
// Returns the full routing decision with trace, complexity score, and cost estimate.

import type { FastifyPluginAsync } from "fastify";
import type { Router } from "../@lokaflow/core/router/router.js";
import type { Message } from "../@lokaflow/core/types.js";
import type { RouteRequest, RouteResponse } from "../types.js";

interface RouteRouteOptions {
    router: Router;
}

const routeRoute: FastifyPluginAsync<RouteRouteOptions> = async (fastify, opts) => {
    fastify.post<{ Body: RouteRequest }>(
        "/v1/route",
        {
            schema: {
                summary: "Explain routing decision",
                description:
                    "Returns the routing decision for a given message set — which model, " +
                    "which tier, complexity score, reason, trace, and estimated cost. " +
                    "Does NOT execute the query.",
                tags: ["Routing"],
                body: {
                    type: "object",
                    required: ["messages"],
                    properties: {
                        messages: {
                            type: "array",
                            items: {
                                type: "object",
                                required: ["role", "content"],
                                properties: {
                                    role: { type: "string" },
                                    content: { type: "string" },
                                },
                            },
                        },
                    },
                },
            },
        },
        async (request, reply): Promise<RouteResponse> => {
            const messages: Message[] = request.body.messages.map((m) => ({
                role: m.role as "user" | "assistant" | "system",
                content: m.content,
            }));

            const decision = await opts.router.route(messages);

            // Estimate cost for the messages (rough — based on token count × provider rate)
            const inputTokenEstimate = messages.reduce(
                (acc, m) => acc + Math.ceil(m.content.length / 4),
                0,
            );
            const costEstimateEur =
                (inputTokenEstimate / 1000) * decision.provider.costPer1kInputTokens;

            return reply.send({
                decision,
                complexityScore: decision.complexityScore ?? 0,
                tier: decision.tier,
                model: decision.provider.name,
                reason: decision.reason,
                costEstimateEur: parseFloat(costEstimateEur.toFixed(6)),
                trace: decision.trace ?? [],
            } satisfies RouteResponse);
        },
    );
};

export default routeRoute;
