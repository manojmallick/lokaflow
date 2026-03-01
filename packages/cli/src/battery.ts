import { Command } from "commander";
import chalk from "chalk";
import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { resolveMeshConfigPath } from "./utils/meshConfig.js";

/** Read local macOS battery state via ioreg */
function readMacosBattery(nodeId: string) {
    try {
        const raw = execSync("ioreg -rn AppleSmartBattery -d1 -w0", { encoding: "utf-8" });
        const num = (key: string) => {
            const m = raw.match(new RegExp(`"${key}"\\s*=\\s*(\\d+)`));
            return m ? parseInt(m[1]!, 10) : 0;
        };
        const bool = (key: string) => {
            const m = raw.match(new RegExp(`"${key}"\\s*=\\s*(Yes|No|True|False)`, "i"));
            return m ? m[1]!.toLowerCase() === "yes" || m[1]!.toLowerCase() === "true" : false;
        };

        const currentCapMah = num("CurrentCapacity");
        const maxCapMah = num("MaxCapacity");
        const designCapMah = num("DesignCapacity") || maxCapMah;
        const cycleCount = num("CycleCount");
        const tempRaw = num("Temperature"); // units: 0.01 °C
        const isCharging = bool("IsCharging");
        const isPluggedIn = bool("ExternalConnected");
        const percentCharge = maxCapMah > 0 ? Math.round((currentCapMah / maxCapMah) * 100) : 0;
        const healthPct = designCapMah > 0 ? Math.round((maxCapMah / designCapMah) * 100) : 100;
        const temperatureCelsius = tempRaw > 0 ? tempRaw / 100 : 30;

        return {
            nodeId, timestamp: new Date().toISOString(),
            percentCharge, isCharging, isPluggedIn, temperatureCelsius,
            currentCapacityMah: currentCapMah, designCapacityMah: designCapMah,
            cycleCount, healthPct, stressScore: 0,
        };
    } catch { return null; }
}

/** Read local Linux battery state via /sys/class/power_supply/BAT0 */
function readLinuxBattery(nodeId: string) {
    try {
        const base = "/sys/class/power_supply/BAT0";
        if (!existsSync(base)) return null;
        const rd = (f: string) => {
            try { return readFileSync(`${base}/${f}`, "utf-8").trim(); } catch { return null; }
        };
        const currentCapMah = parseInt(rd("charge_now") ?? "0") / 1000;
        const maxCapMah = parseInt(rd("charge_full") ?? "0") / 1000;
        const designCapMah = parseInt(rd("charge_full_design") ?? "0") / 1000 || maxCapMah;
        const cycleCount = parseInt(rd("cycle_count") ?? "0");
        const status = rd("status") ?? "";
        const isCharging = status === "Charging";
        const isPluggedIn = status !== "Discharging";
        const percentCharge = maxCapMah > 0 ? Math.round((currentCapMah / maxCapMah) * 100) : 0;
        const healthPct = designCapMah > 0 ? Math.round((maxCapMah / designCapMah) * 100) : 100;
        return {
            nodeId, timestamp: new Date().toISOString(),
            percentCharge, isCharging, isPluggedIn, temperatureCelsius: 30,
            currentCapacityMah: currentCapMah, designCapacityMah: designCapMah,
            cycleCount, healthPct, stressScore: 0,
        };
    } catch { return null; }
}

export const batteryCommand = new Command("battery")
    .description("Monitor and manage cluster battery health")
    .action(async () => {
        console.log(chalk.green("[LokaMesh] Reading battery health state across the cluster..."));
        try {
            const configPath = resolveMeshConfigPath();
            if (!configPath) return;

            const {
                LokaMesh, ClusterBatteryStore, HealthTracker, BatteryReport, calculateStressScore,
            } = await import("@lokaflow/mesh");

            const mesh = new LokaMesh({ configPath });
            await mesh.start();
            const status = mesh.nodes();

            const store = new ClusterBatteryStore();
            const tracker = new HealthTracker(store);
            const reporter = new BatteryReport(store, tracker);
            const platform = process.platform;
            const states = [];

            for (const node of status.nodes) {
                let raw = platform === "darwin" ? readMacosBattery(node.id)
                    : platform === "linux" ? readLinuxBattery(node.id)
                    : null;
                if (raw) {
                    const stress = calculateStressScore({
                        percentCharge: raw.percentCharge,
                        isCharging: raw.isCharging,
                        isPluggedIn: raw.isPluggedIn,
                        temperatureCelsius: raw.temperatureCelsius,
                    });
                    const state = { ...raw, stressScore: stress };
                    await tracker.recordDailySnapshot(state);
                    states.push(state);
                }
            }

            if (states.length === 0) {
                console.log(chalk.yellow("[LokaMesh] No battery data available for online nodes."));
                console.log(chalk.gray("  (Desktop / offline nodes are skipped; Windows not supported yet)"));
            } else {
                await reporter.printReport(states);
            }

            await mesh.stop();
        } catch (e) {
            console.error(chalk.red("Failed to load LokaMesh Battery Engine"), e);
        }
    });
