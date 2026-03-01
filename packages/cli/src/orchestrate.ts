import { Command } from "commander";
import chalk from "chalk";

export const orchestrateCommand = new Command("orchestrate")
    .description("Decompose and execute complex tasks via LokaOrchestrator")
    .argument("<query>", "The complex task to orchestrate")
    .option("--dry-run", "Output the DAG plan without executing")
    .option("--explain", "Show detailed subtask breakdown")
    .option("--sub <eur>", "Monthly subscription cost in EUR for savings comparison", "22.99")
    .action(async (query: string, options) => {
        console.log(chalk.blue(`[LokaOrchestrator] Decomposing: "${query}"`));
        try {
            const [{ OrchestratorPipeline }, { loadConfig, OllamaProvider, ClaudeProvider, OpenAIProvider }] = await Promise.all([
                import("@lokaflow/orchestrator"),
                import("@lokaflow/core"),
            ]);

            const config = loadConfig();
            const local = config.local;
            const cloud = config.cloud;
            const baseUrl = local.baseUrls[0] ?? "http://localhost:11434";
            const specialistModel = config.specialist?.model ?? "llama3.3:70b";
            const timeoutMs = local.timeoutSeconds * 1000;

            // Primary local worker (default model)
            const localWorker = new OllamaProvider(baseUrl, local.defaultModel, timeoutMs);
            // Specialist/planner model (larger, used for decomposition)
            const specialistWorker = new OllamaProvider(baseUrl, specialistModel, timeoutMs);

            // Best available cloud provider (for complex subtasks)
            let cloudWorkerAny: typeof localWorker = specialistWorker; // fallback to specialist
            try {
                if (cloud.primary === "claude") cloudWorkerAny = new ClaudeProvider() as any;
                else cloudWorkerAny = new OpenAIProvider() as any;
            } catch {
                // No cloud keys configured — all subtasks run locally
            }

            const pipeline = new OrchestratorPipeline({
                specialistProvider: specialistWorker as any,
                localProviders: [localWorker as any],
                cloudProvider: cloudWorkerAny as any,
                maxDepth: 3,
                totalTokenBudget: 8000,
            });

            if (options.dryRun) {
                console.log(chalk.yellow("[LokaOrchestrator] Dry run — plan only, not executing."));
                // Re-use the decomposer directly to show the plan
                const { TaskDecomposer } = await import("@lokaflow/orchestrator");
                const decomposer = new TaskDecomposer(specialistWorker as any);
                const graph = await decomposer.decompose(query, 3);
                console.log(chalk.bold("\nTask graph:"));
                for (const node of graph.nodes) {
                    const deps = node.dependsOn.length ? chalk.gray(` (after: ${node.dependsOn.join(", ")})`) : "";
                    console.log(`  ${chalk.cyan(node.id)}  ${node.description}${deps}`);
                }
                return;
            }

            const result = await pipeline.run(query);

            if (options.explain) {
                console.log(chalk.bold("\nSubtask breakdown:"));
                for (const [id, sub] of Object.entries(result.subtaskResults)) {
                    if (id === "_assemble") continue;
                    console.log(`  ${chalk.cyan(id.padEnd(20))} tier=${sub.tier}  ${sub.latencyMs}ms`);
                }
                const t = result.tokenStats;
                console.log(chalk.gray(`\nTokens — local: ${t.localPrompt + t.localCompletion}  cloud: ${t.cloudPrompt + t.cloudCompletion}  saved: €${t.savedVsNaiveCloudEur.toFixed(4)}`));
            }

            console.log("\n" + result.finalOutput);
            console.log(chalk.gray(`\n⏱ ${result.totalLatencyMs}ms  💶 saved ~€${result.tokenStats.savedVsNaiveCloudEur.toFixed(4)} vs full-cloud`));

        } catch (e) {
            console.error(chalk.red("Orchestration failed"), e);
        }
    });
