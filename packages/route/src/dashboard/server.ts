// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaRoute™ — lokaflow.io
//
// packages/route/src/dashboard/server.ts
// Local savings dashboard — serves a self-contained HTML page at localhost:4040.
// No external CDN dependencies; all chart rendering is inline SVG sparklines.

import Fastify, { FastifyInstance } from "fastify";
import chalk from "chalk";
import { SavingsReport } from "../tracker/report.js";
import { SavingsTracker } from "../tracker/savings-tracker.js";

export interface DashboardConfig {
  port?: number;
  subscriptionKey?: string;
  dbPath?: string;
}

export class DashboardServer {
  private app: FastifyInstance;
  private report: SavingsReport;
  private tracker: SavingsTracker;
  private port: number;
  private sub: string;

  constructor(config: DashboardConfig = {}) {
    this.port = config.port ?? 4040;
    this.sub  = config.subscriptionKey ?? "claude-pro";
    this.report  = new SavingsReport(config.dbPath);
    this.tracker = new SavingsTracker(config.dbPath);
    this.app = Fastify({ logger: false });
    this.registerRoutes();
  }

  // ── API routes ────────────────────────────────────────────────────────────

  private registerRoutes(): void {
    // JSON summary endpoint used by the sparkline charts
    this.app.get("/api/summary", async (_req, reply) => {
      const summary = this.tracker.monthToDateSummary();
      return reply.send(summary);
    });

    this.app.get("/api/daily", async (_req, reply) => {
      const daily = this.report.dailyTotals(30);
      return reply.send({ daily });
    });

    this.app.get("/api/tiers", async (_req, reply) => {
      const tiers = this.report.tierDistribution(30);
      return reply.send({ tiers });
    });

    this.app.get("/api/weekly", async (_req, reply) => {
      const data = this.report.weeklyReport();
      return reply.send(data);
    });

    // HTML dashboard — single self-contained page
    this.app.get("/", async (_req, reply) => {
      reply.type("text/html");
      return reply.send(this.buildDashboardHtml());
    });
  }

  async start(): Promise<void> {
    await this.app.listen({ port: this.port, host: "127.0.0.1" });
    console.log(chalk.cyan(`[LokaRoute] Dashboard: http://localhost:${this.port}`));
  }

  async stop(): Promise<void> {
    await this.app.close();
  }

  // ── HTML generation ───────────────────────────────────────────────────────

