// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaMesh Battery Intelligence™ — lokaflow.io

import { BatteryState } from "../agents/base.js";

export type ThermalZone = 'optimal' | 'warm' | 'hot' | 'critical';

export function getThermalZone(tempCelsius: number): ThermalZone {
    if (tempCelsius < 25) return 'optimal';
    if (tempCelsius < 35) return 'warm';
    if (tempCelsius < 45) return 'hot';
    return 'critical';
}

export interface WorkloadProfile {
    priority: 'interactive' | 'batch' | 'background';
    estimatedDurationMs?: number;
}

export class ThermalGuard {
    shouldAcceptWorkload(state: BatteryState, workload: WorkloadProfile): boolean {
        const zone = getThermalZone(state.temperatureCelsius);

        switch (zone) {
            case 'optimal': return true;
            case 'warm': return true;
            case 'hot': return workload.priority === 'interactive';  // only urgent tasks
            case 'critical': return false;                               // no new tasks
        }
    }

    // Called by MeshScheduler — integrates with existing node scoring
    applyThermalPenalty(nodeScore: number, state: BatteryState): number {
        const zone = getThermalZone(state.temperatureCelsius);
        const penalties: Record<ThermalZone, number> = {
            optimal: 0,
            warm: -0.05,
            hot: -0.30,
            critical: -1.00,  // effectively removes node from selection
        };
        return Math.max(0, nodeScore + penalties[zone]);
    }
}
