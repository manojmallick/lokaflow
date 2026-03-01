import { Command } from "commander";
import chalk from "chalk";

export const supportersCommand = new Command("supporters")
    .description("List and manage active sponsor tracking")
    .action(() => {
        console.log(chalk.yellow("[LokaFlow] Supporters Module Loaded"));
    });
