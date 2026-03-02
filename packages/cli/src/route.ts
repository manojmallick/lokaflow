// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaFlow™ — lokaflow.io
//
// packages/cli/src/route.ts
// Full CLI for LokaRoute proxy — start, savings, classify, breakdown, feedback, setup, dashboard

import { Command } from "commander";
import chalk from "chalk";
import * as readline from "readline";
import { exec } from "child_process";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatUsd(n: number): string {
  return `$${n.toFixed(4)}`;
}

function formatPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin"
      ? `open "${url}"`
      : process.platform === "win32"
        ? `start "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) console.error(chalk.yellow(`Could not open browser automatically. Visit: ${url}`));
  });
}

// ── Sub-commands ───────────────────────────────────────────────────────────

const startCmd = new Command("start")
  .description("Start the LokaRoute proxy server (OpenAI-compatible drop-in)")
  .option("-p, --port <number>", "Port to listen on", "4041")
  .option(
    "-s, --sensitivity <level>",
    "Classifier sensitivity: aggressive | balanced | conservative",
    "balanced",
  )
  .option("--ollama-url <url>", "Ollama base URL", "http://localhost:11434")
  .option("--subscription <plan>", "Active subscription plan (affects savings calculation)")
  .option("--no-dashboard", "Do not start the dashboard server alongside proxy")
  .action(async (opts) => {
    try {
      const { ProxyServer } = await import("@lokaflow/route");
      const port = parseInt(opts.port, 10);

      console.log(chalk.bold.blue("\n  LokaRoute™ Proxy"));
      console.log(chalk.dim("  ─────────────────────────────────────────────"));
      console.log(`  Sensitivity : ${chalk.cyan(opts.sensitivity)}`);
      console.log(`  Ollama      : ${chalk.cyan(opts.ollamaUrl)}`);
      console.log(`  Port        : ${chalk.cyan(port)}`);
      if (opts.subscription) console.log(`  Subscription: ${chalk.cyan(opts.subscription)}`);

      const server = new ProxyServer({
        port,
        sensitivity: opts.sensitivity as "aggressive" | "balanced" | "conservative",
        ollamaUrl: opts.ollamaUrl,
      });

      await server.start();
      console.log(chalk.green(`\n  ✓ Proxy listening on http://localhost:${port}`));
      console.log(chalk.dim("    Configure OpenAI base_url → http://localhost:4041/v1\n"));

      if (opts.dashboard !== false) {
        try {
          const { DashboardServer } = await import("@lokaflow/route");
          const dash = new DashboardServer({ port: port + 1 });
          await dash.start();
          console.log(chalk.green(`  ✓ Dashboard at http://localhost:${port + 1}`));
        } catch {
          /* dashboard optional */
        }
      }

      console.log(chalk.dim("  Ctrl-C to stop\n"));

      // Keep process alive
      await new Promise<never>(() => {});
    } catch (e: any) {
      console.error(chalk.red(`\n  ✗ Failed to start proxy: ${e.message}`));
      process.exit(1);
    }
  });

const savingsCmd = new Command("savings")
  .description("Display routing savings report")
  .option("--period <period>", "Report period: weekly | monthly | all", "monthly")
  .action(async (opts) => {
    try {
      const { SavingsReport } = await import("@lokaflow/route");
      const report = new SavingsReport();

      let data;
      switch (opts.period) {
        case "weekly":
          data = report.weeklyReport();
          break;
        case "all":
          data = report.allTimeSummary();
          break;
        default:
          data = report.monthlyReport();
      }

      console.log(chalk.bold.blue(`\n  LokaRoute™ Savings — ${data.period}`));
      console.log(chalk.dim("  ─────────────────────────────────────────────"));
      console.log(`  Total queries    : ${chalk.cyan(data.totalQueries.toLocaleString())}`);
      console.log(
        `  Local / Cloud    : ${chalk.green(data.localQueries.toLocaleString())} / ${chalk.yellow(data.cloudQueries.toLocaleString())}`,
      );
      const localPct = data.totalQueries > 0 ? data.localQueries / data.totalQueries : 0;
      console.log(`  Local rate       : ${chalk.green(formatPct(localPct))}`);
      console.log(`  Actual spend     : ${chalk.yellow(formatUsd(data.actualCostUsd))}`);
      if (data.totalSavedUsd > 0) {
        console.log(`  Saved            : ${chalk.bold.green(formatUsd(data.totalSavedUsd))}`);
      }
      if (data.totalSavedUsd > 0) {
        const savingsPct = data.totalSavedUsd / (data.actualCostUsd + data.totalSavedUsd);
        console.log(`  Savings rate     : ${chalk.bold.green(formatPct(savingsPct))}`);
      }
      console.log();

      // Daily trend
      const daily = report.dailyTotals(7);
      if (daily.length > 0) {
        console.log(chalk.dim("  Daily trend (last 7 days):"));
        for (const d of daily) {
          const localRatio = d.queries > 0 ? d.localQueries / d.queries : 0;
          const bar = "█".repeat(Math.round(localRatio * 20));
          const empty = "░".repeat(20 - Math.round(localRatio * 20));
          console.log(
            `  ${chalk.dim(d.date)}  ${chalk.green(bar)}${chalk.dim(empty)}  ${d.queries}q  saved ${formatUsd(d.savedUsd)}`,
          );
        }
        console.log();
      }
    } catch (e: any) {
      console.error(chalk.red(`  ✗ ${e.message}`));
      process.exit(1);
    }
  });

