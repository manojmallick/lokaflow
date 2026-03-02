// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaCommons™ — lokaflow.io
//
// packages/commons/src/governance/proposals.ts
// Cooperative governance: proposals, voting, and on-chain-style ledger of decisions.

import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// ── Types ──────────────────────────────────────────────────────────────────

export type ProposalStatus = "open" | "passed" | "rejected" | "expired" | "withdrawn";
export type VoteChoice = "yes" | "no" | "abstain";

export interface GovernanceProposal {
  id: string;
  title: string;
  description: string;
  proposedBy: string; // memberId
  category: "credit-policy" | "routing-rule" | "membership" | "fee-structure" | "other";
  /** Proposed new value, serialised as JSON string */
  proposedChange: string;
  /** Minimum vote count to be quorate */
  quorum: number;
  /** Fraction of yes votes required to pass (0.5 = simple majority) */
  passThreshold: number;
  status: ProposalStatus;
  createdAt: string;
  expiresAt: string;
  settledAt?: string;
}

export interface VotingRecord {
  id: string;
  proposalId: string;
  memberId: string;
  vote: VoteChoice;
  weight: number; // reputation-weighted vote (default 1.0)
  castAt: string;
reason?: string | undefined;
}

export interface ProposalResult {
  proposalId: string;
  yesWeight: number;
  noWeight: number;
  abstainWeight: number;
  totalVoters: number;
  quorumReached: boolean;
  passed: boolean;
}

// ── ProposalStore ─────────────────────────────────────────────────────────

export class ProposalStore {
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
      CREATE TABLE IF NOT EXISTS governance_proposals (
        id            TEXT PRIMARY KEY,
        title         TEXT NOT NULL,
        description   TEXT NOT NULL,
        proposed_by   TEXT NOT NULL,
        category      TEXT NOT NULL,
        proposed_change TEXT NOT NULL,
        quorum        INTEGER NOT NULL DEFAULT 5,
        pass_threshold REAL NOT NULL DEFAULT 0.5,
        status        TEXT NOT NULL DEFAULT 'open',
        created_at    TEXT NOT NULL,
        expires_at    TEXT NOT NULL,
        settled_at    TEXT
      );

      CREATE TABLE IF NOT EXISTS governance_votes (
        id          TEXT PRIMARY KEY,
        proposal_id TEXT NOT NULL REFERENCES governance_proposals(id),
        member_id   TEXT NOT NULL,
        vote        TEXT NOT NULL CHECK(vote IN ('yes', 'no', 'abstain')),
        weight      REAL NOT NULL DEFAULT 1.0,
        cast_at     TEXT NOT NULL,
        reason      TEXT,
        UNIQUE(proposal_id, member_id)
      );

      CREATE INDEX IF NOT EXISTS idx_proposals_status   ON governance_proposals(status);
      CREATE INDEX IF NOT EXISTS idx_votes_proposal_id  ON governance_votes(proposal_id);
    `);
  }

  // ── Write ──────────────────────────────────────────────────────────────

  createProposal(
    input: Omit<GovernanceProposal, "id" | "status" | "createdAt" | "settledAt">,
  ): GovernanceProposal {
    const id = randomUUID();
    const now = new Date().toISOString();
    const proposal: GovernanceProposal = {
      ...input,
      id,
      status: "open",
      createdAt: now,
    };

    this.db
      .prepare(
        `INSERT INTO governance_proposals
         (id, title, description, proposed_by, category, proposed_change,
          quorum, pass_threshold, status, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        proposal.title,
        proposal.description,
        proposal.proposedBy,
        proposal.category,
        proposal.proposedChange,
        proposal.quorum,
        proposal.passThreshold,
        proposal.status,
        proposal.createdAt,
        proposal.expiresAt,
      );

