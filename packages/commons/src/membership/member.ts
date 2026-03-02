// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaCommons™ — lokaflow.io
//
// packages/commons/src/membership/member.ts
// Cooperative membership: profiles, reputation scores, and member registry.

import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// ── Types ──────────────────────────────────────────────────────────────────

export type MemberRole = "contributor" | "supporter" | "operator" | "admin";
export type MemberStatus = "active" | "suspended" | "probation" | "inactive";

export interface MemberProfile {
  id: string;
  displayName: string;
  publicKeyHash: string; // SHA-256 of identity public key
  role: MemberRole;
  status: MemberStatus;
  region: string; // ISO 3166-1 alpha-2, e.g. "NL", "US"
  joinedAt: string;
  lastSeenAt: string;
  computeOffered: boolean; // Whether this member shares compute
  creditsBalance: number;  // Snapshot — authoritative value is in CreditLedger
  reputationScore: number; // 0–1000
}

export interface ReputationScore {
  memberId: string;
  score: number; // 0–1000 (higher is more trustworthy)
  uptimeContribution: number;   // 0–100
  qualityContribution: number;  // 0–100: positive feedback rate
  cooperationIndex: number;     // 0–100: ratio of requests served vs refused
  disputeRatio: number;         // 0–1: (disputes raised) / (total interactions)
  updatedAt: string;
}

export interface MemberActivity {
  memberId: string;
  type:
    | "joined"
    | "credit_earned"
    | "credit_spent"
    | "node_offered"
    | "node_withdrawn"
    | "feedback_given"
    | "feedback_received"
    | "proposal_created"
    | "vote_cast";
  amount?: number;
  reference?: string; // session ID, proposal ID, etc.
  recordedAt: string;
}

// ── MemberRegistry ─────────────────────────────────────────────────────────

export class MemberRegistry {
  private db: Database.Database;

