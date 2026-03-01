// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaCommons™ — lokaflow.io

import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { CreditTransaction, LedgerAuditResult } from "../types/credits.js";
import { existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export class InsufficientCreditsError extends Error {
    constructor(public balance: number, public required: number) {
        super(`[LokaCommons] Insufficient credits. Balance: ${balance}, Required: ${required}`);
    }
}

export class CreditLedger {
    private db: Database.Database;

    constructor(dbPath?: string) {
        if (!dbPath) {
            const configDir = join(homedir(), ".lokaflow");
            if (!existsSync(configDir)) {
                mkdirSync(configDir, { recursive: true });
            }
            dbPath = join(configDir, "commons.db");
        }

        this.db = new Database(dbPath);
        this.initSchema();
    }

    private initSchema() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS credit_transactions (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        member_id TEXT NOT NULL,
        type TEXT NOT NULL,
        amount INTEGER NOT NULL,
        token_count INTEGER,
        task_id TEXT,
        node_id TEXT,
        balance INTEGER NOT NULL,
        memo TEXT NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_member_time 
      ON credit_transactions(member_id, timestamp DESC);
      
      -- We keep a fast-access view of the current balance, but the ledger 
      -- table above is the true source of truth.
      CREATE TABLE IF NOT EXISTS member_balances (
        member_id TEXT PRIMARY KEY,
        balance INTEGER NOT NULL DEFAULT 0
      );
    `);
    }

    async getBalance(memberId: string): Promise<number> {
        const row = this.db.prepare(`SELECT balance FROM member_balances WHERE member_id = ?`).get(memberId) as any;
        return row ? row.balance : 0;
    }

    // Append-only — NEVER UPDATE or DELETE transactions
    async record(tx: Omit<CreditTransaction, 'id' | 'balance'>): Promise<CreditTransaction> {
        const transactionId = randomUUID();
        const ts = new Date().toISOString();

        // Check negatives before committing
        if (tx.amount < 0 && tx.type === 'spend') {
            const currentBalance = await this.getBalance(tx.memberId);
            if (currentBalance + tx.amount < 0) {
                throw new InsufficientCreditsError(currentBalance, Math.abs(tx.amount));
            }
        }

        const resultTx: CreditTransaction = await new Promise((resolve, reject) => {
            try {
                this.db.transaction(() => {
                    // 1. Update current balance fast-view
                    this.db.prepare(`
                  INSERT INTO member_balances (member_id, balance) VALUES (?, ?)
                  ON CONFLICT(member_id) DO UPDATE SET balance = balance + ?
                `).run(tx.memberId, tx.amount, tx.amount);

                    // 2. Fetch resulting balance inside lock
                    const newBalance = (this.db.prepare(`SELECT balance FROM member_balances WHERE member_id = ?`).get(tx.memberId) as any).balance;

                    // 3. Append to immutable ledger
                    this.db.prepare(`
                  INSERT INTO credit_transactions 
                  (id, timestamp, member_id, type, amount, token_count, task_id, node_id, balance, memo)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                        transactionId, ts, tx.memberId, tx.type, tx.amount,
                        tx.tokenCount, tx.taskId, tx.nodeId, newBalance, tx.memo
                    );

                    resolve({
                        ...tx,
                        id: transactionId,
                        timestamp: ts,
                        balance: newBalance
                    });
                })();
            } catch (e) { reject(e); }
        });

        return resultTx;
    }

    async getHistory(memberId: string, limit: number = 50): Promise<CreditTransaction[]> {
        return this.db.prepare(`
        SELECT * FROM credit_transactions WHERE member_id = ? ORDER BY timestamp DESC LIMIT ?
     `).all(memberId, limit).map((r: any) => ({
            id: r.id,
            timestamp: r.timestamp,
            memberId: r.member_id,
            type: r.type,
            amount: r.amount,
            tokenCount: r.token_count,
            taskId: r.task_id,
            nodeId: r.node_id,
            balance: r.balance,
            memo: r.memo
        }));
    }

    async transfer(fromMemberId: string, toMemberId: string, amount: number, memo: string): Promise<void> {
        // Must be atomic
        this.db.transaction(() => {
            this.record({ memberId: fromMemberId, type: 'spend', amount: -amount, memo });
            this.record({ memberId: toMemberId, type: 'earn', amount: amount, memo });
        })();
    }

    async audit(): Promise<LedgerAuditResult> {
        // 1. Check for negative balances
        const negatives = this.db.prepare(`SELECT member_id, balance FROM member_balances WHERE balance < 0`).all() as any[];

        const issues: string[] = [];
        for (const neg of negatives) {
            issues.push(`Member ${neg.member_id} has forbidden negative balance: ${neg.balance}.`);
        }

        // 2. We could replay ledger calculations to verify `member_balances` table here as well

        return {
            passed: negatives.length === 0,
            negativBalanceCount: negatives.length,
            issues
        };
    }
}
