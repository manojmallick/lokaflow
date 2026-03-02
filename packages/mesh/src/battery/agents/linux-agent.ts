// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaMesh Battery Intelligence™ — lokaflow.io

import { readFile, access, readdir } from "fs/promises";
import { join } from "path";
import { BatteryAgent, BatteryState, calculateStressScore } from "./base.js";

const SYS_BASE = "/sys/class/power_supply";

async function readSysFile(path: string): Promise<string | null> {
  try {
    return (await readFile(path, "utf8")).trim();
  } catch {
    return null;
  }
}

/** Find the first battery device under /sys/class/power_supply */
async function findBatteryPath(): Promise<string> {
  try {
    const entries = await readdir(SYS_BASE);
    // Prefer BAT0, then BAT1, then any entry whose type is "Battery"
    const batteries = entries.filter((e) => /^BAT/i.test(e));
    if (batteries.length > 0) {
      // Sort for determinism: BAT0 < BAT1
      batteries.sort();
      return join(SYS_BASE, batteries[0]!);
    }
    // Fallback: find any entry with type "Battery"
    for (const entry of entries) {
      const typeFile = join(SYS_BASE, entry, "type");
      const type = await readSysFile(typeFile);
      if (type?.toLowerCase() === "battery") {
        return join(SYS_BASE, entry);
      }
    }
  } catch {
    // /sys not available
  }
  return join(SYS_BASE, "BAT0");
}

/** True if the path exists and is readable */
async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * LinuxBatteryAgent — reads from `/sys/class/power_supply/BATx/`.
 * Charge control via `echo N > /sys/class/power_supply/BAT0/charge_control_end_threshold`
 * (requires CAP_SYS_ADMIN or udev rule granting write access).
 */
export class LinuxBatteryAgent implements BatteryAgent {
  readonly platform = "linux" as const;
  supportsChargeControl = false;

  private nodeId: string;
  private batPath: string | null = null;

  constructor(nodeId: string) {
    this.nodeId = nodeId;
    // Check charge control availability lazily
    this.detectChargeControl();
  }

  private async detectChargeControl(): Promise<void> {
    const path = await findBatteryPath();
    const has = await exists(join(path, "charge_control_end_threshold"));
    this.supportsChargeControl = has;
  }

  async readState(): Promise<BatteryState> {
    if (!this.batPath) {
      this.batPath = await findBatteryPath();
    }
    const bp = this.batPath;

    const [
      capacityStr,
      statusStr,
      energyNowStr,
      energyFullStr,
      energyFullDesignStr,
      cycleCountStr,
      tempStr,
      currentNowStr,
      voltageNowStr,
    ] = await Promise.all([
      readSysFile(join(bp, "capacity")),
      readSysFile(join(bp, "status")),
      readSysFile(join(bp, "energy_now")),
      readSysFile(join(bp, "energy_full")),
      readSysFile(join(bp, "energy_full_design")),
      readSysFile(join(bp, "cycle_count")),
      readSysFile(join(bp, "temp")),
      readSysFile(join(bp, "current_now")),
      readSysFile(join(bp, "voltage_now")),
    ]);

    const capacity = capacityStr ? parseInt(capacityStr, 10) : 50;
    const status = statusStr ?? "Unknown";
    const isCharging = status === "Charging" || status === "Full";
    const isPluggedIn = status === "Charging" || status === "Full" || status === "Not charging";

    // energy values in µWh; convert to mAh using nominal 3.7V or voltage_now
    const voltageNow = voltageNowStr ? parseInt(voltageNowStr, 10) / 1_000_000 : 3.7; // µV → V
    const eFull = energyFullStr ? parseInt(energyFullStr, 10) : 0;
    const eFullDesign = energyFullDesignStr ? parseInt(energyFullDesignStr, 10) || eFull : eFull;
    const v = voltageNow > 0 ? voltageNow : 3.7;

    const currentCapacityMah = eFull > 0 ? Math.round(eFull / 1000 / v) : 3000;
    const designCapacityMah = eFullDesign > 0 ? Math.round(eFullDesign / 1000 / v) : 3300;
    const healthPct =
      designCapacityMah > 0 ? Math.min(100, (currentCapacityMah / designCapacityMah) * 100) : 95;

    // temp is in tenths of °C (e.g. 298 = 29.8°C)
    const temperatureCelsius = tempStr ? parseInt(tempStr, 10) / 10 : 30;

    // power draw
    let powerDrawWatts: number | undefined;
    if (currentNowStr && voltageNowStr) {
      const uA = parseInt(currentNowStr, 10);
      const uV = parseInt(voltageNowStr, 10);
      if (uA > 0 && uV > 0) {
        powerDrawWatts = Math.abs((uA * uV) / 1e12); // µA × µV → W
      }
    }

    const partial = {
      percentCharge: capacity,
      isCharging,
      isPluggedIn,
      temperatureCelsius,
      ...(powerDrawWatts !== undefined && { powerDrawWatts }),
    };

    return {
      nodeId: this.nodeId,
      timestamp: new Date().toISOString(),
      currentCapacityMah,
      designCapacityMah,
      cycleCount: cycleCountStr ? parseInt(cycleCountStr, 10) : 0,
      healthPct,
      stressScore: calculateStressScore(partial),
      ...partial,
    };
  }

  async setChargeLimit(percent: number): Promise<void> {
    if (percent < 20 || percent > 100) {
      throw new RangeError(`Charge limit ${percent}% is out of range 20–100`);
    }
    if (!this.batPath) this.batPath = await findBatteryPath();
    const thresholdPath = join(this.batPath, "charge_control_end_threshold");
    try {
      const { writeFile } = await import("fs/promises");
      await writeFile(thresholdPath, String(percent), "utf8");
    } catch (e: any) {
      throw new Error(
        `Cannot set charge limit. Either run as root or set a udev rule to allow write to ${thresholdPath}. Details: ${e.message}`,
      );
    }
  }

  async getChargeLimit(): Promise<number | null> {
    if (!this.batPath) this.batPath = await findBatteryPath();
    const val = await readSysFile(join(this.batPath, "charge_control_end_threshold"));
    return val ? parseInt(val, 10) : null;
  }
}
