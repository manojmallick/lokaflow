/* eslint-disable no-console */
import { Command } from "commander";
import chalk from "chalk";

export const swapCommand = new Command("swap")
  .description("LokaSwap — token exchange and group purchasing")
  .action(async () => {
    try {
      console.log(chalk.blue("[LokaSwap] Initializing token exchange..."));
      const { TradeSettlement } = await import("@lokaflow/swap");
      console.log(chalk.blue("[LokaSwap] Available:"), typeof TradeSettlement);
    } catch (e) {
      console.error(chalk.red("Failed to load LokaSwap module"), e);
    }
  });
