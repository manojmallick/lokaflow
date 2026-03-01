// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
//
// packages/api/src/routes/cost.ts
// GET /v1/cost — routing cost summary and savings dashboard data.

import type { FastifyPluginAsync } from "fastify";
import type { DashboardTracker } from "@lokaflow/core";
import type { LokaFlowConfig } from "@lokaflow/core";
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
        description:
          "Returns today's and this month's cost metrics, routing breakdown, and budget usage.",
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
      const todayReports = opts.tracker.getDailyReport(1);
      const todayReport = todayReports[0] ?? {
        date: "",
        queries: 0,
        costEur: 0,
        savedEur: 0,
        models: [],
      };
      const monthReports = opts.tracker.getDailyReport(30);
      const monthTotalEur = monthReports.reduce((sum, r) => sum + r.costEur, 0);
      const monthTotalQueries = monthReports.reduce((sum, r) => sum + r.queries, 0);
      const monthSavingsEur = monthReports.reduce((sum, r) => sum + r.savedEur, 0);
      const totals = opts.tracker.getTotals();
      const dailyLimit = opts.config.budget.dailyEur;
      const monthlyLimit = opts.config.budget.monthlyEur;
      const localPercent =
        totals.totalQueries > 0 ? Math.round((totals.localQueries / totals.totalQueries) * 100) : 0;

      return reply.send({
        today: {
          totalEur: todayReport.costEur,
          queryCount: todayReport.queries,
          localQueries: totals.localQueries,
          cloudQueries: totals.totalQueries - totals.localQueries,
        },
        month: {
          totalEur: monthTotalEur,
          queryCount: monthTotalQueries,
          savingsVsNaiveEur: monthSavingsEur,
          localPercent,
        },
        limits: {
          dailyLimitEur: dailyLimit,
          monthlyLimitEur: monthlyLimit,
          dailyUsedPercent:
            dailyLimit > 0 ? Math.round((todayReport.costEur / dailyLimit) * 100) : 0,
          monthlyUsedPercent:
            monthlyLimit > 0 ? Math.round((monthTotalEur / monthlyLimit) * 100) : 0,
        },
      } satisfies CostSummary);
    },
  );
};

export default costRoute;
