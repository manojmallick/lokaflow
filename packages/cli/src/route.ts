import { Command } from "commander";
import chalk from "chalk";

export const routeCommand = new Command("route")
    .description("Standalone Proxy wrapper layer around the router")
    .option("start", "Start the proxy server")
    .option("savings", "View the routing savings dashboard")
    .action(async (cmd) => {
        try {
            if (cmd === "savings") {
                console.log(chalk.green("[LokaRoute] Loading savings..."));
            } else {
                console.log(chalk.blue("[LokaRoute] Starting standalone proxy layer..."));
            }
            const { RouteProxy } = await import("@lokaflow/route");
        } catch (e) {
            console.error(chalk.red("Failed to load LokaRoute"), e);
        }
    });
