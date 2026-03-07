// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaSwap™ — lokaflow.io
/* eslint-disable @typescript-eslint/no-explicit-any */

import Database from "better-sqlite3";
import { randomUUID } from "crypto";

export type AllocationStatus = "pending" | "active" | "exhausted" | "expired" | "revoked";

export interface ApiCreditAllocation {
  id: string;
  memberId: string;
  poolId: string;
  provider: "anthropic" | "openai" | "google";
  /** Total tokens allocated from the group purchase pool */
  allocatedTokens: number;
  /** Tokens consumed so far */
  usedTokens: number;
  /** LokaCredits the member paid to receive this allocation */
  lokaCreditsPaid: number;
  /** EUR/1M tokens — the negotiated cooperative rate */
  pricePerMToken: number;
  /** When this allocation expires (ISO date) */
  expiresAt: string;
  status: AllocationStatus;
  createdAt: string;
}

export interface AllocationSummary {
  memberId: string;
  totalAllocated: number;
  totalUsed: number;
  totalRemaining: number;
  totalLokaCreditsPaid: number;
  byProvider: Record<string, { allocated: number; used: number; remaining: number }>;
}

/**
 * ApiCreditAllocation — allocates purchased API credits to individual members.
 *
 * When the cooperative secures a volume deal, LokaSwap divides the total
 * purchased tokens among members according to their upfront LokaCre­dit
 * payment. This module tracks who has what, and debits usage on every call.
 */
export class AllocationManager {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this._initSchema();
  }

  private _initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS api_credit_allocations (
        id                 TEXT PRIMARY KEY,
        member_id          TEXT NOT NULL,
        pool_id            TEXT NOT NULL,
        provider           TEXT NOT NULL,
        allocated_tokens   INTEGER NOT NULL,
        used_tokens        INTEGER NOT NULL DEFAULT 0,
        loka_credits_paid  REAL NOT NULL,
        price_per_mtoken   REAL NOT NULL,
        expires_at         TEXT NOT NULL,
        status             TEXT NOT NULL DEFAULT 'pending',
        created_at         TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_alloc_member ON api_credit_allocations(member_id);
      CREATE INDEX IF NOT EXISTS idx_alloc_pool   ON api_credit_allocations(pool_id);
    `);
  }

  /** Reserve tokens for a member from a pool purchase */
  allocate(params: {
    memberId: string;
    poolId: string;
    provider: "anthropic" | "openai" | "google";
    allocatedTokens: number;
    lokaCreditsPaid: number;
    pricePerMToken: number;
    expiresAt: string;
  }): ApiCreditAllocation {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    this.db
      .prepare(
        `
      INSERT INTO api_credit_allocations
        (id, member_id, pool_id, provider, allocated_tokens, loka_credits_paid,
         price_per_mtoken, expires_at, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `,
      )
      .run(
        id,
        params.memberId,
        params.poolId,
        params.provider,
        params.allocatedTokens,
        params.lokaCreditsPaid,
        params.pricePerMToken,
        params.expiresAt,
        createdAt,
      );
    return this.getById(id)!;
  }

  /**
   * Debit token usage from a member's allocation.
   * Throws if the member has no active allocation or has exceeded their quota.
   */
  debitUsage(memberId: string, provider: string, tokensUsed: number): void {
    const alloc = this.db
      .prepare(
        `
      SELECT id, allocated_tokens, used_tokens
      FROM api_credit_allocations
      WHERE member_id = ? AND provider = ? AND status = 'active'
        AND date(expires_at) >= date('now')
      ORDER BY expires_at ASC LIMIT 1
    `,
      )
      .get(memberId, provider) as any;

    if (!alloc) {
      throw new Error(`[LokaSwap] No active ${provider} allocation for member ${memberId}`);
    }

    const newUsed = alloc.used_tokens + tokensUsed;
    if (newUsed > alloc.allocated_tokens) {
      throw new Error(
        `[LokaSwap] Member ${memberId} exceeded ${provider} allocation ` +
          `(${newUsed} > ${alloc.allocated_tokens} tokens)`,
      );
    }

    this.db.transaction(() => {
      this.db
        .prepare(`UPDATE api_credit_allocations SET used_tokens = ? WHERE id = ?`)
        .run(newUsed, alloc.id);

      // Mark exhausted if fully consumed
      if (newUsed >= alloc.allocated_tokens) {
        this.db
          .prepare(`UPDATE api_credit_allocations SET status = 'exhausted' WHERE id = ?`)
          .run(alloc.id);
      }
    })();
  }

  /** Get remaining token balance for a member and provider */
  getRemaining(memberId: string, provider: string): number {
    const alloc = this.db
      .prepare(
        `
      SELECT allocated_tokens, used_tokens
      FROM api_credit_allocations
      WHERE member_id = ? AND provider = ? AND status = 'active'
        AND date(expires_at) >= date('now')
      ORDER BY expires_at ASC LIMIT 1
    `,
      )
      .get(memberId, provider) as any;
    return alloc ? alloc.allocated_tokens - alloc.used_tokens : 0;
  }

  /** Full allocation summary for a member */
  getSummary(memberId: string): AllocationSummary {
    const allocs = this.db
      .prepare(
        `
      SELECT * FROM api_credit_allocations
      WHERE member_id = ? AND status IN ('active', 'exhausted')
    `,
      )
      .all(memberId) as any[];

    const byProvider: AllocationSummary["byProvider"] = {};
    let totalAllocated = 0;
    let totalUsed = 0;
    let totalLokaCreditsPaid = 0;

    for (const a of allocs) {
      totalAllocated += a.allocated_tokens;
      totalUsed += a.used_tokens;
      totalLokaCreditsPaid += a.loka_credits_paid;
      const p = a.provider;
      if (!byProvider[p]) byProvider[p] = { allocated: 0, used: 0, remaining: 0 };
      byProvider[p]!.allocated += a.allocated_tokens;
      byProvider[p]!.used += a.used_tokens;
      byProvider[p]!.remaining += a.allocated_tokens - a.used_tokens;
    }

    return {
      memberId,
      totalAllocated,
      totalUsed,
      totalRemaining: totalAllocated - totalUsed,
      totalLokaCreditsPaid,
      byProvider,
    };
  }

  /** Expire stale allocations where date(expiry) < today */
  expireStale(): number {
    const result = this.db
      .prepare(
        `
      UPDATE api_credit_allocations
      SET status = 'expired'
      WHERE status = 'active' AND date(expires_at) < date('now')
    `,
      )
      .run();
    return result.changes;
  }

  private getById(id: string): ApiCreditAllocation | null {
    const row = this.db.prepare(`SELECT * FROM api_credit_allocations WHERE id = ?`).get(id) as any;
    if (!row) return null;
    return {
      id: row.id,
      memberId: row.member_id,
      poolId: row.pool_id,
      provider: row.provider,
      allocatedTokens: row.allocated_tokens,
      usedTokens: row.used_tokens,
      lokaCreditsPaid: row.loka_credits_paid,
      pricePerMToken: row.price_per_mtoken,
      expiresAt: row.expires_at,
      status: row.status,
      createdAt: row.created_at,
    };
  }
}
