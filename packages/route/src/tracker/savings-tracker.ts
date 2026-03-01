// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaRoute™ — lokaflow.io

import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import chalk from "chalk";

export interface RouteRecord {
    id: string;
    timestamp: string;
    queryTokensEstimate: number;
    tier: string;
    modelUsed: string;
    actualCostUsd: number;
    alternativeCostUsd: number;
    savedUsd: number;
    latencyMs: number;
    classifierScore: number;
    localAvailable: boolean;
    reason: string;
}

export interface SavingsSummary {
    period: string;
    totalQueries: number;
    localQueries: number;
    cloudQueries: number;
    actualCostUsd: number;
    alternativeCostUsd: number;
    totalSavedUsd: number;
}

export class SavingsTracker {
    private db: Database.Database;

    constructor(dbPath?: string) {
        if (!dbPath) {
            const configDir = join(homedir(), ".lokaflow");
            if (!existsSync(configDir)) {
                mkdirSync(configDir, { recursive: true });
            }
            dbPath = join(configDir, "route.db");
        }

        // Connect to SQLite silently
        this.db = new Database(dbPath);
        this.initSchema();
    }

    private initSchema() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS routing_log (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        query_tokens_estimate INTEGER NOT NULL,
        tier TEXT NOT NULL,
        model_used TEXT NOT NULL,
        actual_cost_usd REAL NOT NULL,
        alternative_cost_usd REAL NOT NULL,
        saved_usd REAL NOT NULL,
        latency_ms INTEGER NOT NULL,
        classifier_score REAL NOT NULL,
        local_available INTEGER NOT NULL,
        reason TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_timestamp ON routing_log(timestamp);
      CREATE INDEX IF NOT EXISTS idx_tier ON routing_log(tier);
    `);
    }

    record(record: RouteRecord): void {
        const stmt = this.db.prepare(`
      INSERT INTO routing_log (
        id, timestamp, query_tokens_estimate, tier, model_used,
        actual_cost_usd, alternative_cost_usd, saved_usd,
        latency_ms, classifier_score, local_available, reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

        try {
            stmt.run(
                record.id,
                record.timestamp,
                record.queryTokensEstimate,
                record.tier,
                record.modelUsed,
                record.actualCostUsd,
                record.alternativeCostUsd,
                record.savedUsd,
                record.latencyMs,
                record.classifierScore,
                record.localAvailable ? 1 : 0,
                record.reason
            );
        } catch (e: any) {
            console.error(chalk.red(`[SavingsTracker] Failed to record routing decision: ${e.message}`));
        }
    }

    monthToDateSummary(): SavingsSummary {
        // SQLite approach to get current month (YYYY-MM)
        const stmt = this.db.prepare(`
      SELECT 
        COUNT(*) as totalQueries,
        SUM(CASE WHEN tier LIKE 'local%' THEN 1 ELSE 0 END) as localQueries,
        SUM(CASE WHEN tier LIKE 'cloud%' THEN 1 ELSE 0 END) as cloudQueries,
        COALESCE(SUM(actual_cost_usd), 0) as actualCostUsd,
        COALESCE(SUM(alternative_cost_usd), 0) as alternativeCostUsd,
        COALESCE(SUM(saved_usd), 0) as totalSavedUsd
      FROM routing_log
      WHERE strftime('%Y-%m', timestamp) = strftime('%Y-%m', 'now')
    `);

        const result = stmt.get() as any;

        return {
            period: new Date().toISOString().substring(0, 7), // YYYY-MM
            totalQueries: result.totalQueries,
            localQueries: result.localQueries,
            cloudQueries: result.cloudQueries,
            actualCostUsd: result.actualCostUsd,
            alternativeCostUsd: result.alternativeCostUsd,
            totalSavedUsd: result.totalSavedUsd,
        };
    }
}
