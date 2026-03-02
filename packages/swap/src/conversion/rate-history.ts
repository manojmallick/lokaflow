// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaSwap™ — lokaflow.io
/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */

import Database from "better-sqlite3";
import chalk from "chalk";
import { GovernedRate, RateEngine } from "./rate-engine.js";

export interface RateChange {
  provider: string;
  previousInputMultiplier: number;
  previousOutputMultiplier: number;
  newInputMultiplier: number;
  newOutputMultiplier: number;
  /** Percentage change in output rate */
  outputChangePct: number;
  proposalId?: string;
  effectiveFrom: string;
}

/**
 * RateHistory — transparent audit log of all LokaSwap rate changes.
 *
 * Every rate change must be authorised by a governance proposal.
 * RateHistory provides the public record that members can audit
 * to verify no rates were changed without community approval.
 */
export class RateHistory {
  constructor(
    private readonly engine: RateEngine,
    private readonly db: Database.Database,
  ) {}

  /**
   * Get the full rate history for a provider, ordered oldest-first.
   */
  getHistory(provider: string): GovernedRate[] {
    return (
      this.db
        .prepare(
          `
      SELECT * FROM conversion_rates
      WHERE provider = ?
      ORDER BY effective_from ASC
    `,
        )
        .all(provider) as any[]
    ).map((row: any) => ({
      provider: row.provider,
      inputMultiplier: row.input_multiplier,
      outputMultiplier: row.output_multiplier,
      proposalId: row.proposal_id ?? undefined,
      effectiveFrom: row.effective_from,
      effectiveTo: row.effective_to ?? undefined,
      approvedBy: row.approved_by,
      createdAt: row.created_at,
    }));
  }

  /**
   * Compute the list of rate changes (diffs) for a provider.
   */
  getChanges(provider: string): RateChange[] {
    const history = this.getHistory(provider);
    if (history.length < 2) return [];

    const changes: RateChange[] = [];
    for (let i = 1; i < history.length; i++) {
      const prev = history[i - 1]!;
      const curr = history[i]!;
      const outputChangePct =
        prev.outputMultiplier > 0
          ? ((curr.outputMultiplier - prev.outputMultiplier) / prev.outputMultiplier) * 100
          : 0;

      changes.push({
        provider,
        previousInputMultiplier: prev.inputMultiplier,
        previousOutputMultiplier: prev.outputMultiplier,
        newInputMultiplier: curr.inputMultiplier,
        newOutputMultiplier: curr.outputMultiplier,
        outputChangePct: parseFloat(outputChangePct.toFixed(2)),
        ...(curr.proposalId !== undefined && { proposalId: curr.proposalId }),
        effectiveFrom: curr.effectiveFrom,
      });
    }
    return changes;
  }

  /**
   * Print a formatted CLI table of rate history for all providers.
   */
  printHistory(): void {
    const allRates = this.engine.getAllCurrentRates();
    const providers = [...new Set(allRates.map((r) => r.provider))];

    console.log(chalk.bold("\n  LokaSwap™ — Conversion Rate History"));
    console.log(chalk.dim("  ─────────────────────────────────────────────────────────────"));

    for (const provider of providers) {
      const history = this.getHistory(provider);
      console.log(chalk.bold(`\n  ${provider}`));
      console.log(
        chalk.dim(
          `  ${"Effective From".padEnd(16)} ${"Output/1M".padEnd(16)} ${"Change".padEnd(10)} Proposal`,
        ),
      );

      for (const rate of history) {
        const isCurrent = !rate.effectiveTo;
        const outputLabel = `${(rate.outputMultiplier / 1000).toFixed(0)}K LC`.padEnd(16);
        const effectiveTo = rate.effectiveTo ? ` → ${rate.effectiveTo}` : " (current)";
        const dateLabel = `${rate.effectiveFrom}${effectiveTo}`.padEnd(16);
        const proposalLabel = rate.proposalId ?? "genesis";

        const changes = this.getChanges(provider);
        const change = changes.find((c) => c.effectiveFrom === rate.effectiveFrom);
        const changePct = change
          ? change.outputChangePct >= 0
            ? chalk.red(`+${change.outputChangePct}%`)
            : chalk.green(`${change.outputChangePct}%`)
          : chalk.dim("—");

        const line = `  ${dateLabel} ${outputLabel} ${String(changePct).padEnd(12)} ${chalk.dim(proposalLabel)}`;
        console.log(isCurrent ? chalk.white(line) : chalk.dim(line));
      }
    }
    console.log();
  }
}
