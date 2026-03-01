// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaMesh Battery Intelligence™ — lokaflow.io

import { BatteryState } from "../agents/base.js";
import { getThermalZone, ThermalGuard } from "../guardian/thermal-guard.js";

export interface MeshNodeMock {
    id: string;
    score: number;
    batteryState?: BatteryState;
}

export interface MeshTaskMock {
    id: string;
    priority: 'interactive' | 'batch' | 'background';
}

const thermalGuard = new ThermalGuard();

// Called by MeshScheduler.selectNode() before scoring
export function applyBatteryConstraints(nodes: MeshNodeMock[], task: MeshTaskMock): MeshNodeMock[] {
    return nodes
        .filter(node => {
            const battery = node.batteryState;
            if (!battery) return true;  // desktops without battery — always eligible

            // Hard exclusions
            if (battery.percentCharge < 20 && !battery.isPluggedIn) return false;  // never drain below 20%
            if (!thermalGuard.shouldAcceptWorkload(battery, { priority: task.priority })) return false; // Thermal guard drops

            return true;
        })
        .map(node => ({
            ...node,
            score: node.batteryState ? thermalGuard.applyThermalPenalty(node.score, node.batteryState) : node.score,
        }));
}

// Non-obvious strategy: wear levelling across fleet
// Deliberately routes BATCH tasks (non-urgent) to devices with HIGHER cycle counts
// Goal: all devices reach replacement at the same time (easier fleet management)
export function selectForWearLevelling(nodes: MeshNodeMock[], task: MeshTaskMock): MeshNodeMock | null {
    if (task.priority !== 'batch') return null;  // wear levelling only for non-urgent tasks

    // Find the most-used device (highest cycle count) that is still healthy
    const eligibleForBatch = nodes
        .filter(n => n.batteryState && n.batteryState.healthPct > 85)  // don't punish already-degraded batteries
        .sort((a, b) => (b.batteryState?.cycleCount ?? 0) - (a.batteryState?.cycleCount ?? 0));

    return eligibleForBatch[0] ?? null;
}
