// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaMesh Battery Intelligence™ — lokaflow.io

import { ClusterBatteryStore } from "../store/cluster-battery-store.js";
import { BatteryState } from "../agents/base.js";

export interface DegradationRate {
    rate: number | null; // % capacity lost per 100 cycles
    confidence: 'high' | 'medium' | 'low' | 'insufficient-data';
}

export class HealthTracker {
    constructor(private readonly store: ClusterBatteryStore) { }

    // Called every 24 hours (not every 60s — battery health changes slowly)
    async recordDailySnapshot(state: BatteryState): Promise<void> {
        const today = new Date().toISOString().substring(0, 10);
        this.store.insertHealthRecord({
            nodeId: state.nodeId,
            date: today,
            healthPct: state.healthPct,
            cycleCount: state.cycleCount,
            designCapacityMah: state.designCapacityMah,
            measuredCapacityMah: state.currentCapacityMah,
            avgDailyStressScore: this.store.avgStressToday(state.nodeId),
        });
    }

    // Calculates degradation rate: % capacity lost per 100 cycles
    async getDegradationRate(nodeId: string, days: number = 90): Promise<DegradationRate> {
        const records = this.store.getHealthHistory(nodeId, days);
        if (records.length < 2) return { rate: null, confidence: 'insufficient-data' };

        const first = records[0];
        const last = records[records.length - 1];

        if (!first || !last) return { rate: null, confidence: 'insufficient-data' };

        const cycleDelta = last.cycleCount - first.cycleCount;
        const healthDelta = first.healthPct - last.healthPct;  // positive = degradation

        if (cycleDelta < 10) return { rate: null, confidence: 'insufficient-data' };

        return {
            rate: (healthDelta / cycleDelta) * 100,  // % capacity lost per 100 cycles
            confidence: cycleDelta > 50 ? 'high' : 'medium',
        };
    }
}
