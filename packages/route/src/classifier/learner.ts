// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaRoute™ — lokaflow.io
//
// packages/route/src/classifier/learner.ts
// PersonalisedLearner — adapts classifier thresholds to individual usage patterns.
//
// Privacy guarantee: ONLY token count, score, tier, and feedback are stored.
// Query text is NEVER written to disk.

import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import type { RoutingTier } from "../types/routing.js";
import type { FeedbackSignal, UserClassificationBaseline } from "../types/tracking.js";

interface _LearningRow {
  id: string;
  timestamp: string;
  token_count: number;
  classifier_score: number;
  tier: string;
  feedback: string;
}

export class PersonalisedLearner {
  private db: Database.Database;

  /** Smoothed delta applied to raw classifier scores. Updated lazily. */
  private _delta: number = 0;
  private _confidence: number = 0;
  private _dirty: boolean = true;

  constructor(dbPath?: string) {
    const dir = dbPath ? join(dbPath, "..") : join(homedir(), ".lokaflow");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    this.db = new Database(dbPath ?? join(dir, "route.db"));
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS learning_log (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        token_count INTEGER NOT NULL,
        classifier_score REAL NOT NULL,
        tier TEXT NOT NULL,
        feedback TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_learn_ts ON learning_log(timestamp);
    `);
  }

  /**
   * Record explicit user feedback for a routing decision.
   * "insufficient" → query should have gone to a higher tier.
   * "overkill"     → query was over-routed; a cheaper model was fine.
   */
  recordFeedback(
    tokenCount: number,
    classifierScore: number,
    tier: RoutingTier,
    feedback: FeedbackSignal,
  ): void {
    const stmt = this.db.prepare(
      `INSERT INTO learning_log (id, timestamp, token_count, classifier_score, tier, feedback)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    stmt.run(randomUUID(), new Date().toISOString(), tokenCount, classifierScore, tier, feedback);
    this._dirty = true;
  }

  /**
   * Additive score delta based on correction history.
   * Positive → user tends to need higher tiers (conservative shift).
   * Negative → user tends to over-route (aggressive shift).
   */
  adjustScore(rawScore: number): number {
    this.recompute();
    return Math.max(0, Math.min(rawScore + this._delta, 1));
  }

  /** Current 0.5 baseline (constant until enough corrections accumulate). */
  currentBaseline(): number {
    return 0.5;
  }

  /** Build a full baseline summary for config export. */
  buildBaseline(): UserClassificationBaseline {
    this.recompute();
    return {
      confidenceScore: this._confidence,
      adjustments: { "local-trivial": this._delta, "local-capable": this._delta },
    };
  }

  /** Number of corrections recorded so far. */
  get correctionCount(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM learning_log").get() as { n: number };
    return row.n;
  }

  /** 0–1 confidence in the learned adjustment (saturates at ~100 records). */
  get confidenceScore(): number {
    this.recompute();
    return this._confidence;
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private recompute(): void {
    if (!this._dirty) return;
    this._dirty = false;

    const rows = this.db
      .prepare(
        `SELECT feedback, classifier_score FROM learning_log
         WHERE timestamp > datetime('now', '-90 days')
         ORDER BY timestamp DESC LIMIT 200`,
      )
      .all() as Array<{ feedback: string; classifier_score: number }>;

    if (rows.length < 5) {
      this._delta = 0;
      this._confidence = 0;
      return;
    }

    // Each "insufficient" +0.05, each "overkill" -0.05, smoothed
    const raw = rows.reduce((sum, r) => sum + (r.feedback === "insufficient" ? 0.05 : -0.05), 0);
    this._delta = Math.max(-0.2, Math.min(raw / rows.length, 0.2));
    this._confidence = Math.min(rows.length / 100, 1);
  }
}
