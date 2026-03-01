// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.

/**
 * BudgetTracker — enforces daily and monthly EUR spend caps.
 * Persists costs to ~/.lokaflow/costs.db (SQLite via better-sqlite3).
 *
 * PRIVACY: Only metadata is stored (model, tokens, cost, tier).
 * Query content is NEVER persisted.
 */

import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

import { BudgetExceededError } from "../exceptions.js";

export interface CostRecord {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costEur: number;
  routingTier: string;
}

export interface SpendSummary {
  todayEur: number;
  monthEur: number;
  totalEur: number;
  queryCount: number;
}

const DEFAULT_DB_PATH = join(homedir(), ".lokaflow", "costs.db");

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS costs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    ts           TEXT    NOT NULL DEFAULT (datetime('now')),
    model        TEXT    NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cost_eur     REAL    NOT NULL DEFAULT 0.0,
    routing_tier TEXT    NOT NULL DEFAULT 'local'
  )
`;

const TODAY_TOTAL_SQL = `
  SELECT COALESCE(SUM(cost_eur), 0.0) AS total
  FROM costs
  WHERE date(ts) = date('now')
`;

const MONTH_TOTAL_SQL = `
  SELECT COALESCE(SUM(cost_eur), 0.0) AS total
  FROM costs
  WHERE strftime('%Y-%m', ts) = strftime('%Y-%m', 'now')
`;

export class BudgetTracker {
  private db: Database.Database;
  private readonly dailyLimitEur: number;
  private readonly monthlyLimitEur: number;
  private readonly warnAtPercent: number;

  constructor(
    dailyLimitEur: number = 2.0,
    monthlyLimitEur: number = 30.0,
    warnAtPercent: number = 80,
    dbPath: string = DEFAULT_DB_PATH,
  ) {
    this.dailyLimitEur = dailyLimitEur;
    this.monthlyLimitEur = monthlyLimitEur;
    this.warnAtPercent = warnAtPercent;
    this.db = this.openDb(dbPath);
  }

  private openDb(dbPath: string): Database.Database {
    const dir = dbPath.substring(0, dbPath.lastIndexOf("/"));
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const db = new Database(dbPath);
    db.exec(CREATE_TABLE_SQL);
    return db;
  }

  /**
   * Check current spend against limits, then record the cost.
   * Throws BudgetExceededError BEFORE recording if a limit would be exceeded.
   */
  checkAndRecord(record: CostRecord): void {
    const todayEur = (this.db.prepare(TODAY_TOTAL_SQL).get() as { total: number }).total;
    const monthEur = (this.db.prepare(MONTH_TOTAL_SQL).get() as { total: number }).total;

    if (todayEur + record.costEur > this.dailyLimitEur) {
      throw new BudgetExceededError("daily", this.dailyLimitEur, todayEur);
    }

    if (monthEur + record.costEur > this.monthlyLimitEur) {
      throw new BudgetExceededError("monthly", this.monthlyLimitEur, monthEur);
    }

    this.db
      .prepare(
        `INSERT INTO costs (model, input_tokens, output_tokens, cost_eur, routing_tier)
         VALUES (@model, @inputTokens, @outputTokens, @costEur, @routingTier)`,
      )
      .run(record);

    // Warn when approaching limit
    const dailyPercent = ((todayEur + record.costEur) / this.dailyLimitEur) * 100;
    if (dailyPercent >= this.warnAtPercent) {
      console.warn(
        `[LokaFlow] Budget warning: ${dailyPercent.toFixed(0)}% of daily limit consumed ` +
          `(€${(todayEur + record.costEur).toFixed(3)} / €${this.dailyLimitEur.toFixed(2)})`,
      );
    }
  }

  /** Record a cost entry without checking limits (used for local-tier zero-cost queries). */
  record(record: CostRecord): void {
    this.db
      .prepare(
        `INSERT INTO costs (model, input_tokens, output_tokens, cost_eur, routing_tier)
         VALUES (@model, @inputTokens, @outputTokens, @costEur, @routingTier)`,
      )
      .run(record);
  }

  getSpendSummary(): SpendSummary {
    const today = (this.db.prepare(TODAY_TOTAL_SQL).get() as { total: number }).total;
    const month = (this.db.prepare(MONTH_TOTAL_SQL).get() as { total: number }).total;
    const totals = this.db
      .prepare(`SELECT COALESCE(SUM(cost_eur), 0.0) AS total, COUNT(*) AS cnt FROM costs`)
      .get() as { total: number; cnt: number };

    return {
      todayEur: today,
      monthEur: month,
      totalEur: totals.total,
      queryCount: totals.cnt,
    };
  }

  close(): void {
    this.db.close();
  }
}
