// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
//
// packages/api/src/routes/logs.ts
// GET /v1/logs/raw?lines=N   → last N lines from lokaflow-routing.log (JSON)
// GET /v1/logs/stream        → SSE — sends all existing lines, then tails new content live

import { existsSync, readFileSync, statSync, watch } from "fs";
import { join } from "path";
import type { FastifyPluginAsync } from "fastify";

const LOG_FILE = join(process.cwd(), "lokaflow-routing.log");
const MAX_LINES = 2000;

function tailLines(n: number): string[] {
  if (!existsSync(LOG_FILE)) return [];
  try {
    const raw = readFileSync(LOG_FILE, "utf8");
    return raw
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .slice(-Math.min(n, MAX_LINES));
  } catch {
    return [];
  }
}

const logsRoute: FastifyPluginAsync = async (fastify) => {
  // ── REST: returns last N lines as JSON ─────────────────────────────────────
  fastify.get<{ Querystring: { lines?: string } }>(
    "/v1/logs/raw",
    {
      schema: {
        summary: "Raw log lines",
        description: "Returns the last N lines from lokaflow-routing.log as a JSON array.",
        tags: ["Metrics"],
        querystring: {
          type: "object",
          properties: { lines: { type: "string", default: "200" } },
        },
      },
    },
    async (request, reply) => {
      const n = Math.min(parseInt(request.query.lines ?? "200", 10) || 200, MAX_LINES);
      const lines = tailLines(n);
      return reply.send({ lines, total: lines.length, file: LOG_FILE });
    },
  );

  // ── SSE: streams existing lines then tails new content ─────────────────────
  fastify.get(
    "/v1/logs/stream",
    {
      schema: {
        summary: "Live log stream (SSE)",
        description:
          "Server-Sent Events stream of lokaflow-routing.log. " +
          "Sends all existing lines first, then pushes new lines as they are written.",
        tags: ["Metrics"],
      },
    },
    async (request, reply) => {
      const origin = (request.headers["origin"] as string) ?? "*";
      reply.raw.setHeader("Access-Control-Allow-Origin", origin);
      reply.raw.setHeader("Access-Control-Allow-Credentials", "true");
      reply.raw.setHeader("Content-Type", "text/event-stream");
      reply.raw.setHeader("Cache-Control", "no-cache");
      reply.raw.setHeader("Connection", "keep-alive");
      reply.raw.setHeader("X-Accel-Buffering", "no");
      reply.hijack();

      // 1. Send all existing lines immediately
      const existing = tailLines(500);
      for (const line of existing) {
        reply.raw.write(`data: ${JSON.stringify({ line })}\n\n`);
      }

      if (!existsSync(LOG_FILE)) {
        reply.raw.write(
          `data: ${JSON.stringify({ line: "─── log file not found — send a chat message to generate routing logs ───" })}\n\n`,
        );
        reply.raw.end();
        return;
      }

      // 2. Watch for new bytes and send any new complete lines
      let offset = statSync(LOG_FILE).size;
      let closed = false;
      let partial = "";

      const watcher = watch(LOG_FILE, () => {
        if (closed) return;
        try {
          const current = statSync(LOG_FILE).size;
          if (current < offset) {
            // Log rotated — reset
            offset = 0;
            partial = "";
          }
          if (current > offset) {
            const raw = readFileSync(LOG_FILE, "utf8");
            const newContent = raw.slice(offset);
            offset = current;
            partial += newContent;
            const lines = partial.split("\n");
            partial = lines.pop() ?? "";
            for (const l of lines) {
              if (l.trim()) {
                reply.raw.write(`data: ${JSON.stringify({ line: l })}\n\n`);
              }
            }
          }
        } catch {
          // file may have been rotated mid-read — ignore; next event will recover
        }
      });

      // Keep-alive heartbeat (prevents proxy timeouts)
      const heartbeat = setInterval(() => {
        if (!closed) reply.raw.write(": ping\n\n");
      }, 15_000);

      request.raw.on("close", () => {
        closed = true;
        watcher.close();
        clearInterval(heartbeat);
      });
    },
  );
};

export default logsRoute;