  private buildDashboardHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>LokaRoute™ — Savings Dashboard</title>
  <style>
    :root {
      --bg:      #0d1117;
      --surface: #161b22;
      --border:  #30363d;
      --text:    #e6edf3;
      --muted:   #8b949e;
      --green:   #3fb950;
      --yellow:  #d29922;
      --blue:    #58a6ff;
      --red:     #f85149;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", monospace; background: var(--bg); color: var(--text); }
    header { padding: 1.5rem 2rem; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 1rem; }
    header h1 { font-size: 1.25rem; font-weight: 700; }
    header span { color: var(--muted); font-size: 0.85rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; padding: 1.5rem 2rem; }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 1.25rem; }
    .card .label { font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }
    .card .value { font-size: 2rem; font-weight: 700; }
    .card .sub   { font-size: 0.8rem; color: var(--muted); margin-top: 0.25rem; }
    .card .value.green  { color: var(--green); }
    .card .value.yellow { color: var(--yellow); }
    .card .value.blue   { color: var(--blue); }
    .section { padding: 0 2rem 2rem; }
    .section h2 { font-size: 0.95rem; font-weight: 600; margin-bottom: 1rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
    #chart { height: 120px; width: 100%; }
    #tiers .tier-row { display: flex; align-items: center; gap: 1rem; margin-bottom: 0.5rem; font-size: 0.85rem; }
    #tiers .tier-label { width: 160px; color: var(--text); }
    #tiers .tier-bar-wrap { flex: 1; background: var(--border); border-radius: 4px; height: 8px; overflow: hidden; }
    #tiers .tier-bar { height: 100%; border-radius: 4px; }
    #tiers .tier-pct { width: 50px; text-align: right; color: var(--muted); }
    .local-bar  { background: var(--green); }
    .cloud-bar  { background: var(--yellow); }
    footer { padding: 1rem 2rem; border-top: 1px solid var(--border); color: var(--muted); font-size: 0.75rem; text-align: center; }
  </style>
</head>
<body>
  <header>
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="13" stroke="#58a6ff" stroke-width="2"/><path d="M8 14 Q14 6 20 14 Q14 22 8 14Z" fill="#3fb950"/></svg>
    <h1>LokaRoute™ Savings Dashboard</h1>
    <span id="last-updated">Loading…</span>
  </header>

  <div class="grid" id="cards">
    <div class="card"><div class="label">Queries this month</div><div class="value blue" id="total-queries">—</div></div>
    <div class="card"><div class="label">Local deflection</div><div class="value green" id="local-pct">—</div></div>
    <div class="card"><div class="label">Actual cloud spend</div><div class="value yellow" id="actual-spend">—</div><div class="sub" id="sub-cost"></div></div>
    <div class="card"><div class="label">Saved vs subscription</div><div class="value green" id="net-saved">—</div></div>
  </div>

  <div class="section">
    <h2>30-day query volume</h2>
    <svg id="chart"></svg>
  </div>

  <div class="section">
    <h2>Tier distribution (30 days)</h2>
    <div id="tiers"></div>
  </div>

  <footer>LokaRoute™ — lokaflow.io &nbsp;|&nbsp; Data from ~/.lokaflow/route.db &nbsp;|&nbsp; <a href="/api/summary" style="color:var(--blue)">JSON API</a></footer>

  <script>
    const $ = id => document.getElementById(id);

    async function load() {
      const [summary, daily, tiers] = await Promise.all([
        fetch('/api/summary').then(r => r.json()),
        fetch('/api/daily').then(r => r.json()),
        fetch('/api/tiers').then(r => r.json()),
      ]);

      // Cards
      const total = summary.totalQueries ?? 0;
      const local = summary.localQueries ?? 0;
      const cloud = summary.cloudQueries ?? 0;
      const actual = summary.actualCostUsd ?? 0;
      const alt    = summary.alternativeCostUsd ?? 0;
      const saved  = summary.totalSavedUsd ?? 0;

      $('total-queries').textContent = total.toLocaleString();
      $('local-pct').textContent     = total > 0 ? ((local / total) * 100).toFixed(1) + '%' : '0%';
      $('actual-spend').textContent  = '$' + actual.toFixed(4);
      $('sub-cost').textContent      = 'vs $20.00 subscription';
      $('net-saved').textContent     = '$' + (20 - actual).toFixed(2);
      $('last-updated').textContent  = 'Updated ' + new Date().toLocaleTimeString();

      // Sparkline
      const days = (daily.daily ?? []);
      if (days.length > 1) {
        const max = Math.max(...days.map(d => d.queries), 1);
        const w = 800, h = 120, pad = 4;
        const pts = days.map((d, i) => {
          const x = pad + (i / (days.length - 1)) * (w - pad * 2);
          const y = h - pad - (d.queries / max) * (h - pad * 2);
          return x + ',' + y;
        }).join(' ');
        $('chart').setAttribute('viewBox', '0 0 ' + w + ' ' + h);
        $('chart').innerHTML =
          '<polyline points="' + pts + '" fill="none" stroke="#58a6ff" stroke-width="2.5" stroke-linejoin="round"/>';
      }

      // Tier bars
      const tc = tiers.tiers ?? [];
      $('tiers').innerHTML = tc.map(t => {
        const isLocal = t.tier.startsWith('local');
        const pct = Math.max(t.percent ?? 0, 0);
        return \`<div class="tier-row">
          <div class="tier-label">\${t.tier}</div>
          <div class="tier-bar-wrap"><div class="tier-bar \${isLocal ? 'local-bar' : 'cloud-bar'}" style="width:\${pct.toFixed(1)}%"></div></div>
          <div class="tier-pct">\${pct.toFixed(1)}%</div>
        </div>\`;
      }).join('');
    }

    load();
    setInterval(load, 30_000); // auto-refresh every 30s
  </script>
</body>
</html>`;
  }
}
