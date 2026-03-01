// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaMesh Battery Intelligence™ — lokaflow.io

import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import chalk from "chalk";

export interface HealthRecord {
    nodeId: string;
    date: string; // YYYY-MM-DD
    healthPct: number;
    cycleCount: number;
    designCapacityMah: number;
    measuredCapacityMah: number;
    avgDailyStressScore: number;
}

export class ClusterBatteryStore {
    private db: Database.Database;

    constructor(dbPath?: string) {
        if (!dbPath) {
            const configDir = join(homedir(), ".lokaflow");
            if (!existsSync(configDir)) {
                mkdirSync(configDir, { recursive: true });
            }
            dbPath = join(configDir, "battery.db");
        }

        this.db = new Database(dbPath);
        this.initSchema();
    }

    private initSchema() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS battery_readings (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        node_id     TEXT NOT NULL,
        timestamp   TEXT NOT NULL,
        percent     REAL NOT NULL,
        is_charging INTEGER NOT NULL,
        temp_c      REAL,
        health_pct  REAL,
        cycle_count INTEGER,
        stress_score INTEGER
      );
    
      CREATE INDEX IF NOT EXISTS idx_node_time ON battery_readings(node_id, timestamp);

      CREATE TABLE IF NOT EXISTS health_snapshots (
        id                    INTEGER PRIMARY KEY AUTOINCREMENT,
        node_id               TEXT NOT NULL,
        date                  TEXT NOT NULL,  -- YYYY-MM-DD
        health_pct            REAL NOT NULL,
        cycle_count           INTEGER,
        design_capacity_mah   INTEGER,
        measured_capacity_mah INTEGER,
        avg_daily_stress      REAL,
        UNIQUE(node_id, date)
      );
    `);
    }

    insertReading(reading: {
        nodeId: string;
        timestamp: string;
        percent: number;
        isCharging: boolean;
        tempC: number;
        healthPct: number;
        cycleCount: number;
        stressScore: number;
    }): void {
        const stmt = this.db.prepare(`
      INSERT INTO battery_readings (
        node_id, timestamp, percent, is_charging, temp_c, health_pct, cycle_count, stress_score
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

        try {
            stmt.run(
                reading.nodeId,
                reading.timestamp,
                reading.percent,
                reading.isCharging ? 1 : 0,
                reading.tempC,
                reading.healthPct,
                reading.cycleCount,
                reading.stressScore
            );
        } catch (e: any) {
            console.error(chalk.red(`[BatteryStore] Failed to insert reading: ${e.message}`));
        }
    }

    insertHealthRecord(record: HealthRecord): void {
        const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO health_snapshots (
        node_id, date, health_pct, cycle_count, design_capacity_mah, measured_capacity_mah, avg_daily_stress
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

        try {
            stmt.run(
                record.nodeId,
                record.date,
                record.healthPct,
                record.cycleCount,
                record.designCapacityMah,
                record.measuredCapacityMah,
                record.avgDailyStressScore
            );
        } catch (e: any) {
            console.error(chalk.red(`[BatteryStore] Failed to insert health snapshot: ${e.message}`));
        }
    }

    avgStressToday(nodeId: string): number {
        const stmt = this.db.prepare(`
      SELECT AVG(stress_score) as avgStress
      FROM battery_readings
      WHERE node_id = ? AND date(timestamp) = date('now')
    `);
        const result = stmt.get(nodeId) as any;
        return result?.avgStress || 0;
    }

    getHealthHistory(nodeId: string, days: number = 90): HealthRecord[] {
        const stmt = this.db.prepare(`
      SELECT * FROM health_snapshots
      WHERE node_id = ? AND date >= date('now', ?)
      ORDER BY date ASC
    `);

        return stmt.all(nodeId, `-${days} days`).map((row: any) => ({
            nodeId: row.node_id,
            date: row.date,
            healthPct: row.health_pct,
            cycleCount: row.cycle_count,
            designCapacityMah: row.design_capacity_mah,
            measuredCapacityMah: row.measured_capacity_mah,
            avgDailyStressScore: row.avg_daily_stress
        }));
    }

    avgDailyCycles(nodeId: string, days: number = 30): number {
        const history = this.getHealthHistory(nodeId, days);
        if (history.length < 2) return 0;

        const first = history[0];
        const last = history[history.length - 1];
        if (!first || !last) return 0;

        const cycleDelta = last.cycleCount - first.cycleCount;
        const timeDeltaDays = (new Date(last.date).getTime() - new Date(first.date).getTime()) / (1000 * 60 * 60 * 24);

        if (timeDeltaDays === 0) return 0;
        return Math.max(0, cycleDelta / timeDeltaDays);
    }
}
