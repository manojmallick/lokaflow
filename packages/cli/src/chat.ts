import { Command } from "commander";
import chalk from "chalk";
import { Router } from "@lokaflow/core/router/router.js";

export const chatCommand = new Command("chat")
    .description("Interactive local chat via LokaFlow ecosystem")
    .action(async () => {
        console.log(chalk.green("Welcome to LokaFlow Chat. Type 'exit' to quit."));
        const router = new Router();
        // Simplified stub.
        console.log(chalk.cyan("Router initialized."));
    });
