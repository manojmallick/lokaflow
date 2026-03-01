// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.

/**
 * MemoryStore — lightweight conversation memory backed by SQLite.
 *
 * Design decisions:
 * - No ChromaDB dependency: keeps the install lightweight and offline-first.
 *   ChromaDB requires a running server; we use SQLite + cosine similarity
 *   computed in JS for the free-tier use case.
 * - Semantic search is approximated with TF-IDF-style bag-of-words cosine
 *   similarity. Good enough for short conversation snippets; can be swapped
 *   for a true vector DB later by implementing the same interface.
 * - Data is stored in ~/.lokaflow/memory.db (same directory as budget.db).
 * - All content is stored locally. Zero cloud calls in this module.
 */

import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const DATA_DIR = join(homedir(), ".lokaflow");
const DB_PATH = join(DATA_DIR, "memory.db");

export interface MemoryEntry {
    id: number;
    sessionId: string;
    role: "user" | "assistant";
    content: string;
    summary?: string;
    /** TF-IDF vector serialised as JSON array */
    vector?: number[];
    createdAt: string;
}

export interface SimilarEntry {
    entry: MemoryEntry;
    similarity: number;
}

export class MemoryStore {
    private readonly db: InstanceType<typeof Database>;

    constructor(dbPath: string = DB_PATH) {
        if (!existsSync(DATA_DIR)) {
            mkdirSync(DATA_DIR, { recursive: true });
        }

        this.db = new Database(dbPath);
        this.db.pragma("journal_mode = WAL");
        this.db.pragma("foreign_keys = ON");
        this.createSchema();
    }

    private createSchema(): void {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS memory_entries (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id  TEXT    NOT NULL,
        role        TEXT    NOT NULL CHECK(role IN ('user', 'assistant')),
        content     TEXT    NOT NULL,
        summary     TEXT,
        vector      TEXT,                          -- JSON array of floats
        created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_memory_session
        ON memory_entries(session_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS memory_sessions (
        id          TEXT    PRIMARY KEY,
        title       TEXT,
        created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
      );
    `);
    }

    /** Store a message and optional TF-IDF vector. */
    add(
        sessionId: string,
        role: "user" | "assistant",
        content: string,
        options: { summary?: string; vector?: number[] } = {},
    ): number {
        const stmt = this.db.prepare(`
      INSERT INTO memory_entries (session_id, role, content, summary, vector)
      VALUES (?, ?, ?, ?, ?)
    `);
        const result = stmt.run(
            sessionId,
            role,
            content,
            options.summary ?? null,
            options.vector ? JSON.stringify(options.vector) : null,
        );

        // Touch the session record
        this.db
            .prepare(
                `INSERT INTO memory_sessions (id, title, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET updated_at = datetime('now')`,
            )
            .run(sessionId, sessionId);

        return result.lastInsertRowid as number;
    }

    /** Retrieve the N most recent messages for a session. */
    recent(sessionId: string, limit: number = 10): MemoryEntry[] {
        const rows = this.db
            .prepare(
                `SELECT id, session_id, role, content, summary, vector, created_at
         FROM memory_entries
         WHERE session_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
            )
            .all(sessionId, limit) as Array<{
                id: number;
                session_id: string;
                role: string;
                content: string;
                summary: string | null;
                vector: string | null;
                created_at: string;
            }>;

        return rows.reverse().map((r) => ({
            id: r.id,
            sessionId: r.session_id,
            role: r.role as "user" | "assistant",
            content: r.content,
            ...(r.summary !== null ? { summary: r.summary } : {}),
            ...(r.vector !== null ? { vector: JSON.parse(r.vector) as number[] } : {}),
            createdAt: r.created_at,
        }));
    }

    /**
     * Find entries similar to a query vector using cosine similarity.
     * Falls back to an empty array if no entries have stored vectors.
     */
    similar(queryVector: number[], topK: number = 5, sessionId?: string): SimilarEntry[] {
        const whereClause = sessionId ? "WHERE vector IS NOT NULL AND session_id = ?" : "WHERE vector IS NOT NULL";
        const params: unknown[] = sessionId ? [sessionId] : [];

        const rows = this.db
            .prepare(
                `SELECT id, session_id, role, content, summary, vector, created_at
         FROM memory_entries
         ${whereClause}`,
            )
            .all(...params) as Array<{
                id: number;
                session_id: string;
                role: string;
                content: string;
                summary: string | null;
                vector: string;
                created_at: string;
            }>;

        if (rows.length === 0) return [];

        const scored: SimilarEntry[] = rows.map((r) => {
            const v = JSON.parse(r.vector) as number[];
            return {
                entry: {
                    id: r.id,
                    sessionId: r.session_id,
                    role: r.role as "user" | "assistant",
                    content: r.content,
                    ...(r.summary !== null ? { summary: r.summary } : {}),
                    vector: v,
                    createdAt: r.created_at,
                },
                similarity: cosineSimilarity(queryVector, v),
            };
        });

        scored.sort((a, b) => b.similarity - a.similarity);
        return scored.slice(0, topK);
    }

    /** Delete all entries for a session. */
    clearSession(sessionId: string): void {
        this.db.prepare("DELETE FROM memory_entries WHERE session_id = ?").run(sessionId);
    }

    /** List all known sessions (most recently updated first). */
    listSessions(): Array<{ id: string; title: string | null; updatedAt: string }> {
        return (
            this.db
                .prepare(`SELECT id, title, updated_at FROM memory_sessions ORDER BY updated_at DESC`)
                .all() as Array<{ id: string; title: string | null; updated_at: string }>
        ).map((r) => ({ id: r.id, title: r.title, updatedAt: r.updated_at }));
    }

    close(): void {
        this.db.close();
    }
}

// ── Utilities ────────────────────────────────────────────────────────────────

/** Cosine similarity between two equal-length vectors. Returns 0 on zero-norm inputs. */
function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i]! * b[i]!;
        normA += a[i]! * a[i]!;
        normB += b[i]! * b[i]!;
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
}
