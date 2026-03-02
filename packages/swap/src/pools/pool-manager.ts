// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaSwap™ — lokaflow.io
/* eslint-disable @typescript-eslint/no-explicit-any */

import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { ApiCreditPool, PoolUsageTracker } from "./pool.js";

export type PoolLifecycleStatus = "open" | "full" | "closed" | "expired";

export interface PoolFundingRecord {
  poolId: string;
  memberId: string;
  lokaCreditsPaid: number;
  apiCreditsAllocated: number;
  fundedAt: string;
}

export interface PoolStatus {
  pool: ApiCreditPool;
  memberCount: number;
  utilizationPct: number;
  isExpired: boolean;
}

/**
 * PoolManager — creates, maintains, and closes shared API credit pools.
 *
 * A pool represents a group purchase tranche: the cooperative buys, say,
 * 50B tokens of Anthropic API credits and this manager tracks which members
 * funded the pool and allocates their share.
 *
 * Lifecycle:
 *   open → members fund in → full → cooperative purchases API credits → closed
 */
export class PoolManager {
  private db: Database.Database;
  private usageTracker: PoolUsageTracker;

  constructor(dbPath?: string) {
    if (!dbPath) {
      const dir = join(homedir(), ".lokaflow");
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      dbPath = join(dir, "swap.db");
    }
    this.db = new Database(dbPath);
    this.usageTracker = new PoolUsageTracker(this.db);
    this._initSchema();
  }

