// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaFlow™ — lokaflow.io
//
// packages/vscode/src/extension.ts
// VS Code extension entry point.
// Adds:
//   • Status bar item showing current routing tier + estimated cost
//   • Routing history sidebar (TreeDataProvider)
//   • lokaflow.chat / lokaflow.explainCode commands (existing, enhanced)
//   • lokaflow.showHistory, lokaflow.refreshHistory commands

import * as vscode from "vscode";
import * as http   from "http";

// ── Proxy constants ───────────────────────────────────────────────────────────

const PROXY_PORT     = 4041;
const DASHBOARD_PORT = 4040;

// ── Routing tier → display helpers ───────────────────────────────────────────

interface RoutingMeta {
  tier:  string;
  model: string;
  score: number;
  latencyMs: number;
}

function tierIcon(tier: string): string {
  if (tier.startsWith("local")) return "$(circuit-board)";
  return "$(cloud)";
}

function tierLabel(tier: string): string {
  const map: Record<string, string> = {
    "local-trivial": "LOCAL·trivial",
    "local-capable": "LOCAL·capable",
    "cloud-mid":      "CLOUD·mid",
    "cloud-capable":  "CLOUD·capable",
    "cloud-frontier": "CLOUD·frontier",
  };
  return map[tier] ?? tier.toUpperCase();
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

interface ApiResponse {
  content: string;
  meta:    RoutingMeta;
}

async function callLokaFlowApi(prompt: string): Promise<ApiResponse> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model:    "lokaroute-auto",
      messages: [{ role: "user", content: prompt }],
      stream:   false,
    });

    const req = http.request(
      {
        hostname: "localhost",
        port:     PROXY_PORT,
        path:     "/v1/chat/completions",
        method:   "POST",
        headers: {
          "Content-Type":   "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`API Error ${res.statusCode}: ${data}`));
            return;
          }
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.message?.content ?? "";
            const meta: RoutingMeta = {
              tier:      res.headers["x-lokaroute-tier"]     as string ?? "unknown",
              model:     res.headers["x-lokaroute-model"]    as string ?? "unknown",
              score:    parseFloat(res.headers["x-lokaroute-score"]   as string ?? "0"),
              latencyMs: parseInt(res.headers["x-lokaroute-latency-ms"] as string ?? "0", 10),
            };
            resolve({ content, meta });
          } catch (e) {
            reject(e);
          }
        });
      },
    );

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function fetchRoutingHistory(): Promise<HistoryEntry[]> {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: "localhost", port: DASHBOARD_PORT, path: "/api/daily", method: "GET" },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            const daily = (json.daily ?? []) as Array<{
              date: string; queries: number; localQueries: number; cloudQueries: number;
            }>;
            resolve(daily.slice(-7).reverse().map(d => ({
              date:         d.date,
              total:        d.queries,
              local:        d.localQueries,
              cloud:        d.cloudQueries,
            })));
          } catch { resolve([]); }
        });
      },
    );
    req.on("error", () => resolve([]));
    req.end();
  });
}

// ── Routing History TreeDataProvider ─────────────────────────────────────────

interface HistoryEntry {
  date:  string;
  total: number;
  local: number;
  cloud: number;
}

class RoutingHistoryItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly tooltip: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly iconPath: vscode.ThemeIcon,
  ) {
    super(label, collapsibleState);
    this.tooltip = tooltip;
  }
}

class RoutingHistoryProvider implements vscode.TreeDataProvider<RoutingHistoryItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<RoutingHistoryItem | undefined | null | void>();
  readonly onDidChangeTreeData  = this._onDidChangeTreeData.event;

  private entries: HistoryEntry[] = [];

  async refresh(): Promise<void> {
    this.entries = await fetchRoutingHistory();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: RoutingHistoryItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: RoutingHistoryItem): Promise<RoutingHistoryItem[]> {
    if (element) {
      // Child rows: local / cloud breakdown
      const entry = this.entries.find(e => e.date === (element as any)._date);
      if (!entry) return [];
      return [
        new RoutingHistoryItem(
          `$(circuit-board) Local:  ${entry.local}`,
          `${entry.local} queries routed locally`,
          vscode.TreeItemCollapsibleState.None,
          new vscode.ThemeIcon("circuit-board"),
        ),
        new RoutingHistoryItem(
          `$(cloud)         Cloud:  ${entry.cloud}`,
          `${entry.cloud} queries routed to cloud`,
          vscode.TreeItemCollapsibleState.None,
          new vscode.ThemeIcon("cloud"),
        ),
      ];
    }

    if (this.entries.length === 0) {
      return [
        new RoutingHistoryItem(
          "No history yet — start the proxy",
          "Run: lokaflow route start",
          vscode.TreeItemCollapsibleState.None,
          new vscode.ThemeIcon("info"),
        ),
      ];
    }

    return this.entries.map((e) => {
      const item = new RoutingHistoryItem(
        `${e.date}  ·  ${e.total} queries`,
        `${e.total} total  |  ${e.local} local  |  ${e.cloud} cloud`,
        vscode.TreeItemCollapsibleState.Collapsed,
        new vscode.ThemeIcon(e.local > e.cloud ? "circuit-board" : "cloud"),
      );
      (item as any)._date = e.date;
      return item;
    });
  }
}

