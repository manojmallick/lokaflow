// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaMesh Battery Intelligence™ — lokaflow.io
/* eslint-disable no-console */

import chalk from "chalk";
import { BatteryState } from "../agents/base.js";
import { ClusterBatteryStore } from "../store/cluster-battery-store.js";
import { HealthTracker } from "../tracker/health-tracker.js";

export class BatteryReport {
  constructor(
    private readonly store: ClusterBatteryStore,
    private readonly tracker: HealthTracker,
  ) {}

  async printReport(currentState: BatteryState[]): Promise<void> {
    console.log(chalk.bold(`\n════════════════════════════════════════════════════════`));
    console.log(chalk.bold(`LokaMesh Battery Intelligence™ — Cluster Status`));
    console.log(chalk.gray(`LearnHubPlay BV · lokaflow.io`));
    console.log(chalk.gray(`As of ${new Date().toLocaleString()}`));
    console.log(chalk.bold(`════════════════════════════════════════════════════════\n`));

    console.log(chalk.bold(`Node              SoC    Temp  Health  Cycles  Stress  Status`));
    console.log(
      chalk.gray(`────────────────  ─────  ────  ──────  ──────  ──────  ─────────────────────`),
    );

    let alertCount = 0;
    const alerts: string[] = [];
    let totalStress = 0;
    let nodeCount = 0;

    for (const state of currentState) {
      if (!state) continue; // Skip nodes that don't return battery states (e.g desktops)

      const chargeStr = `${state.percentCharge.toFixed(0)}%`.padEnd(5);
      const tempStr = `${Math.round(state.temperatureCelsius)}°C`.padEnd(4);
      const healthStr = `${state.healthPct.toFixed(1)}%`.padEnd(6);
      const cycleStr = state.cycleCount.toString().padEnd(6);

      let stressLevel = "🟢";
      if (state.stressScore > 40) stressLevel = "🟡";
      if (state.stressScore > 60) stressLevel = "🟠";
      if (state.stressScore > 80) stressLevel = "🚨";

      const stressStr = `${stressLevel} ${state.stressScore}`.padEnd(7);

      let statusMsg = "Optimal";
      let isProblem = false;

      if (state.percentCharge > 80) {
        statusMsg = "⚠ Above limit (80%)";
        isProblem = true;
        alerts.push(
          `[HIGH] ${state.nodeId}: Battery at ${state.percentCharge.toFixed(0)}%, above limit.`,
        );
        alertCount++;
      } else if (state.temperatureCelsius > 35) {
        statusMsg = `⚠ Warm (${state.temperatureCelsius.toFixed(1)}°C)`;
        isProblem = true;
      }

      const nodeIdStr = state.nodeId.padEnd(16);
      console.log(
        `${nodeIdStr}  ${chargeStr}  ${tempStr}  ${healthStr}  ${cycleStr}  ${stressStr}  ${isProblem ? chalk.yellow(statusMsg) : chalk.green(statusMsg)}`,
      );

      totalStress += state.stressScore;
      nodeCount++;
    }

    const avgStress = nodeCount > 0 ? Math.round(totalStress / nodeCount) : 0;
    console.log(
      `\nCluster Stress Score: ${avgStress} / 100  ${avgStress > 40 ? chalk.yellow("Elevated") : chalk.green("Optimal")}`,
    );

    if (alertCount > 0) {
      console.log(chalk.bold(`\n────────────────────────────────────────────────────────`));
      console.log(chalk.red.bold(`ALERTS (${alertCount})`));
      alerts.forEach((a) => console.log(chalk.yellow(`  ${a}`)));
    }

    console.log(chalk.bold(`\n════════════════════════════════════════════════════════\n`));
  }
}
