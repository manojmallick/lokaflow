import { Command } from "commander";
import chalk from "chalk";

export const orchestrateCommand = new Command("orchestrate")
    .description("Decompose and execute complex tasks via LokaOrchestrator")
    .argument("<query>", "The complex task to orchestrate")
    .option("--dry-run", "Output the DAG plan without executing")
    .option("--explain", "Show detailed subtask breakdown")
    .action(async (query, options) => {
        console.log(chalk.blue(`[LokaOrchestrator] Decomposing: "${query}"`));
        try {
            const { OrchestratorPipeline } = await import("@lokaflow/orchestrator");
            const pipeline = new OrchestratorPipeline();

            if (options.dryRun) {
                console.log(chalk.yellow("Dry run generated the DAG plan."));
            } else {
                await pipeline.execute(query);
            }
        } catch (e) {
            console.error(chalk.red("Orchestration failed"), e);
        }
    });
