// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaRoute™ — lokaflow.io
//
// packages/route/src/tracker/report.ts
// SavingsReport — queries SavingsTracker SQLite DB and produces human-readable
// CLI output and structured JSON for the dashboard.

import Database from "better-sqlite3";
import chalk from "chalk";
import { existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { calculateSavingsAnalysis, SUBSCRIPTION_PLANS } from "./subscription-model.js";

export interface DailyTotal {
  date: string; // YYYY-MM-DD
  queries: number;
  localQueries: number;
  cloudQueries: number;
  savedUsd: number;
  actualCostUsd: number;
}

export interface TierBreakdown {
  tier: string;
  count: number;
  percent: number;
  avgScore: number;
  avgLatencyMs: number;
}

export interface ReportData {
  period: string;
  dailyTotals: DailyTotal[];
  tierBreakdown: TierBreakdown[];
  totalQueries: number;
  localQueries: number;
  cloudQueries: number;
  totalSavedUsd: number;
  actualCostUsd: number;
}

export class SavingsReport {
  private db: Database.Database;

  constructor(dbPath?: string) {
    if (!dbPath) {
      const configDir = join(homedir(), ".lokaflow");
      if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });
      dbPath = join(configDir, "route.db");
    }
    // Open read-only — report never writes
    this.db = new Database(dbPath, { readonly: !existsSync(dbPath) });
  }

  // ── Public API ────────────────────────────────────────────────────────────

  weeklyReport(): ReportData {
    return this.buildReport("last 7 days", 7);
  }

  monthlyReport(year?: number, month?: number): ReportData {
    const now = new Date();
    const y = year ?? now.getFullYear();
    const m = month ?? now.getMonth() + 1;
    const label = `${y}-${String(m).padStart(2, "0")}`;
    return this.buildReportForMonth(label);
  }

  allTimeSummary(): ReportData {
    return this.buildReport("all time", 36500); // ~100 years
  }

  dailyTotals(days = 30): DailyTotal[] {
    return this.queryDailyTotals(days);
  }

  tierDistribution(days = 30): TierBreakdown[] {
    return this.queryTierBreakdown(days);
  }

  // ── Formatted text output (for CLI) ──────────────────────────────────────

  printWeeklyReport(subscriptionKey = "claude-pro"): void {
    const data = this.weeklyReport();
    this.printReport(data, subscriptionKey, "7-day");
  }

  printMonthlyReport(subscriptionKey = "claude-pro", year?: number, month?: number): void {
    const data = this.monthlyReport(year, month);
    this.printReport(data, subscriptionKey, "monthly");
  }

  printAllTimeSummary(subscriptionKey = "claude-pro"): void {
    const data = this.allTimeSummary();
    this.printReport(data, subscriptionKey, "all-time");
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private buildReport(period: string, days: number): ReportData {
    const daily = this.queryDailyTotals(days);
    const tiers = this.queryTierBreakdown(days);
    const summary = this.queryRangeSummary(days);

    return {
      period,
      dailyTotals: daily,
      tierBreakdown: tiers,
      totalQueries: summary.totalQueries,
      localQueries: summary.localQueries,
      cloudQueries: summary.cloudQueries,
      totalSavedUsd: summary.totalSavedUsd,
      actualCostUsd: summary.actualCostUsd,
    };
  }

  private buildReportForMonth(yearMonth: string): ReportData {
    const daily = this.queryDailyTotalsForMonth(yearMonth);
    const tiers = this.queryTierBreakdownForMonth(yearMonth);
    const summary = this.queryMonthSummary(yearMonth);

    return {
      period: yearMonth,
      dailyTotals: daily,
      tierBreakdown: tiers,
      ...summary,
    };
  }

  private queryDailyTotals(days: number): DailyTotal[] {
    const stmt = this.db.prepare(`
      SELECT
        DATE(timestamp) as date,
        COUNT(*) as queries,
        SUM(CASE WHEN tier LIKE 'local%' THEN 1 ELSE 0 END) as localQueries,
        SUM(CASE WHEN tier LIKE 'cloud%' THEN 1 ELSE 0 END) as cloudQueries,
        COALESCE(SUM(saved_usd), 0) as savedUsd,
        COALESCE(SUM(actual_cost_usd), 0) as actualCostUsd
      FROM routing_log
      WHERE timestamp >= datetime('now', ?)
      GROUP BY DATE(timestamp)
      ORDER BY date ASC
    `);
    return stmt.all(`-${days} days`) as DailyTotal[];
  }

  private queryDailyTotalsForMonth(yearMonth: string): DailyTotal[] {
    const stmt = this.db.prepare(`
      SELECT
        DATE(timestamp) as date,
        COUNT(*) as queries,
        SUM(CASE WHEN tier LIKE 'local%' THEN 1 ELSE 0 END) as localQueries,
        SUM(CASE WHEN tier LIKE 'cloud%' THEN 1 ELSE 0 END) as cloudQueries,
        COALESCE(SUM(saved_usd), 0) as savedUsd,
        COALESCE(SUM(actual_cost_usd), 0) as actualCostUsd
      FROM routing_log
      WHERE strftime('%Y-%m', timestamp) = ?
      GROUP BY DATE(timestamp)
      ORDER BY date ASC
    `);
    return stmt.all(yearMonth) as DailyTotal[];
  }

  private queryTierBreakdown(days: number): TierBreakdown[] {
    const total = (
      this.db
        .prepare(`SELECT COUNT(*) as n FROM routing_log WHERE timestamp >= datetime('now', ?)`)
        .get(`-${days} days`) as any
    ).n as number;
    const stmt = this.db.prepare(`
      SELECT
        tier,
        COUNT(*) as count,
        AVG(classifier_score) as avgScore,
        AVG(latency_ms) as avgLatencyMs
      FROM routing_log
      WHERE timestamp >= datetime('now', ?)
      GROUP BY tier
      ORDER BY count DESC
    `);
    const rows = stmt.all(`-${days} days`) as Array<{
      tier: string;
      count: number;
      avgScore: number;
      avgLatencyMs: number;
    }>;
    return rows.map((r) => ({
      ...r,
      percent: total > 0 ? (r.count / total) * 100 : 0,
    }));
  }

  private queryTierBreakdownForMonth(yearMonth: string): TierBreakdown[] {
    const total = (
      this.db
        .prepare(`SELECT COUNT(*) as n FROM routing_log WHERE strftime('%Y-%m', timestamp) = ?`)
        .get(yearMonth) as any
    ).n as number;
    const stmt = this.db.prepare(`
      SELECT tier, COUNT(*) as count, AVG(classifier_score) as avgScore, AVG(latency_ms) as avgLatencyMs
      FROM routing_log WHERE strftime('%Y-%m', timestamp) = ?
      GROUP BY tier ORDER BY count DESC
    `);
    return (stmt.all(yearMonth) as any[]).map((r) => ({
      ...r,
      percent: total > 0 ? (r.count / total) * 100 : 0,
    }));
  }

  private queryRangeSummary(days: number) {
    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as totalQueries,
        SUM(CASE WHEN tier LIKE 'local%' THEN 1 ELSE 0 END) as localQueries,
        SUM(CASE WHEN tier LIKE 'cloud%' THEN 1 ELSE 0 END) as cloudQueries,
        COALESCE(SUM(saved_usd), 0) as totalSavedUsd,
        COALESCE(SUM(actual_cost_usd), 0) as actualCostUsd
      FROM routing_log WHERE timestamp >= datetime('now', ?)
    `);
    return stmt.get(`-${days} days`) as {
      totalQueries: number;
      localQueries: number;
      cloudQueries: number;
      totalSavedUsd: number;
      actualCostUsd: number;
    };
  }

  private queryMonthSummary(yearMonth: string) {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as totalQueries,
        SUM(CASE WHEN tier LIKE 'local%' THEN 1 ELSE 0 END) as localQueries,
        SUM(CASE WHEN tier LIKE 'cloud%' THEN 1 ELSE 0 END) as cloudQueries,
        COALESCE(SUM(saved_usd), 0) as totalSavedUsd,
        COALESCE(SUM(actual_cost_usd), 0) as actualCostUsd
      FROM routing_log WHERE strftime('%Y-%m', timestamp) = ?
    `);
    return stmt.get(yearMonth) as {
      totalQueries: number;
      localQueries: number;
      cloudQueries: number;
      totalSavedUsd: number;
      actualCostUsd: number;
    };
  }

  private printReport(data: ReportData, subscriptionKey: string, label: string): void {
    const plan = SUBSCRIPTION_PLANS[subscriptionKey];
    const analysis = calculateSavingsAnalysis(
      data.actualCostUsd,
      data.totalQueries,
      data.localQueries,
      subscriptionKey,
    );

    console.log(chalk.bold.cyan(`\n LokaRoute Savings Report — ${label} (${data.period})`));
    console.log(chalk.dim("─".repeat(58)));

    console.log(`  ${chalk.bold("Total queries")}:  ${data.totalQueries}`);
    console.log(
      `  ${chalk.green("Local")} queries:  ${data.localQueries} (${((data.localQueries / Math.max(data.totalQueries, 1)) * 100).toFixed(1)}%)`,
    );
    console.log(`  ${chalk.yellow("Cloud")} queries:  ${data.cloudQueries}`);
    console.log(`  Actual spend:   ${chalk.yellow("$" + data.actualCostUsd.toFixed(4))}`);
    console.log(
      `  ${plan ? plan.label + " sub cost" : "Subscription"}:  $${plan?.monthlyUsd.toFixed(2) ?? "—"}`,
    );
    console.log(
      `  ${chalk.green("Net saved")}:      ${chalk.bold.green("$" + analysis.netSavedUsd.toFixed(2))}`,
    );

    console.log(chalk.dim("\n  Tier Distribution:"));
    for (const t of data.tierBreakdown) {
      const bar = "█".repeat(Math.round(t.percent / 5));
      const tierColor = t.tier.startsWith("local") ? chalk.green : chalk.yellow;
      console.log(
        `    ${tierColor(t.tier.padEnd(18))} ${bar.padEnd(20)} ${t.percent.toFixed(1)}%  (avg ${t.avgLatencyMs.toFixed(0)}ms)`,
      );
    }

    console.log(chalk.dim("\n  Recommendation:"));
    console.log(
      `    ${analysis.keepSubscription ? chalk.yellow("⚠") : chalk.green("✓")}  ${analysis.recommendation}`,
    );
    console.log();
  }
}