  constructor(dbPath?: string) {
    if (!dbPath) {
      const dir = join(homedir(), ".lokaflow");
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      dbPath = join(dir, "commons.db");
    }
    this.db = new Database(dbPath);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS members (
        id                TEXT PRIMARY KEY,
        display_name      TEXT NOT NULL,
        public_key_hash   TEXT NOT NULL UNIQUE,
        role              TEXT NOT NULL DEFAULT 'contributor',
        status            TEXT NOT NULL DEFAULT 'active',
        region            TEXT NOT NULL DEFAULT 'XX',
        joined_at         TEXT NOT NULL,
        last_seen_at      TEXT NOT NULL,
        compute_offered   INTEGER NOT NULL DEFAULT 0,
        credits_balance   REAL NOT NULL DEFAULT 0.0,
        reputation_score  REAL NOT NULL DEFAULT 500.0
      );

      CREATE TABLE IF NOT EXISTS member_reputation (
        member_id              TEXT PRIMARY KEY REFERENCES members(id),
        score                  REAL NOT NULL DEFAULT 500.0,
        uptime_contribution    REAL NOT NULL DEFAULT 0.0,
        quality_contribution   REAL NOT NULL DEFAULT 50.0,
        cooperation_index      REAL NOT NULL DEFAULT 50.0,
        dispute_ratio          REAL NOT NULL DEFAULT 0.0,
        updated_at             TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS member_activity (
        id          TEXT PRIMARY KEY,
        member_id   TEXT NOT NULL REFERENCES members(id),
        type        TEXT NOT NULL,
        amount      REAL,
        reference   TEXT,
        recorded_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_member_status   ON members(status);
      CREATE INDEX IF NOT EXISTS idx_member_region   ON members(region);
      CREATE INDEX IF NOT EXISTS idx_activity_member ON member_activity(member_id, recorded_at DESC);
    `);
  }

  // ── Write ──────────────────────────────────────────────────────────────

  register(input: Omit<MemberProfile, "id" | "joinedAt" | "lastSeenAt" | "creditsBalance" | "reputationScore">): MemberProfile {
    const id = randomUUID();
    const now = new Date().toISOString();
    const profile: MemberProfile = {
      ...input,
      id,
      joinedAt: now,
      lastSeenAt: now,
      creditsBalance: 0,
      reputationScore: 500,
    };

    this.db.prepare(`
      INSERT INTO members
        (id, display_name, public_key_hash, role, status, region, joined_at, last_seen_at, compute_offered, credits_balance, reputation_score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, profile.displayName, profile.publicKeyHash, profile.role, profile.status,
      profile.region, profile.joinedAt, profile.lastSeenAt,
      profile.computeOffered ? 1 : 0, profile.creditsBalance, profile.reputationScore,
    );

    this.db.prepare(`
      INSERT INTO member_reputation (member_id, score, updated_at)
      VALUES (?, 500.0, ?)
    `).run(id, now);

    this.recordActivity(id, "joined");
    return profile;
  }

  updateProfile(id: string, updates: Partial<Pick<MemberProfile, "displayName" | "region" | "computeOffered" | "status" | "role">>): void {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.displayName !== undefined) { fields.push("display_name = ?"); values.push(updates.displayName); }
    if (updates.region !== undefined) { fields.push("region = ?"); values.push(updates.region); }
    if (updates.computeOffered !== undefined) { fields.push("compute_offered = ?"); values.push(updates.computeOffered ? 1 : 0); }
    if (updates.status !== undefined) { fields.push("status = ?"); values.push(updates.status); }
    if (updates.role !== undefined) { fields.push("role = ?"); values.push(updates.role); }

    if (fields.length === 0) return;
    fields.push("last_seen_at = ?");
    values.push(new Date().toISOString());
    values.push(id);

    this.db.prepare(`UPDATE members SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  }

  touch(id: string): void {
    this.db.prepare(`UPDATE members SET last_seen_at = ? WHERE id = ?`).run(new Date().toISOString(), id);
  }

  updateCreditSnapshot(id: string, balance: number): void {
    this.db.prepare(`UPDATE members SET credits_balance = ? WHERE id = ?`).run(balance, id);
  }

  updateReputation(memberId: string, data: Partial<Omit<ReputationScore, "memberId" | "updatedAt">>): void {
    const existing = this.getReputation(memberId);
    if (!existing) return;

    const merged: ReputationScore = { ...existing, ...data, memberId, updatedAt: new Date().toISOString() };
    // Composite score: weighted average
    merged.score = Math.min(
      1000,
      Math.max(
        0,
        merged.uptimeContribution * 3 +
        merged.qualityContribution * 4 +
        merged.cooperationIndex * 3 -
        merged.disputeRatio * 200,
      ),
    );

    this.db.prepare(`
      INSERT INTO member_reputation
        (member_id, score, uptime_contribution, quality_contribution, cooperation_index, dispute_ratio, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(member_id) DO UPDATE SET
        score = excluded.score,
        uptime_contribution = excluded.uptime_contribution,
        quality_contribution = excluded.quality_contribution,
        cooperation_index = excluded.cooperation_index,
        dispute_ratio = excluded.dispute_ratio,
        updated_at = excluded.updated_at
    `).run(
      merged.memberId, merged.score, merged.uptimeContribution,
      merged.qualityContribution, merged.cooperationIndex, merged.disputeRatio, merged.updatedAt,
    );

    this.db.prepare(`UPDATE members SET reputation_score = ? WHERE id = ?`).run(merged.score, memberId);
  }

  recordActivity(memberId: string, type: MemberActivity["type"], opts?: { amount?: number; reference?: string }): void {
    this.db.prepare(`
      INSERT INTO member_activity (id, member_id, type, amount, reference, recorded_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), memberId, type, opts?.amount ?? null, opts?.reference ?? null, new Date().toISOString());
  }

  // ── Read ───────────────────────────────────────────────────────────────

  getMember(id: string): MemberProfile | undefined {
    return this.db.prepare(`SELECT * FROM members WHERE id = ?`).get(id) as MemberProfile | undefined;
  }

  getMemberByKey(publicKeyHash: string): MemberProfile | undefined {
    return this.db.prepare(`SELECT * FROM members WHERE public_key_hash = ?`).get(publicKeyHash) as MemberProfile | undefined;
  }

  listMembers(opts?: { status?: MemberStatus; role?: MemberRole; region?: string }): MemberProfile[] {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (opts?.status) { conditions.push("status = ?"); values.push(opts.status); }
    if (opts?.role) { conditions.push("role = ?"); values.push(opts.role); }
    if (opts?.region) { conditions.push("region = ?"); values.push(opts.region); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    return this.db.prepare(`SELECT * FROM members ${where} ORDER BY reputation_score DESC`).all(...values) as MemberProfile[];
  }

  getReputation(memberId: string): ReputationScore | undefined {
    return this.db.prepare(`SELECT * FROM member_reputation WHERE member_id = ?`).get(memberId) as ReputationScore | undefined;
  }

  getActivityFeed(memberId: string, limit = 50): MemberActivity[] {
    return this.db.prepare(
      `SELECT * FROM member_activity WHERE member_id = ? ORDER BY recorded_at DESC LIMIT ?`,
    ).all(memberId, limit) as MemberActivity[];
  }

  count(status?: MemberStatus): number {
    if (status) {
      return (this.db.prepare(`SELECT COUNT(*) as n FROM members WHERE status = ?`).get(status) as { n: number }).n;
    }
    return (this.db.prepare(`SELECT COUNT(*) as n FROM members`).get() as { n: number }).n;
  }
}
