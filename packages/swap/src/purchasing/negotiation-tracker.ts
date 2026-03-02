// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaSwap™ — lokaflow.io
/* eslint-disable @typescript-eslint/no-explicit-any */

import Database from "better-sqlite3";
import { randomUUID } from "crypto";

export type NegotiationStatus =
  | "drafting" // building demand case
  | "submitted" // sent to provider
  | "in-progress" // active back-and-forth
  | "agreed" // terms accepted
  | "rejected" // provider declined
  | "expired"; // negotiation window closed

export interface NegotiationRound {
  id: string;
  negotiationId: string;
  roundNumber: number;
  ourOffer: number; // EUR/1M tokens we offered
  providerCounter?: number; // EUR/1M tokens they countered (null if first round)
  note?: string; // free-text negotiation notes
  recordedAt: string; // ISO 8601
}

export interface Negotiation {
  id: string;
  provider: "anthropic" | "openai" | "google";
  status: NegotiationStatus;
  /** Tokens/month demand we presented */
  demandedTokensPerMonth: number;
  /** Our target price (EUR/1M tokens) */
  targetPricePerMToken: number;
  /** Agreed final rate — populated when status === 'agreed' */
  agreedPricePerMToken?: number;
  contractStartDate?: string; // ISO date
  contractEndDate?: string; // ISO date
  /** Total months committed in this deal */
  commitmentMonths?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * NegotiationTracker — records the lifecycle of each API volume negotiation.
 *
 * LokaSwap negotiates enterprise API pricing on behalf of the cooperative.
 * This module tracks the negotiation state: what we offered, what they countered,
 * and the agreed final rate.
 */
export class NegotiationTracker {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this._initSchema();
  }

  private _initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS negotiations (
        id                        TEXT PRIMARY KEY,
        provider                  TEXT NOT NULL,
        status                    TEXT NOT NULL DEFAULT 'drafting',
        demanded_tokens_per_month INTEGER NOT NULL,
        target_price_per_mtoken   REAL NOT NULL,
        agreed_price_per_mtoken   REAL,
        contract_start_date       TEXT,
        contract_end_date         TEXT,
        commitment_months         INTEGER,
        created_at                TEXT NOT NULL,
        updated_at                TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS negotiation_rounds (
        id              TEXT PRIMARY KEY,
        negotiation_id  TEXT NOT NULL REFERENCES negotiations(id),
        round_number    INTEGER NOT NULL,
        our_offer       REAL NOT NULL,
        provider_counter REAL,
        note            TEXT,
        recorded_at     TEXT NOT NULL
      );
    `);
  }

  /** Create a new negotiation record */
  create(
    provider: "anthropic" | "openai" | "google",
    demandedTokensPerMonth: number,
    targetPricePerMToken: number,
  ): Negotiation {
    const now = new Date().toISOString();
    const id = randomUUID();
    this.db
      .prepare(
        `
      INSERT INTO negotiations
        (id, provider, status, demanded_tokens_per_month, target_price_per_mtoken, created_at, updated_at)
      VALUES (?, ?, 'drafting', ?, ?, ?, ?)
    `,
      )
      .run(id, provider, demandedTokensPerMonth, targetPricePerMToken, now, now);
    return this.get(id)!;
  }

  /** Advance the negotiation status */
  updateStatus(id: string, status: NegotiationStatus): void {
    this.db
      .prepare(`UPDATE negotiations SET status = ?, updated_at = ? WHERE id = ?`)
      .run(status, new Date().toISOString(), id);
  }

  /** Record the agreed price when a deal is struck */
  markAgreed(
    id: string,
    agreedPricePerMToken: number,
    contractStartDate: string,
    contractEndDate: string,
    commitmentMonths: number,
  ): void {
    this.db
      .prepare(
        `
      UPDATE negotiations
      SET status = 'agreed',
          agreed_price_per_mtoken = ?,
          contract_start_date = ?,
          contract_end_date = ?,
          commitment_months = ?,
          updated_at = ?
      WHERE id = ?
    `,
      )
      .run(
        agreedPricePerMToken,
        contractStartDate,
        contractEndDate,
        commitmentMonths,
        new Date().toISOString(),
        id,
      );
  }

  /** Record a negotiation round */
  addRound(
    negotiationId: string,
    ourOffer: number,
    providerCounter?: number,
    note?: string,
  ): NegotiationRound {
    const id = randomUUID();
    const roundNumber = this._nextRoundNumber(negotiationId);
    const recordedAt = new Date().toISOString();
    this.db
      .prepare(
        `
      INSERT INTO negotiation_rounds
        (id, negotiation_id, round_number, our_offer, provider_counter, note, recorded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        id,
        negotiationId,
        roundNumber,
        ourOffer,
        providerCounter ?? null,
        note ?? null,
        recordedAt,
      );
    return {
      id,
      negotiationId,
      roundNumber,
      ourOffer,
      ...(providerCounter !== undefined && { providerCounter }),
      ...(note !== undefined && { note }),
      recordedAt,
    };
  }

  /** Retrieve a single negotiation by id */
  get(id: string): Negotiation | null {
    const row = this.db.prepare(`SELECT * FROM negotiations WHERE id = ?`).get(id) as any;
    return row ? this._rowToNegotiation(row) : null;
  }

  /** Retrieve all negotiations for a provider */
  getAllForProvider(provider: string): Negotiation[] {
    return (
      this.db
        .prepare(`SELECT * FROM negotiations WHERE provider = ? ORDER BY created_at DESC`)
        .all(provider) as any[]
    ).map(this._rowToNegotiation);
  }

  /** Get the current agreed rate for a provider (null if no active deal) */
  getCurrentRate(provider: string): number | null {
    const row = this.db
      .prepare(
        `
      SELECT agreed_price_per_mtoken FROM negotiations
      WHERE provider = ? AND status = 'agreed'
        AND (contract_end_date IS NULL OR date(contract_end_date) >= date('now'))
      ORDER BY contract_start_date DESC LIMIT 1
    `,
      )
      .get(provider) as any;
    return row?.agreed_price_per_mtoken ?? null;
  }

  /** Rounds for a given negotiation */
  getRounds(negotiationId: string): NegotiationRound[] {
    return (
      this.db
        .prepare(
          `SELECT * FROM negotiation_rounds WHERE negotiation_id = ? ORDER BY round_number ASC`,
        )
        .all(negotiationId) as any[]
    ).map((r) => ({
      id: r.id,
      negotiationId: r.negotiation_id,
      roundNumber: r.round_number,
      ourOffer: r.our_offer,
      providerCounter: r.provider_counter ?? undefined,
      note: r.note ?? undefined,
      recordedAt: r.recorded_at,
    }));
  }

  private _nextRoundNumber(negotiationId: string): number {
    const result = this.db
      .prepare(
        `SELECT MAX(round_number) as maxRound FROM negotiation_rounds WHERE negotiation_id = ?`,
      )
      .get(negotiationId) as any;
    return (result?.maxRound ?? 0) + 1;
  }

  private _rowToNegotiation = (row: any): Negotiation => ({
    id: row.id,
    provider: row.provider,
    status: row.status as NegotiationStatus,
    demandedTokensPerMonth: row.demanded_tokens_per_month,
    targetPricePerMToken: row.target_price_per_mtoken,
    agreedPricePerMToken: row.agreed_price_per_mtoken ?? undefined,
    contractStartDate: row.contract_start_date ?? undefined,
    contractEndDate: row.contract_end_date ?? undefined,
    commitmentMonths: row.commitment_months ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}
