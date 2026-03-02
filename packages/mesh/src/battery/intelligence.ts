// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaMesh Battery Intelligence™ — lokaflow.io

import { platform } from "os";
import { EventEmitter } from "events";
import { BatteryAgent, BatteryState } from "./agents/base.js";
import { ChargeGuardian, BatteryPolicy, ChargeAction } from "./guardian/charge-guardian.js";
import { ThermalGuard, getThermalZone } from "./guardian/thermal-guard.js";
import { ClusterBatteryStore } from "./store/cluster-battery-store.js";
import { HealthTracker } from "./tracker/health-tracker.js";
import { LifespanPredictor, LifespanPrediction } from "./tracker/predictor.js";
import { BatteryReport } from "./report/battery-report.js";

export interface BatteryIntelligenceConfig {
  /** Node identifier (defaults to hostname) */
  nodeId?: string;
  /** Poll interval in milliseconds (default 60_000) */
  pollIntervalMs?: number;
  /** Active protection policy */
  policy?: BatteryPolicy;
  /** SQLite database path (default ~/.lokaflow/battery.db) */
  dbPath?: string;
}

export interface BatterySnapshot {
  state: BatteryState;
  chargeAction: ChargeAction;
  thermalZone: import("./guardian/thermal-guard.js").ThermalZone;
}

/**
 * BatteryIntelligence — top-level coordinator for LokaMesh Battery Intelligence.
 *
 * Usage:
 * ```ts
 * const lbi = await BatteryIntelligence.create({ nodeId: 'mac-mini-m2' });
 * lbi.start();                               // begin polling
 * lbi.on('snapshot', (snap) => { ... });     // react to readings
 * const report = lbi.report.summary(nodeId, history);
 * const pred  = lbi.predict(nodeId);
 * lbi.stop();
 * ```
 */
export class BatteryIntelligence extends EventEmitter {
  readonly nodeId: string;
  private agent: BatteryAgent;
  private guardian: ChargeGuardian;
  private _thermalGuard: ThermalGuard;
  private store: ClusterBatteryStore;
  private healthTracker: HealthTracker;
  private predictor: LifespanPredictor;
  readonly report: BatteryReport;

  private policy: BatteryPolicy;
  private pollIntervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastSnapshotDate: string | null = null;

  private constructor(
    nodeId: string,
    agent: BatteryAgent,
    store: ClusterBatteryStore,
    policy: BatteryPolicy,
    pollIntervalMs: number,
  ) {
    super();
    this.nodeId = nodeId;
    this.agent = agent;
    this.guardian = new ChargeGuardian();
    this._thermalGuard = new ThermalGuard();
    this.store = store;
    this.healthTracker = new HealthTracker(store);
    this.predictor = new LifespanPredictor();
    this.report = new BatteryReport(store, this.healthTracker);
    this.policy = policy;
    this.pollIntervalMs = pollIntervalMs;
  }

  /**
   * Creates a BatteryIntelligence instance with the correct platform agent.
   * Auto-detects platform (macOS / Linux). On Windows, falls back to a no-op stub.
   */
  static async create(config: BatteryIntelligenceConfig = {}): Promise<BatteryIntelligence> {
    const { hostname } = await import("os");
    const nodeId = config.nodeId ?? hostname();
    const pollIntervalMs = config.pollIntervalMs ?? 60_000;
    const policy = config.policy ?? { chargeUpperLimit: 80 };
    const store = new ClusterBatteryStore(config.dbPath);

    const os = platform();
    let agent: BatteryAgent;

    if (os === "darwin") {
      const { MacOSBatteryAgent } = await import("./agents/macos-agent.js");
      agent = new MacOSBatteryAgent(nodeId);
    } else if (os === "linux") {
      const { LinuxBatteryAgent } = await import("./agents/linux-agent.js");
      agent = new LinuxBatteryAgent(nodeId);
    } else {
      // Windows / other — use a stub that reports a sane default
      agent = _buildWindowsStub(nodeId);
    }

    return new BatteryIntelligence(nodeId, agent, store, policy, pollIntervalMs);
  }

  /** Start periodic battery polling. Emits 'snapshot' and 'error' events. */
  start(): void {
    if (this.timer) return;
    // Run immediately, then on interval
    void this._tick();
    this.timer = setInterval(() => void this._tick(), this.pollIntervalMs);
  }

  /** Stop periodic polling. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Perform a single manual reading — useful for one-shot CLI commands. */
  async poll(): Promise<BatterySnapshot> {
    return this._tick();
  }

  /** Returns LifespanPrediction for this node based on stored history. */
  async predict(days = 90): Promise<LifespanPrediction> {
    const records = this.store.getHealthHistory(this.nodeId, days);
    return this.predictor.predict(records);
  }

  private async _tick(): Promise<BatterySnapshot> {
    let state: BatteryState;
    try {
      state = await this.agent.readState();
    } catch (err: any) {
      this.emit("error", err);
      // Return a neutral state so callers don't crash
      state = _neutralState(this.nodeId);
    }

    // Persist to store
    this.store.insertReading({
      nodeId: state.nodeId,
      timestamp: state.timestamp,
      percent: state.percentCharge,
      isCharging: state.isCharging,
      tempC: state.temperatureCelsius,
      healthPct: state.healthPct,
      cycleCount: state.cycleCount,
      stressScore: state.stressScore,
    });

    // Once per day: record a daily health snapshot
    const today = state.timestamp.slice(0, 10);
    if (today !== this.lastSnapshotDate) {
      this.lastSnapshotDate = today;
      await this.healthTracker.recordDailySnapshot(state);
    }

    // Enforce charge guardian
    const chargeAction = await this.guardian.enforce({ ...state, agent: this.agent }, this.policy);

    // Thermal zone
    const thermalZone = getThermalZone(state.temperatureCelsius);

    const snapshot: BatterySnapshot = { state, chargeAction, thermalZone };
    this.emit("snapshot", snapshot);
    return snapshot;
  }
}

/** Stub agent for unsupported platforms (Windows) */
function _buildWindowsStub(nodeId: string): BatteryAgent {
  return {
    platform: "windows" as any,
    supportsChargeControl: false,
    async readState(): Promise<BatteryState> {
      return _neutralState(nodeId);
    },
    async setChargeLimit(): Promise<void> {
      throw new Error(
        "Charge control not supported on Windows via this agent. Use power/windows.ts.",
      );
    },
    async getChargeLimit(): Promise<number | null> {
      return null;
    },
  };
}

function _neutralState(nodeId: string): BatteryState {
  return {
    nodeId,
    timestamp: new Date().toISOString(),
    percentCharge: 50,
    isCharging: false,
    isPluggedIn: false,
    temperatureCelsius: 25,
    currentCapacityMah: 4000,
    designCapacityMah: 4500,
    cycleCount: 0,
    healthPct: 95,
    stressScore: 0,
  };
}