// ── Extension lifecycle ───────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
  console.log("LokaFlow extension is now active!");

  // ── Status bar item ─────────────────────────────────────────────────────────
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = "lokaflow.showHistory";
  statusBar.text    = "$(circuit-board) LokaRoute";
  statusBar.tooltip = "LokaFlow™ routing active — click for history";
  statusBar.show();
  context.subscriptions.push(statusBar);

  function updateStatusBar(meta: RoutingMeta): void {
    const icon  = tierIcon(meta.tier);
    const label = tierLabel(meta.tier);
    statusBar.text    = `${icon} ${label}`;
    statusBar.tooltip = `Model: ${meta.model}\nScore: ${meta.score.toFixed(3)}\nLatency: ${meta.latencyMs}ms\nClick for routing history`;
    statusBar.backgroundColor = meta.tier.startsWith("cloud")
      ? new vscode.ThemeColor("statusBarItem.warningBackground")
      : undefined;
  }

  // ── Tree view ───────────────────────────────────────────────────────────────
  const historyProvider = new RoutingHistoryProvider();
  const treeView = vscode.window.createTreeView("lokaflow.history", {
    treeDataProvider: historyProvider,
    showCollapseAll:  true,
  });
  context.subscriptions.push(treeView);

  // Initial history load
  historyProvider.refresh();

  // ── Commands ─────────────────────────────────────────────────────────────────

  // Command: Chat
  const chatDisposable = vscode.commands.registerCommand("lokaflow.chat", async () => {
    const userInput = await vscode.window.showInputBox({
      prompt:      "Ask LokaFlow",
      placeHolder: "E.g., How do I write a web server in Go?",
    });
    if (!userInput) return;

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "LokaFlow routing…", cancellable: false },
      async () => {
        try {
          const { content, meta } = await callLokaFlowApi(userInput);
          updateStatusBar(meta);
          historyProvider.refresh();

          const doc = await vscode.workspace.openTextDocument({
            content:  `## User\n${userInput}\n\n## LokaFlow [${tierLabel(meta.tier)} · ${meta.model}]\n${content}`,
            language: "markdown",
          });
          await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
        } catch (err: any) {
          vscode.window.showErrorMessage(
            `LokaFlow connection failed: ${err.message}. Is 'lokaflow route start' running?`,
          );
        }
      },
    );
  });

  // Command: Explain Code
  const explainDisposable = vscode.commands.registerCommand("lokaflow.explainCode", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { vscode.window.showInformationMessage("No active editor."); return; }

    const text = editor.document.getText(editor.selection);
    if (!text) { vscode.window.showInformationMessage("Please select some code to explain."); return; }

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "LokaFlow (routing…)", cancellable: false },
      async () => {
        try {
          const prompt = `Please explain the following code snippet concisely:\n\n\`\`\`\n${text}\n\`\`\``;
          const { content, meta } = await callLokaFlowApi(prompt);
          updateStatusBar(meta);
          historyProvider.refresh();

          const doc = await vscode.workspace.openTextDocument({
            content:  `## Code Explanation [${tierLabel(meta.tier)} · ${meta.model}]\n\n${content}`,
            language: "markdown",
          });
          await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
        } catch (err: any) {
          vscode.window.showErrorMessage(`LokaFlow error: ${err.message}`);
        }
      },
    );
  });

  // Command: Show History (opens sidebar)
  const showHistoryDisposable = vscode.commands.registerCommand("lokaflow.showHistory", async () => {
    await vscode.commands.executeCommand("lokaflow.history.focus");
    historyProvider.refresh();
  });

  // Command: Refresh History
  const refreshHistoryDisposable = vscode.commands.registerCommand("lokaflow.refreshHistory", () => {
    historyProvider.refresh();
  });

  // Command: Open Dashboard
  const openDashboardDisposable = vscode.commands.registerCommand("lokaflow.openDashboard", () => {
    vscode.env.openExternal(vscode.Uri.parse(`http://localhost:${DASHBOARD_PORT}`));
  });

  context.subscriptions.push(
    chatDisposable,
    explainDisposable,
    showHistoryDisposable,
    refreshHistoryDisposable,
    openDashboardDisposable,
  );
}

export function deactivate(): void {}

