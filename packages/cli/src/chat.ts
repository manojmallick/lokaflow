/* eslint-disable no-console */
import { Command } from "commander";
import chalk from "chalk";
import { loadConfig } from "@lokaflow/core";

export const chatCommand = new Command("chat")
  .description("Interactive local chat via LokaFlow ecosystem")
  .action(async () => {
    console.log(chalk.green("Welcome to LokaFlow Chat. Type 'exit' to quit."));
    const config = loadConfig();
    // Simplified stub — full interactive chat is implemented in the next milestone.
    console.log(chalk.cyan(`Router configured for ${config.cloud.claudeModel}`));
  });
