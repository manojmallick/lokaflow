#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";

import { serveCommand } from "./serve.js";
import { chatCommand } from "./chat.js";
import { orchestrateCommand } from "./orchestrate.js";
import { auditCommand } from "./audit.js";
import { nodesCommand } from "./nodes.js";
import { batteryCommand } from "./battery.js";
import { costCommand } from "./cost.js";
import { routeCommand } from "./route.js";
import { swapCommand } from "./swap.js";
import { commonsCommand } from "./commons.js";
import { supportersCommand } from "./supporters.js";

const program = new Command();

program
    .name("lokaflow")
    .description("AI for everyone. Waste for no one. LokaFlow CLI Orchestrator")
    .version("1.0.0");

program.addCommand(serveCommand);
program.addCommand(chatCommand);
program.addCommand(orchestrateCommand);
program.addCommand(auditCommand);
program.addCommand(nodesCommand);
program.addCommand(batteryCommand);
program.addCommand(costCommand);
program.addCommand(routeCommand);
program.addCommand(swapCommand);
program.addCommand(commonsCommand);
program.addCommand(supportersCommand);

program.parseAsync(process.argv).catch((err) => {
    console.error(chalk.red(`\nFatal error: ${err.message}`));
    process.exit(1);
});