    return proposal;
  }

  castVote(proposalId: string, memberId: string, vote: VoteChoice, opts?: { weight?: number; reason?: string }): VotingRecord {
    // Verify proposal is still open
    const proposal = this.getProposal(proposalId);
    if (!proposal) throw new Error(`Proposal ${proposalId} not found`);
    if (proposal.status !== "open") throw new Error(`Proposal ${proposalId} is not open for voting (${proposal.status})`);
    if (new Date(proposal.expiresAt) < new Date()) throw new Error(`Proposal ${proposalId} has expired`);

    const record: VotingRecord = {
      id: randomUUID(),
      proposalId,
      memberId,
      vote,
      weight: opts?.weight ?? 1.0,
      castAt: new Date().toISOString(),
      ...(opts?.reason !== undefined ? { reason: opts.reason } : {}),
    };

    this.db
      .prepare(
        `INSERT INTO governance_votes (id, proposal_id, member_id, vote, weight, cast_at, reason)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(proposal_id, member_id) DO UPDATE
         SET vote = excluded.vote, weight = excluded.weight, cast_at = excluded.cast_at, reason = excluded.reason`,
      )
      .run(record.id, record.proposalId, record.memberId, record.vote, record.weight, record.castAt, record.reason ?? null);

    return record;
  }

  /** Tally votes and settle proposal. Must be called explicitly (or scheduled). */
  settleProposal(proposalId: string): ProposalResult {
    const proposal = this.getProposal(proposalId);
    if (!proposal) throw new Error(`Proposal ${proposalId} not found`);

    const rows = this.db
      .prepare(
        `SELECT vote, SUM(weight) as totalWeight, COUNT(*) as voters
         FROM governance_votes WHERE proposal_id = ?
         GROUP BY vote`,
      )
      .all(proposalId) as Array<{ vote: string; totalWeight: number; voters: number }>;

    let yesWeight = 0, noWeight = 0, abstainWeight = 0, totalVoters = 0;
    for (const r of rows) {
      totalVoters += r.voters;
      if (r.vote === "yes") yesWeight = r.totalWeight;
      else if (r.vote === "no") noWeight = r.totalWeight;
      else abstainWeight = r.totalWeight;
    }

    const quorumReached = totalVoters >= proposal.quorum;
    const activeWeight = yesWeight + noWeight; // abstain doesn't count
    const passed = quorumReached && activeWeight > 0 && yesWeight / activeWeight >= proposal.passThreshold;

    const newStatus: ProposalStatus = passed ? "passed" : "rejected";
    const settledAt = new Date().toISOString();

    this.db
      .prepare(`UPDATE governance_proposals SET status = ?, settled_at = ? WHERE id = ?`)
      .run(newStatus, settledAt, proposalId);

    return { proposalId, yesWeight, noWeight, abstainWeight, totalVoters, quorumReached, passed };
  }

  withdrawProposal(proposalId: string, by: string): void {
    const proposal = this.getProposal(proposalId);
    if (!proposal) throw new Error(`Proposal ${proposalId} not found`);
    if (proposal.proposedBy !== by) throw new Error("Only the proposer may withdraw a proposal");
    if (proposal.status !== "open") throw new Error("Can only withdraw open proposals");
    this.db
      .prepare(`UPDATE governance_proposals SET status = 'withdrawn', settled_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), proposalId);
  }

  // ── Read ───────────────────────────────────────────────────────────────

  getProposal(id: string): GovernanceProposal | undefined {
    return this.db.prepare(`SELECT * FROM governance_proposals WHERE id = ?`).get(id) as GovernanceProposal | undefined;
  }

  listProposals(status?: ProposalStatus): GovernanceProposal[] {
    if (status) {
      return this.db.prepare(`SELECT * FROM governance_proposals WHERE status = ? ORDER BY created_at DESC`).all(status) as GovernanceProposal[];
    }
    return this.db.prepare(`SELECT * FROM governance_proposals ORDER BY created_at DESC`).all() as GovernanceProposal[];
  }

  getVotesForProposal(proposalId: string): VotingRecord[] {
    return this.db
      .prepare(`SELECT * FROM governance_votes WHERE proposal_id = ? ORDER BY cast_at ASC`)
      .all(proposalId) as VotingRecord[];
  }

  tally(proposalId: string): ProposalResult {
    const proposal = this.getProposal(proposalId);
    if (!proposal) throw new Error(`Proposal ${proposalId} not found`);

    const rows = this.db
      .prepare(
        `SELECT vote, COALESCE(SUM(weight), 0) as totalWeight, COUNT(*) as voters
         FROM governance_votes WHERE proposal_id = ? GROUP BY vote`,
      )
      .all(proposalId) as Array<{ vote: string; totalWeight: number; voters: number }>;

    let yesWeight = 0, noWeight = 0, abstainWeight = 0, totalVoters = 0;
    for (const r of rows) {
      totalVoters += r.voters;
      if (r.vote === "yes") yesWeight = r.totalWeight;
      else if (r.vote === "no") noWeight = r.totalWeight;
      else abstainWeight = r.totalWeight;
    }

    const quorumReached = totalVoters >= proposal.quorum;
    const activeWeight = yesWeight + noWeight;
    const passed = quorumReached && activeWeight > 0 && yesWeight / activeWeight >= proposal.passThreshold;

    return { proposalId, yesWeight, noWeight, abstainWeight, totalVoters, quorumReached, passed };
  }

  /** Expire all open proposals past their expiry date */
  expireStale(): number {
    const result = this.db
      .prepare(
        `UPDATE governance_proposals
         SET status = 'expired', settled_at = ?
         WHERE status = 'open' AND expires_at < ?`,
      )
      .run(new Date().toISOString(), new Date().toISOString());
    return result.changes;
  }
}
