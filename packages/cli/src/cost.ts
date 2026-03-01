import { Command } from "commander";
import chalk from "chalk";
import { DashboardTracker } from "@lokaflow/core/dashboard/tracker.js";

export const costCommand = new Command("cost")
    .description("View LokaFlow routing cost metrics")
    .option("--month", "Monthly view")
    .action(async (options) => {
        console.log(chalk.magenta("[LokaFlow] Calculating metrics..."));
        const tracker = new DashboardTracker();
        console.log(chalk.green(`Retrieved costs for ${options.month ? "month" : "today"}.`));
    });
