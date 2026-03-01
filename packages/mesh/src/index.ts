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
