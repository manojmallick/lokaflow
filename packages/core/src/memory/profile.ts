// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.

/**
 * UserProfile — persists per-user preferences and contextual metadata.
 * Stored in the same SQLite database as MemoryStore (memory.db).
 * Zero cloud calls — entirely local.
 *
 * Profile fields:
 *  - preferredLanguage: ISO 639-1 code (e.g. "en", "nl")
 *  - preferredModel: override default model selection
 *  - timezone: IANA timezone string
 *  - customInstructions: freeform system-level instructions prepended to every chat
 *  - topics: tracked interest topics for better retrieval
 */

import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const DATA_DIR = join(homedir(), ".lokaflow");
const DB_PATH = join(DATA_DIR, "memory.db");

export interface UserProfile {
    id: string;
    preferredLanguage?: string;
    preferredModel?: string;
    timezone?: string;
    customInstructions?: string;
    topics: string[];
    createdAt: string;
    updatedAt: string;
}

export class ProfileStore {
    private readonly db: InstanceType<typeof Database>;

    constructor(dbPath: string = DB_PATH) {
        if (!existsSync(DATA_DIR)) {
            mkdirSync(DATA_DIR, { recursive: true });
        }
        this.db = new Database(dbPath);
        this.db.pragma("journal_mode = WAL");
        this.createSchema();
    }

    private createSchema(): void {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        id                   TEXT PRIMARY KEY,
        preferred_language   TEXT,
        preferred_model      TEXT,
        timezone             TEXT,
        custom_instructions  TEXT,
        topics               TEXT NOT NULL DEFAULT '[]',  -- JSON array
        created_at           TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    }

    /** Load a profile by ID. Returns a default profile if not found. */
    load(id: string = "default"): UserProfile {
        const row = this.db
            .prepare(
                `SELECT id, preferred_language, preferred_model, timezone,
                custom_instructions, topics, created_at, updated_at
         FROM user_profiles WHERE id = ?`,
            )
            .get(id) as
            | {
                id: string;
                preferred_language: string | null;
                preferred_model: string | null;
                timezone: string | null;
                custom_instructions: string | null;
                topics: string;
                created_at: string;
                updated_at: string;
            }
            | undefined;

        if (!row) {
            return {
                id,
                topics: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
        }

        return {
            id: row.id,
            ...(row.preferred_language !== null ? { preferredLanguage: row.preferred_language } : {}),
            ...(row.preferred_model !== null ? { preferredModel: row.preferred_model } : {}),
            ...(row.timezone !== null ? { timezone: row.timezone } : {}),
            ...(row.custom_instructions !== null ? { customInstructions: row.custom_instructions } : {}),
            topics: JSON.parse(row.topics) as string[],
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }

    /** Upsert a profile with partial fields. */
    save(id: string = "default", partial: Partial<Omit<UserProfile, "id" | "createdAt" | "updatedAt">>): UserProfile {
        const existing = this.load(id);
        const merged = {
            ...(partial.preferredLanguage !== undefined || existing.preferredLanguage !== undefined
                ? { preferredLanguage: partial.preferredLanguage ?? existing.preferredLanguage }
                : {}),
            ...(partial.preferredModel !== undefined || existing.preferredModel !== undefined
                ? { preferredModel: partial.preferredModel ?? existing.preferredModel }
                : {}),
            ...(partial.timezone !== undefined || existing.timezone !== undefined
                ? { timezone: partial.timezone ?? existing.timezone }
                : {}),
            ...(partial.customInstructions !== undefined || existing.customInstructions !== undefined
                ? { customInstructions: partial.customInstructions ?? existing.customInstructions }
                : {}),
            topics: partial.topics ?? existing.topics,
        };

        this.db
            .prepare(
                `INSERT INTO user_profiles
           (id, preferred_language, preferred_model, timezone, custom_instructions, topics, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           preferred_language  = excluded.preferred_language,
           preferred_model     = excluded.preferred_model,
           timezone            = excluded.timezone,
           custom_instructions = excluded.custom_instructions,
           topics              = excluded.topics,
           updated_at          = datetime('now')`,
            )
            .run(
                id,
                merged.preferredLanguage ?? null,
                merged.preferredModel ?? null,
                merged.timezone ?? null,
                merged.customInstructions ?? null,
                JSON.stringify(merged.topics),
            );

        return this.load(id);
    }

    /** Add a topic of interest to the profile (deduplicates). */
    addTopic(id: string = "default", topic: string): void {
        const profile = this.load(id);
        const topics = [...new Set([...profile.topics, topic.trim().toLowerCase()])];
        this.save(id, { topics });
    }

    /** Remove all data for a user. */
    delete(id: string): void {
        this.db.prepare("DELETE FROM user_profiles WHERE id = ?").run(id);
    }

    close(): void {
        this.db.close();
    }
}
