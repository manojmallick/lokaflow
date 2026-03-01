// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.

/**
 * CostTracker — full query metadata logging for the dashboard.
 * Shares the same SQLite DB as BudgetTracker but adds latency + routing reason.
 *
 * PRIVACY: Only metadata. Query content is NEVER stored.
 */

import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

import type { RoutingDecision } from "../types.js";

export interface QueryLogEntry {
  model: string;
  routingTier: string;
  routingReason: string;
  complexityScore: number;
  inputTokens: number;
  outputTokens: number;
  costEur: number;
  latencyMs: number;
}

export interface DailyReport {
  date: string;
  queries: number;
  costEur: number;
  savedEur: number;
  models: string[];
}

const DEFAULT_DB_PATH = join(homedir(), ".lokaflow", "costs.db");

const CREATE_LOG_TABLE = `
  CREATE TABLE IF NOT EXISTS query_log (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    ts               TEXT    NOT NULL DEFAULT (datetime('now')),
    model            TEXT    NOT NULL,
    routing_tier     TEXT    NOT NULL,
    routing_reason   TEXT    NOT NULL,
    complexity_score REAL    NOT NULL DEFAULT 0.0,
    input_tokens     INTEGER NOT NULL DEFAULT 0,
    output_tokens    INTEGER NOT NULL DEFAULT 0,
    cost_eur         REAL    NOT NULL DEFAULT 0.0,
    latency_ms       INTEGER NOT NULL DEFAULT 0
  )
`;

export class CostTracker {
  private db: Database.Database;

  constructor(dbPath: string = DEFAULT_DB_PATH) {
    const dir = dbPath.substring(0, dbPath.lastIndexOf("/"));
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(dbPath);
    this.db.exec(CREATE_LOG_TABLE);
  }

  /** Log a completed routing decision (metadata only). */
  log(decision: RoutingDecision): void {
    this.db
      .prepare(
        `INSERT INTO query_log
           (model, routing_tier, routing_reason, complexity_score,
            input_tokens, output_tokens, cost_eur, latency_ms)
         VALUES
           (@model, @routingTier, @routingReason, @complexityScore,
            @inputTokens, @outputTokens, @costEur, @latencyMs)`,
      )
      .run({
        model: decision.model,
        routingTier: decision.tier,
        routingReason: decision.reason,
        complexityScore: decision.complexityScore,
        inputTokens: decision.response.inputTokens,
        outputTokens: decision.response.outputTokens,
        costEur: decision.response.costEur,
        latencyMs: Math.round(decision.response.latencyMs),
      });
  }

  /** Daily report for the last N days. */
  getDailyReport(days: number = 7): DailyReport[] {
    const rows = this.db
      .prepare(
        `SELECT
           date(ts)                         AS date,
           COUNT(*)                         AS queries,
           COALESCE(SUM(cost_eur), 0.0)     AS cost_eur,
           GROUP_CONCAT(DISTINCT model)     AS models
         FROM query_log
         WHERE ts >= datetime('now', '-' || ? || ' days')
         GROUP BY date(ts)
         ORDER BY date(ts) DESC`,
      )
      .all(days) as Array<{
      date: string;
      queries: number;
      cost_eur: number;
      models: string;
    }>;

    return rows.map((r) => ({
      date: r.date,
      queries: r.queries,
      costEur: r.cost_eur,
      savedEur: 0, // calculated in report.ts
      models: r.models ? r.models.split(",") : [],
    }));
  }

  getTotals(): { totalEur: number; totalQueries: number; localQueries: number } {
    const row = this.db
      .prepare(
        `SELECT
           COALESCE(SUM(cost_eur), 0.0)     AS total_eur,
           COUNT(*)                         AS total_queries,
           SUM(CASE WHEN routing_tier='local' THEN 1 ELSE 0 END) AS local_queries
         FROM query_log`,
      )
      .get() as { total_eur: number; total_queries: number; local_queries: number };

    return {
      totalEur: row.total_eur,
      totalQueries: row.total_queries,
      localQueries: row.local_queries,
    };
  }

  close(): void {
    this.db.close();
  }
}
