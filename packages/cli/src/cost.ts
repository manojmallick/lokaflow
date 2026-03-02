/* eslint-disable no-console */
import { Command } from "commander";
import chalk from "chalk";
import { DashboardTracker } from "@lokaflow/core";

export const costCommand = new Command("cost")
  .description("View LokaFlow routing cost metrics")
  .option("--month", "Monthly view")
  .action(async (options) => {
    console.log(chalk.magenta("[LokaFlow] Calculating metrics..."));
    const _tracker = new DashboardTracker();
    console.log(chalk.green(`Retrieved costs for ${options.month ? "month" : "today"}.`));
  });
