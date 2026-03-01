import { Command } from "commander";
import chalk from "chalk";

export const commonsCommand = new Command("commons")
    .description("Join and manage the LokaCommons P2P cooperative")
    .action(async () => {
        console.log(chalk.blue("[LokaCommons] Initializing cooperative tracker..."));
        try {
            const { CommonsRegistry } = await import("@lokaflow/commons");
            const registry = new CommonsRegistry();
            console.log(chalk.green("Connected to LokaCommons network."));
        } catch (e) {
            console.error(chalk.red("Failed to load LokaCommons"), e);
        }
    });
