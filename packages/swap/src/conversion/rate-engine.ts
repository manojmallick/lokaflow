// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaSwap™ — lokaflow.io

import Database from "better-sqlite3";
import { INITIAL_CONVERSION_RATES } from "./converter.js";

export interface GovernedRate {
  provider: string;
  /** LokaCredits per 1M input tokens */
  inputMultiplier: number;
  /** LokaCredits per 1M output tokens */
  outputMultiplier: number;
  /** Governance proposal ID that approved this rate */
  proposalId?: string;
  /** ISO 8601 date from which this rate is effective */
  effectiveFrom: string;
  /** ISO 8601 date after which this rate is superseded (null = current) */
  effectiveTo?: string;
  approvedBy: string; // "genesis" | proposalId
  createdAt: string;
}

/**
 * RateEngine — the canonical source of LokaCre­dit ↔ API-credit conversion rates.
 *
 * Rates are governance-controlled: only a passed governance proposal can change them.
 * This prevents any single party from inflating prices.
 *
 * Flow:
 *   1. Governance proposal submitted (via @lokaflow/commons ProposalStore)
 *   2. Voting passes
 *   3. Gov module calls `RateEngine.applyProposedRate()`
 *   4. New rate becomes effective immediately (or on a scheduled date)
 */
export class RateEngine {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this._initSchema();
    this._seedDefaultRates();
  }

  private _initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversion_rates (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        provider         TEXT NOT NULL,
        input_multiplier REAL NOT NULL,
        output_multiplier REAL NOT NULL,
        proposal_id      TEXT,
        effective_from   TEXT NOT NULL,
        effective_to     TEXT,
        approved_by      TEXT NOT NULL,
        created_at       TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_rates_provider ON conversion_rates(provider);
    `);
  }

  /** Insert genesis rates if no rates exist yet */
  private _seedDefaultRates(): void {
    const count = (this.db.prepare(`SELECT COUNT(*) as cnt FROM conversion_rates`).get() as any)?.cnt ?? 0;
    if (count > 0) return;

    const now = new Date().toISOString();
    const effectiveFrom = "2026-01-01";

    const stmt = this.db.prepare(`
      INSERT INTO conversion_rates
        (provider, input_multiplier, output_multiplier, proposal_id, effective_from, approved_by, created_at)
      VALUES (?, ?, ?, 'genesis', ?, 'genesis', ?)
    `);

    for (const [provider, rate] of Object.entries(INITIAL_CONVERSION_RATES)) {
      stmt.run(provider, rate.inputMultiplier, rate.outputMultiplier, effectiveFrom, now);
    }
  }

  /**
   * Get the current active rate for a provider.
   * Returns null if no rate is configured.
   */
  getCurrentRate(provider: string): GovernedRate | null {
    const row = this.db.prepare(`
      SELECT * FROM conversion_rates
      WHERE provider = ?
        AND effective_from <= date('now')
        AND (effective_to IS NULL OR date(effective_to) > date('now'))
      ORDER BY effective_from DESC LIMIT 1
    `).get(provider) as any;
    return row ? this._rowToRate(row) : null;
  }

  /**
   * Get all current rates (one per provider).
   */
  getAllCurrentRates(): GovernedRate[] {
    const providers = (this.db.prepare(`SELECT DISTINCT provider FROM conversion_rates`).all() as any[]).map((r) => r.provider);
    return providers.map((p) => this.getCurrentRate(p)).filter((r): r is GovernedRate => r !== null);
  }

  /**
   * Apply a new rate approved by governance.
   * Automatically supersedes the previous rate for the same provider.
   *
   * @param provider — e.g. "anthropic_sonnet"
   * @param inputMultiplier — LokaCredits per 1M input tokens
   * @param outputMultiplier — LokaCredits per 1M output tokens
   * @param proposalId — the governance proposal that approved this change
   * @param effectiveFrom — ISO date from when this rate is active (default: today)
   */
  applyProposedRate(
    provider: string,
    inputMultiplier: number,
    outputMultiplier: number,
    proposalId: string,
    effectiveFrom?: string,
  ): GovernedRate {
    const now = new Date().toISOString();
    const effectFrom = effectiveFrom ?? now.slice(0, 10);

    // Expire existing active rate
    this.db.prepare(`
      UPDATE conversion_rates
      SET effective_to = ?
      WHERE provider = ? AND effective_to IS NULL
    `).run(effectFrom, provider);

    // Insert new rate
    this.db.prepare(`
      INSERT INTO conversion_rates
        (provider, input_multiplier, output_multiplier, proposal_id, effective_from, approved_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(provider, inputMultiplier, outputMultiplier, proposalId, effectFrom, proposalId, now);

    return this.getCurrentRate(provider)!;
  }

  /**
   * Calculate the LokaCredit cost for an API request at current rates.
   * Throws if no rate is found for the provider.
   */
  calculateCost(provider: string, inputTokens: number, outputTokens: number): number {
    const rate = this.getCurrentRate(provider);
    if (!rate) throw new Error(`[RateEngine] No conversion rate for provider "${provider}"`);
    const cost =
      (inputTokens * rate.inputMultiplier) / 1_000_000 +
      (outputTokens * rate.outputMultiplier) / 1_000_000;
    return Math.ceil(cost);
  }

  private _rowToRate = (row: any): GovernedRate => ({
    provider: row.provider,
    inputMultiplier: row.input_multiplier,
    outputMultiplier: row.output_multiplier,
    proposalId: row.proposal_id ?? undefined,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to ?? undefined,
    approvedBy: row.approved_by,
    createdAt: row.created_at,
  });
}