const classifyCmd = new Command("classify")
  .description("Classify a query and preview which tier it would route to")
  .argument("<query>", "The query text to classify")
  .option("-s, --sensitivity <level>", "Classifier sensitivity override", "balanced")
  .action(async (query: string, opts) => {
    try {
      const { QueryClassifier, FeatureExtractor } = await import("@lokaflow/route");

      const extractor = new FeatureExtractor();
      const features = extractor.extract(query);
      const score = features.historicalComplexityBaseline ?? 0;

      const classifier = new QueryClassifier({ sensitivity: opts.sensitivity as any });
      const result = classifier.classify(query);

      console.log(chalk.bold.blue("\n  LokaRoute™ Query Classification"));
      console.log(chalk.dim("  ─────────────────────────────────────────────"));
      console.log(
        `  Query     : ${chalk.cyan(`"${query.substring(0, 80)}${query.length > 80 ? "…" : ""}"`)} `,
      );
      console.log(`  Tier      : ${chalk.bold(result.tier)}`);
      console.log(`  Score     : ${chalk.cyan(result.score.toFixed(4))}`);
      console.log(`  Reason    : ${chalk.dim(result.reason)}`);
      if (result.ruleMatch) console.log(`  Rule      : ${chalk.yellow(result.ruleMatch)}`);
      if (result.piiDetected) console.log(`  PII       : ${chalk.red("detected — forced local")}`);
      console.log(chalk.dim("\n  Feature breakdown:"));
      const fw = features as unknown as Record<string, unknown>;
      const keys = [
        "tokenCount",
        "codeDetected",
        "mathDetected",
        "multiPartDetected",
        "technicalTermDensity",
        "questionDepth",
        "regulatoryKeywords",
      ];
      for (const k of keys) {
        if (fw[k] !== undefined) {
          console.log(`    ${chalk.dim(k.padEnd(26))} ${chalk.cyan(String(fw[k]))}`);
        }
      }
      console.log();
    } catch (e: any) {
      console.error(chalk.red(`  ✗ Classification failed: ${e.message}`));
      process.exit(1);
    }
  });

const breakdownCmd = new Command("breakdown")
  .description("Show tier distribution breakdown over N days")
  .option("--days <n>", "Number of days to analyse", "30")
  .action(async (opts) => {
    try {
      const { SavingsReport } = await import("@lokaflow/route");
      const report = new SavingsReport();
      const days = parseInt(opts.days, 10);
      const tiers = report.tierDistribution(days);

      console.log(chalk.bold.blue(`\n  LokaRoute™ Tier Breakdown — last ${days} days`));
      console.log(chalk.dim("  ─────────────────────────────────────────────"));

      if (tiers.length === 0) {
        console.log(
          chalk.yellow(
            "  No routing records found yet. Start the proxy with `lokaflow route start`.\n",
          ),
        );
        return;
      }

      const total = tiers.reduce((s, t) => s + t.count, 0);
      const barWidth = 30;

      for (const t of tiers) {
        const pct = total > 0 ? t.count / total : 0;
        const filled = Math.round(pct * barWidth);
        const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);
        const tierColour = t.tier.startsWith("LOCAL")
          ? chalk.green
          : t.tier.startsWith("CLOUD")
            ? chalk.yellow
            : chalk.dim;
        console.log(
          `  ${tierColour(t.tier.padEnd(18))} ${chalk.dim(bar)}  ${t.count.toString().padStart(6)}q  ${formatPct(pct)}  score ${t.avgScore.toFixed(3)}`,
        );
      }
      console.log();
    } catch (e: any) {
      console.error(chalk.red(`  ✗ ${e.message}`));
      process.exit(1);
    }
  });