  private _initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS purchase_pools (
        id                TEXT PRIMARY KEY,
        provider          TEXT NOT NULL,
        total_credits     INTEGER NOT NULL,
        purchased_credits INTEGER NOT NULL DEFAULT 0,
        price_per_mtoken  REAL NOT NULL,
        status            TEXT NOT NULL DEFAULT 'open',
        expires_at        TEXT,
        created_at        TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS pool_funding (
        pool_id              TEXT NOT NULL REFERENCES purchase_pools(id),
        member_id            TEXT NOT NULL,
        loka_credits_paid    REAL NOT NULL,
        api_credits_alloc    INTEGER NOT NULL,
        funded_at            TEXT NOT NULL,
        PRIMARY KEY(pool_id, member_id)
      );
    `);
  }

  /**
   * Open a new pool for a provider.
   * @param provider — "anthropic" | "openai" | "google"
   * @param totalCredits — total tokens budgeted for this pool
   * @param pricePerMToken — negotiated EUR/1M tokens rate
   * @param expiresAt — when unused pool credits expire (typically +12 months)
   */
  openPool(
    provider: "anthropic" | "openai" | "google",
    totalCredits: number,
    pricePerMToken: number,
    expiresAt?: string,
  ): string {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const defaultExpiry =
      expiresAt ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    this.db
      .prepare(
        `
      INSERT INTO purchase_pools (id, provider, total_credits, price_per_mtoken, status, expires_at, created_at)
      VALUES (?, ?, ?, ?, 'open', ?, ?)
    `,
      )
      .run(id, provider, totalCredits, pricePerMToken, defaultExpiry, createdAt);

    return id;
  }

  /**
   * Record a member funding into a pool (paying LokaCredits for an API credit allocation).
   * Updates the pool status to 'full' if total_credits are now committed.
   */
  addFunding(
    poolId: string,
    memberId: string,
    lokaCreditsPaid: number,
    apiCreditsAllocated: number,
  ): PoolFundingRecord {
    const now = new Date().toISOString();

    this.db.transaction(() => {
      this.db
        .prepare(
          `
        INSERT OR REPLACE INTO pool_funding (pool_id, member_id, loka_credits_paid, api_credits_alloc, funded_at)
        VALUES (?, ?, ?, ?, ?)
      `,
        )
        .run(poolId, memberId, lokaCreditsPaid, apiCreditsAllocated, now);

      // Update pool status if fully subscribed
      const pool = this.db
        .prepare(`SELECT total_credits FROM purchase_pools WHERE id = ?`)
        .get(poolId) as any;
      const committed = this.db
        .prepare(`SELECT SUM(api_credits_alloc) as total FROM pool_funding WHERE pool_id = ?`)
        .get(poolId) as any;

      if (pool && committed && committed.total >= pool.total_credits) {
        this.db.prepare(`UPDATE purchase_pools SET status = 'full' WHERE id = ?`).run(poolId);
      }

      // Wire into PoolUsageTracker
      this.usageTracker.allocate(poolId, memberId, apiCreditsAllocated);
    })();

    return { poolId, memberId, lokaCreditsPaid, apiCreditsAllocated, fundedAt: now };
  }

  /** Close a pool after cooperative purchase has been executed */
  closePool(poolId: string, purchasedCredits: number): void {
    this.db
      .prepare(
        `
      UPDATE purchase_pools
      SET status = 'closed', purchased_credits = ?
      WHERE id = ?
    `,
      )
      .run(purchasedCredits, poolId);
  }

  /** Get all currently open pools for a provider */
  getOpenPools(provider?: string): PoolStatus[] {
    const rows = provider
      ? (this.db
          .prepare(`SELECT * FROM purchase_pools WHERE provider = ? AND status = 'open'`)
          .all(provider) as any[])
      : (this.db.prepare(`SELECT * FROM purchase_pools WHERE status = 'open'`).all() as any[]);
    return rows.map((r) => this._buildStatus(r));
  }

  /** Get all pools (any status) for a provider */
  getAllPools(provider?: string): PoolStatus[] {
    const rows = provider
      ? (this.db
          .prepare(`SELECT * FROM purchase_pools WHERE provider = ? ORDER BY created_at DESC`)
          .all(provider) as any[])
      : (this.db.prepare(`SELECT * FROM purchase_pools ORDER BY created_at DESC`).all() as any[]);
    return rows.map((r) => this._buildStatus(r));
  }

  /** Mark expired pools */
  expireStale(): number {
    const result = this.db
      .prepare(
        `
      UPDATE purchase_pools
      SET status = 'expired'
      WHERE status IN ('open', 'full', 'closed')
        AND expires_at IS NOT NULL
        AND date(expires_at) < date('now')
    `,
      )
      .run();
    return result.changes;
  }

  /** List all funders for a pool */
  getFunding(poolId: string): PoolFundingRecord[] {
    return (
      this.db
        .prepare(`SELECT * FROM pool_funding WHERE pool_id = ? ORDER BY funded_at ASC`)
        .all(poolId) as any[]
    ).map((r) => ({
      poolId: r.pool_id,
      memberId: r.member_id,
      lokaCreditsPaid: r.loka_credits_paid,
      apiCreditsAllocated: r.api_credits_alloc,
      fundedAt: r.funded_at,
    }));
  }

  private _buildStatus(row: any): PoolStatus {
    const memberCount =
      (
        this.db
          .prepare(`SELECT COUNT(*) as cnt FROM pool_funding WHERE pool_id = ?`)
          .get(row.id) as any
      )?.cnt ?? 0;

    const usedRow = this.db
      .prepare(`SELECT SUM(total_used) as used FROM api_pools WHERE id = ?`)
      .get(row.id) as any;
    const totalUsed = usedRow?.used ?? 0;
    const utilizationPct =
      row.total_credits > 0 ? Math.min(100, (totalUsed / row.total_credits) * 100) : 0;
    const isExpired = row.expires_at ? new Date(row.expires_at) < new Date() : false;

    return {
      pool: {
        id: row.id,
        provider: row.provider,
        totalCredits: row.total_credits,
        pricePerMToken: row.price_per_mtoken,
        fundedBy: [],
        expiresAt:
          row.expires_at ?? new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10),
        status: row.status,
        totalUsed,
        totalRemaining: Math.max(0, row.total_credits - totalUsed),
      },
      memberCount,
      utilizationPct: parseFloat(utilizationPct.toFixed(1)),
      isExpired,
    };
  }
}
