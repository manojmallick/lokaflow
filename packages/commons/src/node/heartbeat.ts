// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaCommons™ — lokaflow.io
//
// packages/commons/src/node/heartbeat.ts
// Node heartbeat: emit periodic presence signals and store them for health tracking.

import Database from "better-sqlite3";
import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import { existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// ── Types ──────────────────────────────────────────────────────────────────

export interface NodeHeartbeat {
  id: string;
  nodeId: string;
  memberId: string;
  timestamp: string;
  /** Estimated throughput in tokens/sec for the node's primary model */
  tokensPerSecond: number;
  cpuLoad: number; // 0.0–1.0
  memUsedGib: number;
  batteryLevel: number; // 0–100, -1 = desktop/AC
  isCharging: boolean;
  modelsAvailable: string[];
  region: string;
  version: string;
}

export interface NodePresence {
  nodeId: string;
  memberId: string;
  lastSeen: string;
  missedBeats: number;
  status: "alive" | "degraded" | "offline";
  latestBeat: NodeHeartbeat;
}

export type HeartbeatEvent =
  | { type: "heartbeat"; beat: NodeHeartbeat }
  | { type: "offline"; nodeId: string }
  | { type: "recovered"; nodeId: string };

// ── HeartbeatStore ─────────────────────────────────────────────────────────

export class HeartbeatStore {
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
      CREATE TABLE IF NOT EXISTS node_heartbeats (
        id                TEXT PRIMARY KEY,
        node_id           TEXT NOT NULL,
        member_id         TEXT NOT NULL,
        timestamp         TEXT NOT NULL,
        tokens_per_second REAL NOT NULL DEFAULT 0,
        cpu_load          REAL NOT NULL DEFAULT 0,
        mem_used_gib      REAL NOT NULL DEFAULT 0,
        battery_level     INTEGER NOT NULL DEFAULT -1,
        is_charging       INTEGER NOT NULL DEFAULT 1,
        models_available  TEXT NOT NULL DEFAULT '[]',
        region            TEXT NOT NULL DEFAULT 'XX',
        version           TEXT NOT NULL DEFAULT '0.0.0'
      );

      CREATE TABLE IF NOT EXISTS node_presence (
        node_id         TEXT PRIMARY KEY,
        member_id       TEXT NOT NULL,
        last_seen       TEXT NOT NULL,
        missed_beats    INTEGER NOT NULL DEFAULT 0,
        status          TEXT NOT NULL DEFAULT 'alive',
        latest_beat_id  TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_hb_node_time ON node_heartbeats(node_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_presence_status ON node_presence(status);
    `);
  }

  // ── Write ──────────────────────────────────────────────────────────────

  record(beat: Omit<NodeHeartbeat, "id">): NodeHeartbeat {
    const full: NodeHeartbeat = { id: randomUUID(), ...beat };

    this.db
      .prepare(
        `
      INSERT INTO node_heartbeats
        (id, node_id, member_id, timestamp, tokens_per_second, cpu_load,
         mem_used_gib, battery_level, is_charging, models_available, region, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        full.id,
        full.nodeId,
        full.memberId,
        full.timestamp,
        full.tokensPerSecond,
        full.cpuLoad,
        full.memUsedGib,
        full.batteryLevel,
        full.isCharging ? 1 : 0,
        JSON.stringify(full.modelsAvailable),
        full.region,
        full.version,
      );

    // Update presence
    const existing = this.getPresence(full.nodeId);
    const wasOffline = existing?.status === "offline";
    this.db
      .prepare(
        `
      INSERT INTO node_presence (node_id, member_id, last_seen, missed_beats, status, latest_beat_id)
      VALUES (?, ?, ?, 0, 'alive', ?)
      ON CONFLICT(node_id) DO UPDATE SET
        last_seen = excluded.last_seen,
        missed_beats = 0,
        status = 'alive',
        latest_beat_id = excluded.latest_beat_id
    `,
      )
      .run(full.nodeId, full.memberId, full.timestamp, full.id);

    return full;
  }

  /** Mark nodes that haven't sent a beat within `thresholdMs` as degraded/offline */
  sweepStale(thresholdMs = 60_000): { degraded: string[]; offline: string[] } {
    const cutoffDegraded = new Date(Date.now() - thresholdMs).toISOString();
    const cutoffOffline = new Date(Date.now() - thresholdMs * 3).toISOString();

    this.db
      .prepare(
        `
      UPDATE node_presence SET status = 'offline', missed_beats = missed_beats + 1
      WHERE status != 'offline' AND last_seen < ?
    `,
      )
      .run(cutoffOffline);

    this.db
      .prepare(
        `
      UPDATE node_presence SET status = 'degraded', missed_beats = missed_beats + 1
      WHERE status = 'alive' AND last_seen < ? AND last_seen >= ?
    `,
      )
      .run(cutoffDegraded, cutoffOffline);

    const degraded = (
      this.db.prepare(`SELECT node_id FROM node_presence WHERE status = 'degraded'`).all() as {
        node_id: string;
      }[]
    ).map((r) => r.node_id);
    const offline = (
      this.db.prepare(`SELECT node_id FROM node_presence WHERE status = 'offline'`).all() as {
        node_id: string;
      }[]
    ).map((r) => r.node_id);

    return { degraded, offline };
  }

  // ── Read ───────────────────────────────────────────────────────────────

  getPresence(nodeId: string): NodePresence | undefined {
    const row = this.db
      .prepare(
        `
      SELECT p.*, h.node_id, h.member_id, h.timestamp, h.tokens_per_second, h.cpu_load,
             h.mem_used_gib, h.battery_level, h.is_charging, h.models_available, h.region, h.version
      FROM node_presence p
      JOIN node_heartbeats h ON h.id = p.latest_beat_id
      WHERE p.node_id = ?
    `,
      )
      .get(nodeId) as any;

    if (!row) return undefined;
    return this.mapPresence(row);
  }

  listAlive(): NodePresence[] {
    const rows = this.db
      .prepare(
        `
      SELECT p.*, h.node_id AS hb_node_id, h.member_id, h.timestamp, h.tokens_per_second,
             h.cpu_load, h.mem_used_gib, h.battery_level, h.is_charging, h.models_available,
             h.region, h.version
      FROM node_presence p
      JOIN node_heartbeats h ON h.id = p.latest_beat_id
      WHERE p.status != 'offline'
      ORDER BY h.tokens_per_second DESC
    `,
      )
      .all() as any[];
    return rows.map((r) => this.mapPresence(r));
  }

  historyFor(nodeId: string, limit = 100): NodeHeartbeat[] {
    return (
      this.db
        .prepare(
          `
      SELECT * FROM node_heartbeats WHERE node_id = ? ORDER BY timestamp DESC LIMIT ?
    `,
        )
        .all(nodeId, limit) as any[]
    ).map((r) => ({
      id: r.id,
      nodeId: r.node_id,
      memberId: r.member_id,
      timestamp: r.timestamp,
      tokensPerSecond: r.tokens_per_second,
      cpuLoad: r.cpu_load,
      memUsedGib: r.mem_used_gib,
      batteryLevel: r.battery_level,
      isCharging: r.is_charging === 1,
      modelsAvailable: JSON.parse(r.models_available ?? "[]"),
      region: r.region,
      version: r.version,
    }));
  }

  private mapPresence(r: any): NodePresence {
    const beat: NodeHeartbeat = {
      id: r.latest_beat_id ?? r.id,
      nodeId: r.node_id,
      memberId: r.member_id,
      timestamp: r.timestamp,
      tokensPerSecond: r.tokens_per_second,
      cpuLoad: r.cpu_load,
      memUsedGib: r.mem_used_gib,
      batteryLevel: r.battery_level,
      isCharging: r.is_charging === 1,
      modelsAvailable: JSON.parse(r.models_available ?? "[]"),
      region: r.region,
      version: r.version,
    };
    return {
      nodeId: r.node_id,
      memberId: r.member_id,
      lastSeen: r.last_seen,
      missedBeats: r.missed_beats,
      status: r.status,
      latestBeat: beat,
    };
  }
}

// ── HeartbeatEmitter ───────────────────────────────────────────────────────

export interface HeartbeatEmitterConfig {
  nodeId: string;
  memberId: string;
  intervalMs?: number; // default 30_000
  version?: string;
  store?: HeartbeatStore;
  collectMetrics: () => Promise<
    Omit<NodeHeartbeat, "id" | "nodeId" | "memberId" | "timestamp" | "version">
  >;
}

export class HeartbeatEmitter extends EventEmitter {
  private config: Required<HeartbeatEmitterConfig>;
  private store: HeartbeatStore;
  private timer: ReturnType<typeof setInterval> | undefined = undefined;

  constructor(config: HeartbeatEmitterConfig) {
    super();
    this.store = config.store ?? new HeartbeatStore();
    this.config = {
      intervalMs: 30_000,
      version: "1.0.0",
      store: this.store,
      ...config,
    };
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.emit_(), this.config.intervalMs);
    // Send immediately
    void this.emit_();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private async emit_(): Promise<void> {
    try {
      const metrics = await this.config.collectMetrics();
      const beat = this.store.record({
        nodeId: this.config.nodeId,
        memberId: this.config.memberId,
        timestamp: new Date().toISOString(),
        version: this.config.version,
        ...metrics,
      });
      this.emit("heartbeat", { type: "heartbeat", beat } satisfies HeartbeatEvent);
    } catch (err) {
      this.emit("error", err);
    }
  }
}
