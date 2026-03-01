// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaMesh Battery Intelligence™ — lokaflow.io

export interface BatteryAgent {
    readonly platform: 'macos' | 'linux' | 'android' | 'ios' | 'windows';
    readonly supportsChargeControl: boolean;

    readState(): Promise<BatteryState>;
    setChargeLimit(percent: number): Promise<void>;
    getChargeLimit(): Promise<number | null>;
}

export interface BatteryState {
    nodeId: string;
    timestamp: string;          // ISO 8601
    percentCharge: number;      // 0–100
    isCharging: boolean;
    isPluggedIn: boolean;
    temperatureCelsius: number; // battery temperature, not CPU
    currentCapacityMah: number; // current measured capacity
    designCapacityMah: number;  // original factory capacity
    cycleCount: number;
    healthPct: number;          // currentCapacity / designCapacity * 100
    stressScore: number;        // calculated via calculateStressScore()
    powerDrawWatts?: number;    // if available
}

export function calculateStressScore(state: Omit<BatteryState, "stressScore" | "nodeId" | "timestamp" | "currentCapacityMah" | "designCapacityMah" | "healthPct" | "cycleCount">): number {
    let score = 0;

    // Factor 1: High state-of-charge (max 25 points)
    if (state.percentCharge > 80) {
        score += Math.min(25, (state.percentCharge - 80) * 1.25);
    }

    // Factor 2: Charging at high SoC (additional 20 points)
    if (state.isCharging && state.percentCharge > 80) {
        score += 20;
    }

    // Factor 3: Temperature above optimal (max 40 points)
    // Every degree above 25°C adds 3 points
    if (state.temperatureCelsius > 25) {
        score += Math.min(40, (state.temperatureCelsius - 25) * 3);
    }

    // Factor 4: Charging while hot (additional 15 points)
    if (state.isCharging && state.temperatureCelsius > 35) {
        score += 15;
    }

    // Factor 5: Overnight plugged-in at high SoC (10 points)
    const hour = new Date().getHours();
    const isNight = hour >= 22 || hour < 7;
    if (isNight && state.isCharging && state.percentCharge > 80) {
        score += 10;
    }

    return Math.min(100, Math.round(score));
}
