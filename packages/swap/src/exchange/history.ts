// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaSwap™ — lokaflow.io

import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { ExchangeAsset, TradeRecord } from "./listing.js";

export interface TradeHistoryRecord extends TradeRecord {
  offeredAsset: ExchangeAsset;
  offeredAsking: ExchangeAsset;
  requestedAsset: ExchangeAsset;
  requestedAsking: ExchangeAsset;
  offererMemberId: string;
  requesterMemberId: string;
}

export interface ExchangeSummary {
  totalTrades: number;
  totalLokaCreditVolume: number;
  totalApiCreditVolume: Record<string, number>; // provider → amount
  tradesByDate: Record<string, number>;          // YYYY-MM-DD → count
  lastTradeAt: string | null;
}

/**
 * ExchangeHistory — append-only trade audit trail.
 *
 * Stores every settled trade with both sides of the exchange for compliance
 * and transparency. Indexed by date for reporting.
 */
export class ExchangeHistory {
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
      CREATE TABLE IF NOT EXISTS exchange_history (
        id                   TEXT PRIMARY KEY,
        offer_id             TEXT NOT NULL,
        request_id           TEXT NOT NULL,
        settled_at           TEXT NOT NULL,
        offerer_member_id    TEXT NOT NULL,
        requester_member_id  TEXT NOT NULL,
        offered_asset_json   TEXT NOT NULL,
        offered_asking_json  TEXT NOT NULL,
        requested_asset_json TEXT NOT NULL,
        requested_asking_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_history_date
        ON exchange_history (date(settled_at));

      CREATE INDEX IF NOT EXISTS idx_history_member
        ON exchange_history (offerer_member_id, requester_member_id);
    `);
  }

  /**
   * Append a settled trade to the audit trail.
   */
  record(trade: TradeHistoryRecord): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO exchange_history
        (id, offer_id, request_id, settled_at, offerer_member_id, requester_member_id,
         offered_asset_json, offered_asking_json, requested_asset_json, requested_asking_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      trade.id,
      trade.offerId,
      trade.requestId,
      trade.settledAt,
      trade.offererMemberId,
      trade.requesterMemberId,
      JSON.stringify(trade.offeredAsset),
      JSON.stringify(trade.offeredAsking),
      JSON.stringify(trade.requestedAsset),
      JSON.stringify(trade.requestedAsking),
    );
  }

  /**
   * Retrieve trade history for a member (as either offerer or requester).
   */
  getForMember(memberId: string, limit = 100): TradeHistoryRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM exchange_history
         WHERE offerer_member_id = ? OR requester_member_id = ?
         ORDER BY settled_at DESC LIMIT ?`,
      )
      .all(memberId, memberId, limit) as any[];
    return rows.map(this._rowToRecord);
  }

  /**
   * Retrieve all trades within a date range (YYYY-MM-DD format).
   */
  getByDateRange(from: string, to: string): TradeHistoryRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM exchange_history
         WHERE date(settled_at) BETWEEN ? AND ?
         ORDER BY settled_at ASC`,
      )
      .all(from, to) as any[];
    return rows.map(this._rowToRecord);
  }

  /**
   * Get a summary of exchange activity over the last N days.
   */
  getSummary(days = 30): ExchangeSummary {
    const rows = this.db
      .prepare(
        `SELECT * FROM exchange_history
         WHERE date(settled_at) >= date('now', ?)`,
      )
      .all(`-${days} days`) as any[];

    const records = rows.map(this._rowToRecord);
    let totalLokaCreditVolume = 0;
    const totalApiCreditVolume: Record<string, number> = {};
    const tradesByDate: Record<string, number> = {};

    for (const r of records) {
      const date = r.settledAt.slice(0, 10);
      tradesByDate[date] = (tradesByDate[date] ?? 0) + 1;

      for (const asset of [r.offeredAsset, r.requestedAsset]) {
        if (asset.type === "lokacredits") {
          totalLokaCreditVolume += asset.amount;
        } else if (asset.type === "api-credits") {
          totalApiCreditVolume[asset.provider] =
            (totalApiCreditVolume[asset.provider] ?? 0) + asset.amount;
        }
      }
    }

    return {
      totalTrades: records.length,
      totalLokaCreditVolume,
      totalApiCreditVolume,
      tradesByDate,
      lastTradeAt: records.length > 0 ? records[0]!.settledAt : null,
    };
  }

  private _rowToRecord = (row: any): TradeHistoryRecord => ({
    id: row.id,
    offerId: row.offer_id,
    requestId: row.request_id,
    settledAt: row.settled_at,
    status: "settled" as const,
    offererMemberId: row.offerer_member_id,
    requesterMemberId: row.requester_member_id,
    offeredAsset: JSON.parse(row.offered_asset_json),
    offeredAsking: JSON.parse(row.offered_asking_json),
    requestedAsset: JSON.parse(row.requested_asset_json),
    requestedAsking: JSON.parse(row.requested_asking_json),
  });
}
