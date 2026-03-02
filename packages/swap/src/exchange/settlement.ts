// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaSwap™ — lokaflow.io
/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */

import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import chalk from "chalk";

import { ExchangeAsset, ExchangeListing, TradeRecord } from "./listing.js";

// Basic mock ledger for LokaCredits and API Credits (in reality this would sync with a sovereign node/DB)
export class CreditsLedger {
  constructor(private db: Database.Database) {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS member_balances (
        member_id TEXT NOT NULL,
        asset_type TEXT NOT NULL,
        provider_hash TEXT NOT NULL, -- 'none' for lokacredits, or 'anthropic' etc.
        amount INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (member_id, asset_type, provider_hash)
      );
      
      CREATE TABLE IF NOT EXISTS trade_history (
        id TEXT PRIMARY KEY,
        offer_id TEXT NOT NULL,
        request_id TEXT NOT NULL,
        settled_at TEXT NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS active_listings (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL
      );
    `);
  }

  // Returns true if deducted successfully, throws if insufficient balance
  deduct(memberId: string, asset: ExchangeAsset): void {
    const assetType = asset.type;
    const providerHash =
      asset.type === "api-credits"
        ? asset.provider
        : asset.type === "compute-time"
          ? asset.nodeId
          : "none";
    const amount = asset.type === "compute-time" ? asset.hours : asset.amount;

    // We do atomic updates with a check condition
    const info = this.db
      .prepare(
        `
      UPDATE member_balances 
      SET amount = amount - ? 
      WHERE member_id = ? AND asset_type = ? AND provider_hash = ? AND amount >= ?
    `,
      )
      .run(amount, memberId, assetType, providerHash, amount);

    if (info.changes === 0) {
      throw new Error(
        `[LokaSwap] Insufficient balance for ${memberId} to deduct ${amount} of ${assetType}`,
      );
    }
  }

  credit(memberId: string, asset: ExchangeAsset): void {
    const assetType = asset.type;
    const providerHash =
      asset.type === "api-credits"
        ? asset.provider
        : asset.type === "compute-time"
          ? asset.nodeId
          : "none";
    const amount = asset.type === "compute-time" ? asset.hours : asset.amount;

    this.db
      .prepare(
        `
      INSERT INTO member_balances (member_id, asset_type, provider_hash, amount)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(member_id, asset_type, provider_hash) DO UPDATE SET amount = amount + ?
    `,
      )
      .run(memberId, assetType, providerHash, amount, amount);
  }

  recordTrade(offerId: string, requestId: string, tradeId?: string): TradeRecord {
    const id = tradeId ?? randomUUID();
    const settledAt = new Date().toISOString();

    this.db
      .prepare(
        `
      INSERT INTO trade_history (id, offer_id, request_id, settled_at)
      VALUES (?, ?, ?, ?)
    `,
      )
      .run(id, offerId, requestId, settledAt);

    return { id, offerId, requestId, settledAt, status: "settled" };
  }

  markSettled(listingId: string): void {
    this.db
      .prepare(
        `
      INSERT INTO active_listings (id, status) VALUES (?, 'settled')
      ON CONFLICT(id) DO UPDATE SET status = 'settled'
     `,
      )
      .run(listingId);
  }
}

export class TradeSettlement {
  private ledger: CreditsLedger;
  private db: Database.Database;

  constructor(dbPath?: string) {
    if (!dbPath) {
      const configDir = join(homedir(), ".lokaflow");
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
      }
      dbPath = join(configDir, "swap.db");
    }

    this.db = new Database(dbPath);
    this.ledger = new CreditsLedger(this.db);
  }

  // Expose seed function for testing
  seedBalance(memberId: string, asset: ExchangeAsset): void {
    this.ledger.credit(memberId, asset);
  }

  async settle(
    offer: ExchangeListing,
    request: ExchangeListing,
    idempotencyKey?: string,
  ): Promise<TradeRecord> {
    if (idempotencyKey) {
      // Quick check against history table for double-execution
      const existing = this.db
        .prepare(`SELECT * FROM trade_history WHERE id = ?`)
        .get(idempotencyKey) as any;
      if (existing) {
        console.log(
          chalk.gray(`[TradeSettlement] Idempotent hit: tradeoff ${existing.id} already settled.`),
        );
        return {
          id: existing.id,
          offerId: existing.offer_id,
          requestId: existing.request_id,
          settledAt: existing.settled_at,
          status: "settled",
        };
      }
    }

    // SQLite executes inside a transaction to guarantee ACID settlement
    const transaction = this.db.transaction(() => {
      // 1. Deduct from offer creator
      this.ledger.deduct(offer.memberId, offer.asset);

      // 2. Deduct from request creator
      this.ledger.deduct(request.memberId, request.asset);

      // 3. Credit offer creator with what they asked for
      this.ledger.credit(offer.memberId, offer.asking);

      // 4. Credit request creator with what they asked for
      this.ledger.credit(request.memberId, request.asking);

      // 5. Record trade
      const record = this.ledger.recordTrade(offer.id, request.id, idempotencyKey);

      // 6. Update listing statuses
      this.ledger.markSettled(offer.id);
      this.ledger.markSettled(request.id);

      return record;
    });

    try {
      return transaction();
    } catch (e: any) {
      console.error(chalk.red(`[TradeSettlement] Settlement failed & rolled back: ${e.message}`));
      throw e;
    }
  }
}
