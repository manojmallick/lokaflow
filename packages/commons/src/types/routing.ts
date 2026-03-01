// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaCommons™ — lokaflow.io

export interface CooperativeInferenceRequest {
    memberId: string;
    model: string;
    requiredRegion?: string;       // e.g. 'NL' for GDPR compliance
    latencyRequirement: 'interactive' | 'batch';
    estimatedInputTokens: number;
    estimatedOutputTokens: number;
}

export type ThermalZone = 'optimal' | 'warm' | 'hot' | 'critical';

export interface NodeCapacityReport {
    nodeId: string;
    memberId: string;
    timestamp: string;

    // What this node can offer
    availableModels: string[];       // ['mistral:7b', 'phi3:mini']
    tokensPerSecond: number;         // current measured speed
    queueDepth: number;              // pending tasks (0 = free)

    // Constraints (cooperative scheduler respects these)
    maxConcurrentTasks: number;      // default 1 for personal devices
    acceptsBatchTasks: boolean;      // true when device idle >30min
    dataResidencyRegion: string;     // 'NL' — tasks requiring EU residency match on this

    // Battery state (from LBI)
    batteryStressScore: number;      // 0–100 — scheduler avoids nodes above 60
    thermalZone: ThermalZone;
}
