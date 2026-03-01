import { Command } from "commander";
import chalk from "chalk";

export const batteryCommand = new Command("battery")
    .description("Monitor and manage cluster battery health")
    .action(async () => {
        console.log(chalk.green("[LokaMesh] Reading battery health state across the cluster..."));
        try {
            const { BatteryAgent } = await import("@lokaflow/mesh");
            const agent = new BatteryAgent();
            agent.printDashboard();
        } catch (e) {
            console.error(chalk.red("Failed to load LokaMesh Battery Engine"), e);
        }
    });
