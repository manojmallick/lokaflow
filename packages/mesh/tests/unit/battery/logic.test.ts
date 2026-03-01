// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaMesh Battery Intelligence™ — lokaflow.io

import { describe, it, expect } from "vitest";
import { calculateStressScore, BatteryState } from "../../src/battery/agents/base.js";
import { getThermalZone } from "../../src/battery/guardian/thermal-guard.js";

describe("calculateStressScore", () => {
    it("returns 0 for optimal state", () => {
        const state: Omit<BatteryState, "stressScore" | "nodeId" | "timestamp" | "currentCapacityMah" | "designCapacityMah" | "healthPct" | "cycleCount"> = {
            percentCharge: 60,
            isCharging: false,
            temperatureCelsius: 22,
            isPluggedIn: true
        };
        expect(calculateStressScore(state)).toBe(0);
    });

    it("returns high score for hot device charging at high SoC", () => {
        const state = { percentCharge: 95, isCharging: true, temperatureCelsius: 42, isPluggedIn: true };
        const score = calculateStressScore(state);
        expect(score).toBeGreaterThan(70);
    });

    it("caps at 100", () => {
        const worstCase = { percentCharge: 100, isCharging: true, temperatureCelsius: 50, isPluggedIn: true };
        expect(calculateStressScore(worstCase)).toBe(100);
    });
});

describe("getThermalZone", () => {
    it("identifies correct thermal zones", () => {
        expect(getThermalZone(20)).toBe("optimal");
        expect(getThermalZone(30)).toBe("warm");
        expect(getThermalZone(40)).toBe("hot");
        expect(getThermalZone(50)).toBe("critical");
    });
});
