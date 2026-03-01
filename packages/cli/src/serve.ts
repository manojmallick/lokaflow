import { Command } from "commander";
import chalk from "chalk";

export const serveCommand = new Command("serve")
    .description("Start the OpenAI-compatible REST API wrapper")
    .option("-p, --port <number>", "Port to bind to", "4141")
    .action(async (options) => {
        try {
            console.log(chalk.green(`[LokaFlow API] Booting on port ${options.port}...`));
            const { startServer } = await import("@lokaflow/api/src/server.js");
            await startServer(parseInt(options.port));
        } catch (e) {
            console.error(chalk.red("Failed to start the REST API"), e);
        }
    });
