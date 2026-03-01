// © 2026 LearnHubPlay BV. All rights reserved.
// packages/mesh/src/index.ts — public API for @lokaflow/mesh

export { LokaMesh } from "./lokamesh.js";
export { NodeRegistry } from "./discovery/registry.js";
export { MdnsDiscovery } from "./discovery/mdns.js";
export { MeshScheduler } from "./scheduler/scheduler.js";
export { NodeHealthChecker } from "./executor/health.js";
export { buildMagicPacket, sendWol } from "./power/wol.js";
export { SleepStateMachine } from "./power/sleep.js";
export { ElectricityMapsClient, GreenReport } from "./green/carbon.js";
export { lokaMeshConfigSchema } from "./types/config.js";
export type { LokaMeshConfig, MeshNodeConfig } from "./types/config.js";
export type { MeshNode, MeshTask, MeshTaskResult, NodeState, NodeRole } from "./types/node.js";
export type { MeshStatus } from "./lokamesh.js";
export type { SchedulerResult } from "./scheduler/scheduler.js";

// Battery Intelligence™
export { ChargeGuardian } from "./battery/guardian/charge-guardian.js";
export { ThermalGuard, getThermalZone } from "./battery/guardian/thermal-guard.js";
export {
  applyBatteryConstraints,
  selectForWearLevelling,
} from "./battery/balancer/battery-workload-balancer.js";
export { ClusterBatteryStore } from "./battery/store/cluster-battery-store.js";
export type { HealthRecord } from "./battery/store/cluster-battery-store.js";
export { HealthTracker } from "./battery/tracker/health-tracker.js";
export type { DegradationRate } from "./battery/tracker/health-tracker.js";
export { BatteryReport } from "./battery/report/battery-report.js";
export { calculateStressScore } from "./battery/agents/base.js";
export type { BatteryAgent, BatteryState } from "./battery/agents/base.js";
