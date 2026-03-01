import { Command } from "commander";
import chalk from "chalk";

export const auditCommand = new Command("audit")
    .description("Analyze GDPR export JSON files")
    .argument("<file>", "Path to GDPR export JSON")
    .option("--html", "Generate HTML report")
    .action(async (file, options) => {
        console.log(chalk.blue(`[LokaAudit] Analyzing ${file}`));
        // Dynamically loaded to prevent cold start delays
        try {
            const { parseCommand } = await import("@lokaflow/audit");
            await parseCommand(file, options);
        } catch (e) {
            console.error(chalk.red("Failed to run audit"), e);
        }
    });
