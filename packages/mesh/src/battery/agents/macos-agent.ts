// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaMesh Battery Intelligence™ — lokaflow.io

import { exec as execCb } from "child_process";
import { promisify } from "util";
import { BatteryAgent, BatteryState, calculateStressScore } from "./base.js";

const exec = promisify(execCb);

/** Parse a single value from `pmset -g batt` output */
function parsePmset(output: string): {
  isCharging: boolean;
  isPluggedIn: boolean;
  percent: number;
} {
  const percentMatch = output.match(/(\d+)%/);
  const percent = percentMatch ? parseInt(percentMatch[1]!, 10) : 50;
  const isCharging = /AC Power/.test(output) && /charging/.test(output);
  const isPluggedIn = /AC Power/.test(output);
  return { isCharging, isPluggedIn, percent };
}

/** Parse plist-like ioreg output for AppleSmartBattery */
function parseIoreg(output: string): {
  currentCapacity: number;
  maxCapacity: number;
  designCapacity: number;
  temperature: number; // raw units of 0.01°C
  cycleCount: number;
  isCharging: boolean;
  externalConnected: boolean;
  amperage: number;
  voltage: number;
} {
  const getNum = (key: string, fallback = 0): number => {
    const m = output.match(new RegExp(`"${key}"\\s*=\\s*(-?\\d+)`));
    return m ? parseInt(m[1]!, 10) : fallback;
  };
  const getBool = (key: string): boolean => {
    const m = output.match(new RegExp(`"${key}"\\s*=\\s*(Yes|No|true|false)`, "i"));
    return m ? /yes|true/i.test(m[1]!) : false;
  };

  return {
    currentCapacity: getNum("CurrentCapacity", 4000),
    maxCapacity: getNum("MaxCapacity", 4000) || getNum("AppleRawMaxCapacity", 4000),
    designCapacity: getNum("DesignCapacity", 4500),
    temperature: getNum("Temperature", 2900), // 0.01 °C units
    cycleCount: getNum("CycleCount", 0),
    isCharging: getBool("IsCharging"),
    externalConnected: getBool("ExternalConnected"),
    amperage: getNum("Amperage", 0),
    voltage: getNum("Voltage", 12000),
  };
}

/**
 * MacOSBatteryAgent — reads battery state via `pmset` and `ioreg -rn AppleSmartBattery`.
 * Charge control requires the `battery` CLI (jezenthomas/battery, brew installable).
 */
export class MacOSBatteryAgent implements BatteryAgent {
  readonly platform = "macos" as const;
  /** True only when `battery` CLI is installed (detected lazily). */
  supportsChargeControl = false;

  private nodeId: string;

  constructor(nodeId: string) {
    this.nodeId = nodeId;
    // Lazy check — don't block construction
    exec("which battery")
      .then(() => {
        this.supportsChargeControl = true;
      })
      .catch(() => {
        this.supportsChargeControl = false;
      });
  }

  async readState(): Promise<BatteryState> {
    const [pmsetResult, ioregResult] = await Promise.allSettled([
      exec("pmset -g batt"),
      exec("ioreg -rn AppleSmartBattery -a 2>/dev/null || ioreg -c AppleSmartBattery 2>/dev/null"),
    ]);

    const pmsetOutput = pmsetResult.status === "fulfilled" ? pmsetResult.value.stdout : "";
    const ioregOutput = ioregResult.status === "fulfilled" ? ioregResult.value.stdout : "";

    const pmset = parsePmset(pmsetOutput);
    const io = parseIoreg(ioregOutput);

    const currentCapacityMah = io.maxCapacity > 0 ? io.maxCapacity : 4000;
    const designCapacityMah = io.designCapacity > 0 ? io.designCapacity : 4500;
    const healthPct =
      designCapacityMah > 0 ? Math.min(100, (currentCapacityMah / designCapacityMah) * 100) : 95;

    const temperatureCelsius =
      io.temperature > 100
        ? io.temperature / 100 // IOKit units (0.01°C)
        : io.temperature; // Already in °C

    const powerDrawWatts =
      io.voltage > 0 && io.amperage !== 0
        ? Math.abs((io.voltage * io.amperage) / 1_000_000)
        : undefined;
    const partial = {
      percentCharge:
        io.currentCapacity > 0 && io.maxCapacity > 0
          ? Math.round((io.currentCapacity / io.maxCapacity) * 100)
          : pmset.percent,
      isCharging: io.isCharging || pmset.isCharging,
      isPluggedIn: io.externalConnected || pmset.isPluggedIn,
      temperatureCelsius: temperatureCelsius || 28,
      ...(powerDrawWatts !== undefined && { powerDrawWatts }),
    };

    return {
      nodeId: this.nodeId,
      timestamp: new Date().toISOString(),
      currentCapacityMah,
      designCapacityMah,
      cycleCount: io.cycleCount,
      healthPct,
      stressScore: calculateStressScore(partial),
      ...partial,
    };
  }

  async setChargeLimit(percent: number): Promise<void> {
    if (percent < 20 || percent > 100) {
      throw new RangeError(`Charge limit ${percent}% is out of range 20–100`);
    }
    try {
      await exec(`battery maintain ${percent}`);
    } catch {
      throw new Error(
        `battery CLI not found. Install with: brew tap nickmartinwebdev/battery && brew install battery`,
      );
    }
  }

  async getChargeLimit(): Promise<number | null> {
    try {
      const { stdout } = await exec("battery status");
      const match = stdout.match(/maintain\s+(\d+)%/i);
      return match ? parseInt(match[1]!, 10) : null;
    } catch {
      return null;
    }
  }
}
