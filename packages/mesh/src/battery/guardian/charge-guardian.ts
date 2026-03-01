// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaMesh Battery Intelligence™ — lokaflow.io

import { BatteryState } from "../agents/base.js";

export interface ScheduleOverride {
    name: string;
    days: string[];
    window: string;
    chargeUpperLimit: number;
    reason: string;
}

export interface BatteryPolicy {
    chargeUpperLimit?: number;
    chargeLowerAlert?: number;
    scheduleOverrides?: ScheduleOverride[];
}

export type ChargeActionType = 'limit-set' | 'alert' | 'window-override' | 'none';

export interface ChargeAction {
    action: ChargeActionType;
    message?: string;
}

function parseWindow(windowStr: string): { startH: number; startM: number; endH: number; endM: number } {
    // e.g. "06:30-08:00"
    const [start, end] = windowStr.split("-");
    const [startH, startM] = (start || "00:00").split(":").map(Number);
    const [endH, endM] = (end || "23:59").split(":").map(Number);
    return { startH: startH || 0, startM: startM || 0, endH: endH || 0, endM: endM || 0 };
}

function isInWindow(override: ScheduleOverride): boolean {
    const d = new Date();
    const dayNames = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    const currentDay = dayNames[d.getDay()];

    if (!override.days.includes(currentDay)) return false;

    const { startH, startM, endH, endM } = parseWindow(override.window);
    const startTotalMins = startH * 60 + startM;
    const endTotalMins = endH * 60 + endM;
    const currentTotalMins = d.getHours() * 60 + d.getMinutes();

    if (endTotalMins >= startTotalMins) {
        return currentTotalMins >= startTotalMins && currentTotalMins <= endTotalMins;
    } else {
        // Overnight window e.g. 23:00-05:00
        return currentTotalMins >= startTotalMins || currentTotalMins <= endTotalMins;
    }
}

export class ChargeGuardian {
    private readonly UPPER_DEFAULT = 80;

    async enforce(state: BatteryState & { agent: any }, policy: BatteryPolicy): Promise<ChargeAction> {
        const limit = policy.chargeUpperLimit ?? this.UPPER_DEFAULT;

        // Provide the schedule window check first, as it overrides the base limit
        const windowOverride = policy.scheduleOverrides?.find(o => isInWindow(o));
        if (windowOverride) {
            const windowLimit = windowOverride.chargeUpperLimit;
            if (state.agent.supportsChargeControl) {
                await state.agent.setChargeLimit(windowLimit);
                return { action: 'window-override', message: `Schedule window active: ${windowOverride.name}, charging to ${windowLimit}%` };
            } else {
                return { action: 'alert', message: `Schedule window active: ${windowOverride.name}. Unplug above ${windowLimit}%.` };
            }
        }

        // Default protection case: Currently charging above limit — stop or alert
        if (state.isCharging && state.percentCharge >= limit) {
            if (state.agent.supportsChargeControl) {
                await state.agent.setChargeLimit(limit);
                return { action: 'limit-set', message: `Charge limit set to ${limit}%` };
            } else {
                return { action: 'alert', message: `Battery at ${state.percentCharge.toFixed(0)}%, above ${limit}% limit — unplug to protect battery` };
            }
        }

        return { action: 'none' };
    }
}
