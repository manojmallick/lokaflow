// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.

/** CLI cost report formatter — renders spend data with chalk. */

import chalk from "chalk";

import { CostTracker } from "./tracker.js";

const GPT4O_CLOUD_COST_PER_QUERY_EUR = 0.015; // estimated cloud-only cost per query

export function printCostReport(period: "today" | "month" | "all" = "today"): void {
  const tracker = new CostTracker();

  try {
    const days = period === "today" ? 1 : period === "month" ? 30 : 3650;
    const daily = tracker.getDailyReport(days);
    const totals = tracker.getTotals();

    console.log();
    console.log(chalk.bold.cyan("  LokaFlow™ Cost Report"));
    console.log(chalk.dim("  ─────────────────────────────────────────"));

    if (daily.length === 0) {
      console.log(chalk.dim("  No queries recorded yet.\n"));
      return;
    }

    // Table header
    console.log(
      chalk.dim(
        `  ${"Date".padEnd(12)} ${"Queries".padEnd(9)} ${"Cost (€)".padEnd(10)} ${"Models"}`,
      ),
    );
    console.log(chalk.dim("  " + "─".repeat(60)));

    for (const row of daily) {
      const costStr = `€${row.costEur.toFixed(4)}`.padEnd(10);
      const models = row.models.join(", ");
      console.log(
        `  ${chalk.white(row.date.padEnd(12))} ${String(row.queries).padEnd(9)} ${chalk.green(costStr)} ${chalk.dim(models)}`,
      );
    }

    console.log(chalk.dim("  " + "─".repeat(60)));

    // Totals
    const savings = totals.localQueries * GPT4O_CLOUD_COST_PER_QUERY_EUR - totals.totalEur;
    const localPct =
      totals.totalQueries > 0 ? Math.round((totals.localQueries / totals.totalQueries) * 100) : 0;

    console.log(`\n  ${chalk.bold("Total queries:")}  ${chalk.white(String(totals.totalQueries))}`);
    console.log(
      `  ${chalk.bold("Total cost:")}     ${chalk.green(`€${totals.totalEur.toFixed(4)}`)}`,
    );
    console.log(`  ${chalk.bold("Local routing:")}  ${chalk.cyan(`${localPct}%`)} of all queries`);
    if (savings > 0) {
      console.log(
        `  ${chalk.bold("Estimated savings:")} ${chalk.yellow(`€${savings.toFixed(2)}`)} vs cloud-only`,
      );
    }
    console.log();
  } finally {
    tracker.close();
  }
}
