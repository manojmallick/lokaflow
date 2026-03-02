// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaSwap™ — lokaflow.io

import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export interface UsageEvent {
  poolId: string;
  memberId: string;
  provider: "anthropic" | "openai" | "google";
  tokensUsed: number;
  modelId: string;
  recordedAt: string; // ISO 8601
}

export interface MemberUsageSummary {
  memberId: string;
  provider: string;
  totalTokensUsed: number;
  totalRequests: number;
  avgTokensPerRequest: number;
  firstUsedAt: string | null;
  lastUsedAt: string | null;
  dailyBreakdown: Record<string, number>; // YYYY-MM-DD → tokens
}

export interface PoolUsageSummary {
  poolId: string;
  provider: string;
  totalTokensUsed: number;
  totalRequests: number;
  memberCount: number;
  topConsumers: Array<{ memberId: string; tokensUsed: number }>;
}

/**
 * PoolConsumptionTracker — tracks API credit consumption at the pool level.
 *
 * Records every API call consuming from a group purchase pool,
 * enabling per-member analytics and cooperative-wide reporting.
 * This is separate from `PoolUsageTracker` (which handles quota enforcement)
 * and focuses on analytics / reporting.
 */
export class PoolConsumptionTracker {
  private db: Database.Database;

  constructor(dbPath?: string) {
    if (!dbPath) {
      const dir = join(homedir(), ".lokaflow");
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      dbPath = join(dir, "swap.db");
    }
    this.db = new Database(dbPath);
    this._initSchema();
  }

  private _initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pool_usage_events (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        pool_id     TEXT NOT NULL,
        member_id   TEXT NOT NULL,
        provider    TEXT NOT NULL,
        tokens_used INTEGER NOT NULL,
        model_id    TEXT NOT NULL,
        recorded_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_usage_member ON pool_usage_events(member_id);
      CREATE INDEX IF NOT EXISTS idx_usage_pool   ON pool_usage_events(pool_id);
      CREATE INDEX IF NOT EXISTS idx_usage_date   ON pool_usage_events(date(recorded_at));
    `);
  }

  /** Record an API token consumption event */
  record(event: Omit<UsageEvent, "recordedAt"> & { recordedAt?: string }): void {
    const recordedAt = event.recordedAt ?? new Date().toISOString();
    this.db
      .prepare(
        `
      INSERT INTO pool_usage_events (pool_id, member_id, provider, tokens_used, model_id, recorded_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        event.poolId,
        event.memberId,
        event.provider,
        event.tokensUsed,
        event.modelId,
        recordedAt,
      );
  }

  /** Usage summary for a specific member across all their pools */
  getMemberSummary(memberId: string, provider?: string, days = 30): MemberUsageSummary[] {
    const baseQuery = `
      SELECT
        provider,
        SUM(tokens_used) as total_tokens,
        COUNT(*) as total_requests,
        MIN(recorded_at) as first_used,
        MAX(recorded_at) as last_used
      FROM pool_usage_events
      WHERE member_id = ?
        AND date(recorded_at) >= date('now', ?)
        ${provider ? "AND provider = ?" : ""}
      GROUP BY provider
    `;
    const args: any[] = [memberId, `-${days} days`, ...(provider ? [provider] : [])];
    const rows = this.db.prepare(baseQuery).all(...args) as any[];

    return rows.map((row) => {
      const dailyRows = this.db
        .prepare(
          `
        SELECT date(recorded_at) as day, SUM(tokens_used) as tokens
        FROM pool_usage_events
        WHERE member_id = ? AND provider = ? AND date(recorded_at) >= date('now', ?)
        GROUP BY date(recorded_at)
      `,
        )
        .all(memberId, row.provider, `-${days} days`) as any[];

      const dailyBreakdown: Record<string, number> = {};
      for (const d of dailyRows) {
        dailyBreakdown[d.day] = d.tokens;
      }

      return {
        memberId,
        provider: row.provider,
        totalTokensUsed: row.total_tokens ?? 0,
        totalRequests: row.total_requests ?? 0,
        avgTokensPerRequest:
          row.total_requests > 0 ? Math.round(row.total_tokens / row.total_requests) : 0,
        firstUsedAt: row.first_used ?? null,
        lastUsedAt: row.last_used ?? null,
        dailyBreakdown,
      };
    });
  }

  /** Usage summary for an entire pool */
  getPoolSummary(poolId: string): PoolUsageSummary | null {
    const overview = this.db
      .prepare(
        `
      SELECT
        provider,
        SUM(tokens_used) as total_tokens,
        COUNT(*) as total_requests,
        COUNT(DISTINCT member_id) as member_count
      FROM pool_usage_events WHERE pool_id = ?
    `,
      )
      .get(poolId) as any;

    if (!overview) return null;

    const topRows = this.db
      .prepare(
        `
      SELECT member_id, SUM(tokens_used) as tokens
      FROM pool_usage_events WHERE pool_id = ?
      GROUP BY member_id
      ORDER BY tokens DESC LIMIT 10
    `,
      )
      .all(poolId) as any[];

    return {
      poolId,
      provider: overview.provider ?? "unknown",
      totalTokensUsed: overview.total_tokens ?? 0,
      totalRequests: overview.total_requests ?? 0,
      memberCount: overview.member_count ?? 0,
      topConsumers: topRows.map((r) => ({ memberId: r.member_id, tokensUsed: r.tokens })),
    };
  }

  /** Most recent N events for a member/pool combination */
  getRecentEvents(memberId: string, poolId?: string, limit = 50): UsageEvent[] {
    const rows = poolId
      ? (this.db
          .prepare(
            `SELECT * FROM pool_usage_events WHERE member_id = ? AND pool_id = ? ORDER BY recorded_at DESC LIMIT ?`,
          )
          .all(memberId, poolId, limit) as any[])
      : (this.db
          .prepare(
            `SELECT * FROM pool_usage_events WHERE member_id = ? ORDER BY recorded_at DESC LIMIT ?`,
          )
          .all(memberId, limit) as any[]);

    return rows.map((r) => ({
      poolId: r.pool_id,
      memberId: r.member_id,
      provider: r.provider,
      tokensUsed: r.tokens_used,
      modelId: r.model_id,
      recordedAt: r.recorded_at,
    }));
  }
}
