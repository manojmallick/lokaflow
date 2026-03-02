/* eslint-disable no-console */
import { Command } from "commander";
import chalk from "chalk";
import { readFileSync } from "fs";
import { resolve } from "path";

function detectProvider(rawJson: string): "chatgpt" | "claude" | null {
  try {
    const parsed = JSON.parse(rawJson);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const first = parsed[0];
    if (first && typeof first === "object") {
      if ("mapping" in first) return "chatgpt";
      if ("chat_messages" in first) return "claude";
    }
    return null;
  } catch {
    return null;
  }
}

export const auditCommand = new Command("audit")
  .description("Analyze GDPR export JSON files (ChatGPT conversations.json or Claude export)")
  .argument("<file>", "Path to GDPR export JSON")
  .option("--sub <eur>", "Your current monthly subscription cost in EUR (default: 22.99)", "22.99")
  .action(async (file: string, options) => {
    const filePath = resolve(file);
    console.log(chalk.blue(`[LokaAudit] Analyzing ${filePath}`));
    try {
      let rawJson: string;
      try {
        rawJson = readFileSync(filePath, "utf-8");
      } catch {
        console.error(chalk.red(`[LokaAudit] Cannot read file: ${filePath}`));
        return;
      }

      const provider = detectProvider(rawJson);
      if (!provider) {
        console.error(chalk.red("[LokaAudit] Unrecognized export format."));
        console.error(
          chalk.gray(
            "  Supported: ChatGPT (conversations.json with 'mapping') or Claude (with 'chat_messages').",
          ),
        );
        return;
      }

      console.log(chalk.gray(`  Detected format: ${provider}`));

      const { AuditEngine, ChatgptParser, ClaudeParser } = await import("@lokaflow/audit");
      const parser = provider === "chatgpt" ? new ChatgptParser() : new ClaudeParser();
      const data = parser.parse(rawJson);

      console.log(chalk.gray(`  Parsed ${data.conversations.length} conversations...`));

      const engine = new AuditEngine();
      const subscriptionEur = parseFloat(options.sub);
      const report = await engine.analyze(
        data,
        Number.isFinite(subscriptionEur) ? subscriptionEur : 22.99,
      );

      // Print report
      console.log(chalk.bold(`\n════════════════════════════════════════════════════════`));
      console.log(chalk.bold(`  LokaAudit™ — Subscription Analysis`));
      console.log(
        chalk.gray(`  Provider: ${report.provider}  ·  Period: ${report.periodDays} days`),
      );
      console.log(chalk.bold(`════════════════════════════════════════════════════════\n`));

      console.log(`  Conversations analyzed : ${chalk.white(report.totalConversations)}`);
      console.log(`  Total user messages    : ${chalk.white(report.totalUserMessages)}`);
      console.log(
        `  Tokens estimated       : ${chalk.white(report.totalTokensEstimated.toLocaleString())}`,
      );
      console.log(
        `  Simple (→ local free)  : ${chalk.green(report.simpleQueriesCount)} (${Math.round((report.simpleQueriesCount / Math.max(1, report.totalUserMessages)) * 100)}%)`,
      );
      console.log(`  Complex (→ cloud API)  : ${chalk.yellow(report.complexQueriesCount)}`);
      console.log();
      console.log(
        `  Your subscription      : ${chalk.white("€" + report.currentMonthlySubscriptionEur + "/mo")}`,
      );
      console.log(
        `  LokaFlow equivalent    : ${chalk.white("€" + report.lokaflowEquivalentCostEur + "/mo")}`,
      );

      if (report.canCancel) {
        console.log(
          `  Monthly savings        : ${chalk.green("€" + report.monthlySavingsEur + "/mo")} ✓`,
        );
        console.log();
        console.log(
          chalk.green("  ✅ You can cancel your subscription and save money with LokaFlow."),
        );
      } else {
        console.log(
          `  Monthly difference     : ${chalk.red("+" + Math.abs(report.monthlySavingsEur) + "/mo")}`,
        );
        console.log();
        console.log(
          chalk.yellow("  ℹ️  Keep your current subscription — you're a heavy complex-query user."),
        );
      }

      console.log();
      console.log(chalk.gray("  " + report.reasoning));
      console.log(chalk.bold(`\n════════════════════════════════════════════════════════\n`));
    } catch (e) {
      console.error(chalk.red("Failed to run audit"), e);
    }
  });