const feedbackCmd = new Command("feedback")
  .description("Record classifier feedback to improve routing accuracy")
  .argument("<session-id>", "Session / request ID to give feedback on")
  .argument("<rating>", "Rating: insufficient | overkill | correct")
  .option("--note <text>", "Optional free-text note")
  .action(async (sessionId: string, rating: string, opts) => {
    const validRatings = ["insufficient", "overkill", "correct"];
    if (!validRatings.includes(rating)) {
      console.error(chalk.red(`  ✗ Rating must be one of: ${validRatings.join(", ")}`));
      process.exit(1);
    }

    try {
      // Save feedback locally — will be picked up by PersonalisedLearner on next routing
      const { writeFileSync, mkdirSync, existsSync } = await import("fs");
      const { join } = await import("path");
      const { homedir } = await import("os");
      const dir = join(homedir(), ".lokaflow");
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const feedbackPath = join(dir, "feedback.jsonl");
      const entry = JSON.stringify({
        sessionId,
        rating,
        note: opts.note ?? null,
        recordedAt: new Date().toISOString(),
      });
      writeFileSync(feedbackPath, entry + "\n", { flag: "a", encoding: "utf8" });
      console.log(chalk.green(`\n  ✓ Feedback recorded for session ${sessionId} — ${rating}`));
      console.log(chalk.dim("    Saved to ~/.lokaflow/feedback.jsonl\n"));
    } catch (e: any) {
      console.error(chalk.red(`  ✗ ${e.message}`));
      process.exit(1);
    }
  });

const setupCmd = new Command("setup")
  .description("Interactive first-time setup wizard for LokaRoute")
  .action(async () => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q: string): Promise<string> =>
      new Promise((resolve) => rl.question(q, (a) => resolve(a.trim())));

    console.log(chalk.bold.blue("\n  LokaRoute™ Setup Wizard"));
    console.log(chalk.dim("  ─────────────────────────────────────────────\n"));

    const port = (await ask(`  Proxy port [4041]: `)) || "4041";
    const ollamaUrl =
      (await ask(`  Ollama URL [http://localhost:11434]: `)) || "http://localhost:11434";
    const sensitivity =
      (await ask(`  Classifier sensitivity (aggressive/balanced/conservative) [balanced]: `)) ||
      "balanced";
    const subscription =
      (await ask(`  Subscription plan (claude-pro/openai-plus/none) [none]: `)) || "none";

    rl.close();

    const { writeFileSync, mkdirSync, existsSync } = await import("fs");
    const { join } = await import("path");
    const { homedir } = await import("os");

    const configDir = join(homedir(), ".lokaflow");
    if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });

    const configPath = join(configDir, "route.yaml");
    const yaml = [
      "# LokaRoute configuration — generated by `lokaflow route setup`",
      "route:",
      `  port: ${port}`,
      `  ollamaUrl: "${ollamaUrl}"`,
      `  sensitivity: "${sensitivity}"`,
      `  subscription: "${subscription}"`,
      "",
      "classifier:",
      "  enablePersonalisedLearning: true",
      "  localTierThreshold: 0.4",
      "  cloudEscalateThreshold: 0.65",
    ].join("\n");

    writeFileSync(configPath, yaml, "utf8");

    console.log(chalk.green(`\n  ✓ Config written to ${configPath}`));
    console.log(chalk.dim("  Run `lokaflow route start` to launch the proxy.\n"));
    console.log(chalk.bold("  Configure your LLM client:"));
    console.log(chalk.dim(`    base_url = "http://localhost:${port}/v1"`));
    console.log(chalk.dim(`    api_key  = "lokaflow"`));
    console.log(chalk.dim(`    model    = "auto"  # LokaRoute handles model selection\n`));
  });

const dashboardCmd = new Command("dashboard")
  .description("Open the LokaRoute savings dashboard in your browser")
  .option("-p, --port <number>", "Dashboard port", "4042")
  .option("--start-server", "Start the dashboard server if not running")
  .action(async (opts) => {
    const port = parseInt(opts.port, 10);
    const dashUrl = `http://localhost:${port}`;

    if (opts.startServer) {
      try {
        const { DashboardServer } = await import("@lokaflow/route");
        const dash = new DashboardServer({ port });
        await dash.start();
        console.log(chalk.green(`\n  ✓ Dashboard started on ${dashUrl}`));
      } catch (e: any) {
        console.error(chalk.red(`  ✗ Could not start dashboard: ${e.message}`));
        process.exit(1);
      }
    }

    console.log(chalk.blue(`\n  Opening dashboard: ${dashUrl}\n`));
    openBrowser(dashUrl);
  });

// ── Root route command ─────────────────────────────────────────────────────

export const routeCommand = new Command("route")
  .description("LokaRoute™ — intelligent routing proxy (saves cloud API costs)")
  .addCommand(startCmd)
  .addCommand(savingsCmd)
  .addCommand(classifyCmd)
  .addCommand(breakdownCmd)
  .addCommand(feedbackCmd)
  .addCommand(setupCmd)
  .addCommand(dashboardCmd)
  .action(() => {
    routeCommand.help();
  });
