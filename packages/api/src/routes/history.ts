// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
//
// packages/api/src/routes/history.ts
// GET /v1/history — returns recent routing decisions parsed from lokaflow-routing.log

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { FastifyPluginAsync } from "fastify";

const LOG_FILE = join(process.cwd(), "lokaflow-routing.log");
const DEFAULT_LIMIT = 20;

export interface HistoryEntry {
    timestamp: string;
    tier: string;
    model: string;
    reason: string;
    score: number;
    costEur: number;
    latencyMs: number;
    node: string;        // provider node address, e.g. ollama[@192.168.2.65]
}

function parseDecisionLine(line: string): Omit<HistoryEntry, "timestamp" | "node"> | null {
    // decision: TIER=delegated | MODEL=... | REASON=... | SCORE=0.40 | COST=€0.00011 | LATENCY=189760ms
    const match = line.match(
        /decision:\s*TIER=(\S+)\s*\|\s*MODEL=(\S+)\s*\|\s*REASON=(\S+)\s*\|\s*SCORE=([\d.]+)\s*\|\s*COST=€([\d.]+)\s*\|\s*LATENCY=(\d+)ms/
    );
    if (!match) return null;
    return {
        tier:      match[1]!.toLowerCase(),
        model:     match[2]!,
        reason:    match[3]!,
        score:     parseFloat(match[4]!),
        costEur:   parseFloat(match[5]!),
        latencyMs: parseInt(match[6]!, 10),
    };
}

function parselog(limit: number): HistoryEntry[] {
    if (!existsSync(LOG_FILE)) return [];

    let raw: string;
    try {
        raw = readFileSync(LOG_FILE, "utf8");
    } catch {
        return [];
    }

    // Each block starts with a line like:
    // [2026-02-28T23:41:41.837Z] ─── NEW ROUTING REQUEST ───
    // Split on that boundary so the timestamp stays with its block.
    const blocks = raw.split(/\n(?=\[\d{4}-\d{2}-\d{2}T[\d:.]+Z\]\s*─{3,})/);

    const entries: HistoryEntry[] = [];

    for (const block of blocks) {
        const lines = block.split("\n");

        // First line: "[ISO] ─── NEW ROUTING REQUEST ───"
        const tsLine = lines[0]?.trim() ?? "";
        const tsMatch = tsLine.match(/\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\]/);
        if (!tsMatch) continue;
        const timestamp = tsMatch[1]!;

        // Find decision line anywhere in the block
        const decisionLine = lines.find(l => l.trimStart().startsWith("decision:"));
        if (!decisionLine) continue;

        const parsed = parseDecisionLine(decisionLine);
        if (!parsed) continue;

        // Extract node from "step 5: dispatching request to X" — works for all tiers
        const step5Line = lines.find(l => /step 5:/i.test(l));
        let node = "unknown";
        if (step5Line) {
            const nodeMatch = step5Line.match(/dispatching request to\s+(\S+)/i);
            if (nodeMatch) node = nodeMatch[1]!.replace(/^ollama\[/, "").replace(/\]$/, "").trim();
        }

        entries.push({ timestamp, ...parsed, node });
    }

    // Return newest-first, capped to limit
    return entries.reverse().slice(0, limit);
}

const historyRoute: FastifyPluginAsync = async (fastify) => {
    fastify.get<{ Querystring: { limit?: string } }>(
        "/v1/history",
        {
            schema: {
                summary: "Recent routing decisions",
                description: "Returns the last N routing decisions parsed from lokaflow-routing.log.",
                tags: ["Metrics"],
                querystring: {
                    type: "object",
                    properties: {
                        limit: { type: "string", description: "Max entries to return (default 20)" },
                    },
                },
                response: {
                    200: {
                        type: "object",
                        properties: {
                            entries: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        timestamp: { type: "string" },
                                        tier:      { type: "string" },
                                        model:     { type: "string" },
                                        reason:    { type: "string" },
                                        score:     { type: "number" },
                                        costEur:   { type: "number" },
                                        latencyMs: { type: "number" },
                                        node:      { type: "string" },
                                    },
                                },
                            },
                            total: { type: "number" },
                            logFile: { type: "string" },
                        },
                    },
                },
            },
        },
        async (request) => {
            const limit = Math.min(parseInt(request.query.limit ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, 100);
            const entries = parselog(limit);
            return {
                entries,
                total: entries.length,
                logFile: LOG_FILE,
            };
        }
    );
};

export default historyRoute;
