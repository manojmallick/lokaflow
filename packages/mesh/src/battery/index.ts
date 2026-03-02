// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaMesh Battery Intelligence™ — lokaflow.io

// Main coordinator — start here
export { BatteryIntelligence } from "./intelligence.js";
export type { BatteryIntelligenceConfig, BatterySnapshot } from "./intelligence.js";

// Platform agents
export { MacOSBatteryAgent } from "./agents/macos-agent.js";
export { LinuxBatteryAgent } from "./agents/linux-agent.js";
export { BatteryAgent, BatteryState, calculateStressScore } from "./agents/base.js";

// Guardians
export { ChargeGuardian } from "./guardian/charge-guardian.js";
export type { BatteryPolicy, ChargeAction, ChargeActionType, ScheduleOverride } from "./guardian/charge-guardian.js";
export { ThermalGuard, getThermalZone } from "./guardian/thermal-guard.js";
export type { ThermalZone, WorkloadProfile } from "./guardian/thermal-guard.js";

// Tracker + predictor
export { HealthTracker } from "./tracker/health-tracker.js";
export type { DegradationRate } from "./tracker/health-tracker.js";
export { LifespanPredictor } from "./tracker/predictor.js";
export type { LifespanPrediction, DegradationTrend } from "./tracker/predictor.js";

// Balancer
export {
  applyBatteryConstraints,
  selectForWearLevelling,
} from "./balancer/battery-workload-balancer.js";

// Store
export { ClusterBatteryStore } from "./store/cluster-battery-store.js";
export type { HealthRecord } from "./store/cluster-battery-store.js";

// Reports + charts
export { BatteryReport } from "./report/battery-report.js";
export { renderSparkline, renderBarChart, renderStressGauge } from "./report/chart.js";
export type { ChartDataPoint, ChartOptions } from "./report/chart.js";

