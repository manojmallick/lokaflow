// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
//
// packages/api/src/routes/cost.ts
// GET /v1/cost — routing cost summary and savings dashboard data.

import type { FastifyPluginAsync } from "fastify";
import type { DashboardTracker } from "../@lokaflow/core/dashboard/tracker.js";
import type { LokaFlowConfig } from "../@lokaflow/core/types.js";
import type { CostSummary } from "../types.js";

interface CostRouteOptions {
    tracker: DashboardTracker;
    config: LokaFlowConfig;
}

const costRoute: FastifyPluginAsync<CostRouteOptions> = async (fastify, opts) => {
    fastify.get(
        "/v1/cost",
        {
            schema: {
                summary: "Cost and savings summary",
                description: "Returns today's and this month's cost metrics, routing breakdown, and budget usage.",
                tags: ["Metrics"],
                querystring: {
                    type: "object",
                    properties: {
                        period: { type: "string", enum: ["today", "month", "all"], default: "today" },
                    },
                },
            },
        },
        async (_request, reply): Promise<CostSummary> => {
            const summary = opts.tracker.summary();
            const dailyLimit = opts.config.budget?.dailyLimitEur ?? 2.0;
            const monthlyLimit = opts.config.budget?.monthlyLimitEur ?? 20.0;

            return reply.send({
                today: {
                    totalEur: summary.today.totalEur,
                    queryCount: summary.today.queryCount,
                    localQueries: summary.today.localQueries,
                    cloudQueries: summary.today.cloudQueries,
                },
                month: {
                    totalEur: summary.month.totalEur,
                    queryCount: summary.month.queryCount,
                    savingsVsNaiveEur: summary.month.savingsVsNaiveEur,
                    localPercent: summary.month.queryCount > 0
                        ? Math.round((summary.month.localQueries / summary.month.queryCount) * 100)
                        : 0,
                },
                limits: {
                    dailyLimitEur: dailyLimit,
                    monthlyLimitEur: monthlyLimit,
                    dailyUsedPercent: dailyLimit > 0
                        ? Math.round((summary.today.totalEur / dailyLimit) * 100)
                        : 0,
                    monthlyUsedPercent: monthlyLimit > 0
                        ? Math.round((summary.month.totalEur / monthlyLimit) * 100)
                        : 0,
                },
            } satisfies CostSummary);
        },
    );
};

export default costRoute;
