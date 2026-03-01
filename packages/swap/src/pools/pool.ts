// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaSwap™ — lokaflow.io

import Database from "better-sqlite3";
import { randomUUID } from "crypto";

export interface ApiCreditPool {
    id: string;
    provider: 'anthropic' | 'openai' | 'google';
    totalCredits: number;           // total API credits purchased
    pricePerMToken: number;         // negotiated rate

    // Pool funding: members buy into the pool using LokaCredits
    fundedBy: Array<{
        memberId: string;
        lokaCreditsPaid: number;
        apiCreditsAllocated: number;
    }>;

    expiresAt: string;              // API credits typically expire in 12 months
    status: 'open' | 'full' | 'closed' | 'expired';

    totalUsed: number;              // tokens consumed so far
    totalRemaining: number;
}

export class PoolUsageTracker {
    constructor(private db: Database.Database) {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS api_pools (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        total_credits INTEGER NOT NULL,
        total_used INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS member_pool_allocations (
        pool_id TEXT NOT NULL,
        member_id TEXT NOT NULL,
        allocated INTEGER NOT NULL,
        used INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(pool_id, member_id),
        FOREIGN KEY(pool_id) REFERENCES api_pools(id)
      );
    `);
    }

    createPool(provider: string, totalCredits: number): string {
        const id = randomUUID();
        this.db.prepare(`
        INSERT INTO api_pools (id, provider, total_credits, status)
        VALUES (?, ?, ?, 'open')
      `).run(id, provider, totalCredits);
        return id;
    }

    allocate(poolId: string, memberId: string, tokens: number): void {
        this.db.prepare(`
         INSERT INTO member_pool_allocations (pool_id, member_id, allocated)
         VALUES (?, ?, ?)
         ON CONFLICT(pool_id, member_id) DO UPDATE SET allocated = allocated + ?
      `).run(poolId, memberId, tokens, tokens);
    }

    async recordUsage(poolId: string, memberId: string, tokensUsed: number): Promise<void> {
        // 1. Check allocations
        const alloc = this.db.prepare(`SELECT allocated, used FROM member_pool_allocations WHERE pool_id = ? AND member_id = ?`)
            .get(poolId, memberId) as any;

        if (!alloc) throw new Error(`[LokaSwap] Member ${memberId} is not subscrubed to pool ${poolId}`);
        if (alloc.used + tokensUsed > alloc.allocated) {
            throw new Error(`[LokaSwap] Member ${memberId} exceeded pool ${poolId} quota`);
        }

        this.db.transaction(() => {
            // Deduct from member 
            this.db.prepare(`UPDATE member_pool_allocations SET used = used + ? WHERE pool_id = ? AND member_id = ?`).run(tokensUsed, poolId, memberId);
            // Deduct from pool global cap
            this.db.prepare(`UPDATE api_pools SET total_used = total_used + ? WHERE id = ?`).run(tokensUsed, poolId);
        })();
    }

    async getMemberRemaining(poolId: string, memberId: string): Promise<number> {
        const alloc = this.db.prepare(`SELECT allocated, used FROM member_pool_allocations WHERE pool_id = ? AND member_id = ?`)
            .get(poolId, memberId) as any;
        if (!alloc) return 0;
        return alloc.allocated - alloc.used;
    }
}
