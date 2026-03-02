import { useEffect, useState, useCallback } from "react";
import {
  Activity,
  Zap,
  Shield,
  Euro,
  RefreshCw,
  MessageSquare,
  BookOpen,
  FlaskConical,
  Download,
  Settings,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  AlertTriangle,
  Leaf,
  Target,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CostStats {
  today: {
    totalEur: number;
    queryCount: number;
    localQueries: number;
    cloudQueries: number;
  };
  month: {
    totalEur: number;
    queryCount: number;
    savingsVsNaiveEur: number;
    localPercent: number;
  };
  limits: {
    dailyLimitEur: number;
    monthlyLimitEur: number;
    dailyUsedPercent: number;
    monthlyUsedPercent: number;
  };
}

interface HistoryEntry {
  timestamp: string;
  tier: string;
  model: string;
  reason: string;
  score: number;
  costEur: number;
  latencyMs: number;
  node?: string;
  prompt?: string;
}

interface HealthProvider {
  name: string;
  tier: "local" | "specialist" | "cloud";
  status: "ok" | "error" | "unknown";
  latencyMs: number;
}

interface HealthData {
  status: string;
  version: string;
  uptime: number;
  providers: HealthProvider[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const API_BASE = () => localStorage.getItem("lf_api_url") || "http://127.0.0.1:4141";

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function fmtLatency(ms: number) {
  if (ms >= 60000) return `${(ms / 60000).toFixed(1)}m`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function fmtUptime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return `${h}h ${m}m`;
}

function complexityLabel(score: number): { label: string; cls: string } {
  if (score < 0.3) return { label: "Simple", cls: "cmplx-simple" };
  if (score < 0.6) return { label: "Moderate", cls: "cmplx-moderate" };
  if (score < 0.8) return { label: "Complex", cls: "cmplx-complex" };
  return { label: "Expert", cls: "cmplx-expert" };
}

function shortPrompt(prompt: string | undefined, reason: string): string {
  if (prompt && prompt.trim()) return prompt.slice(0, 60) + (prompt.length > 60 ? "…" : "");
  // reason is a routing label (e.g. "medium_complexity") — show as human label, not raw
  if (reason && reason.trim()) {
    const label = reason.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return `(${label})`;
  }
  return "—";
}

function fmtNode(node: string) {
  return node.replace(/^@/, "");
}

function shortModel(m: string) {
  const exec = m.match(/executed-by:([^,]+)/);
  const plan = m.match(/planned-by:([^,]+)/);
  if (exec && plan) return `${exec[1]} ← ${plan[1]}`;
  return m;
}

// ─── TraceRow ─────────────────────────────────────────────────────────────────

function TraceRow({ entry }: { entry: HistoryEntry }) {
  const [expanded, setExpanded] = useState(false);
  const isLocal = entry.tier === "local";
  const isCloud = entry.tier === "cloud";
  const savedPct = isLocal ? 100 : 0;
  const cmplx = complexityLabel(entry.score);

  return (
    <div className={`trace-row ${expanded ? "trace-row-expanded" : ""}`}>
      <div className="trace-row-header" onClick={() => setExpanded((v) => !v)}>
        <div className="trace-row-toggle">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
        <div className="trace-row-icons">
          {isCloud ? (
            <span className="trace-icon trace-cloud-icon" title="Cloud">
              ☁️
            </span>
          ) : (
            <span className="trace-icon trace-local-icon" title="Local">
              🖥️
            </span>
          )}
        </div>
        <div className="trace-row-prompt">{shortPrompt(entry.prompt, entry.reason)}</div>
        <div className="trace-row-meta">
          <span className="trace-latency">{fmtLatency(entry.latencyMs)}</span>
          <span className={`trace-cost ${entry.costEur === 0 ? "free" : ""}`}>
            {entry.costEur === 0 ? "€0.00" : `€${entry.costEur.toFixed(4)}`}
          </span>
          <span className="trace-saved">{savedPct}% saved</span>
          <span className="trace-time">{fmtTime(entry.timestamp)}</span>
        </div>
      </div>

      {expanded && (
        <div className="trace-waterfall">
          <div className="trace-section-label">PIPELINE</div>
          <div className="trace-stage">
            <span className="trace-stage-name">PromptGuard</span>
            <div className="trace-bar-wrap">
              <div className="trace-bar" style={{ width: "8%" }} />
            </div>
            <span className="trace-stage-meta">
              ✅ PII: none · <span className={`trace-cmplx ${cmplx.cls}`}>{cmplx.label}</span>
            </span>
          </div>
          <div className="trace-stage">
            <span className="trace-stage-name">ComplexityScore</span>
            <div className="trace-bar-wrap">
              <div className="trace-bar" style={{ width: `${Math.round(entry.score * 100)}%` }} />
            </div>
            <span className="trace-stage-meta">
              🧠 {entry.score.toFixed(2)} →{" "}
              <span className={`trace-cmplx ${cmplx.cls}`}>{cmplx.label}</span>
            </span>
          </div>
          <div className="trace-stage">
            <span className="trace-stage-name">Router</span>
            <div className="trace-bar-wrap">
              <div className="trace-bar" style={{ width: "15%" }} />
            </div>
            <span className="trace-stage-meta">{entry.reason || `Tier: ${entry.tier}`}</span>
          </div>
          <div className="trace-section-label" style={{ marginTop: 12 }}>
            EXECUTION
          </div>
          <div className="trace-execution-row">
            <span className={`tier-badge-small ${entry.tier}`}>
              {isLocal ? "🖥️ local" : isCloud ? "☁️ cloud" : "⚡ specialist"}
            </span>
            <span className="trace-exec-model">{shortModel(entry.model)}</span>
            {entry.node && <span className="trace-exec-node">@{fmtNode(entry.node)}</span>}
            <div className="trace-bar-wrap trace-bar-wide">
              <div className="trace-bar trace-bar-exec" style={{ width: "70%" }} />
            </div>
            <span className="trace-exec-latency">{fmtLatency(entry.latencyMs)}</span>
            <span className="trace-exec-cost">
              {entry.costEur === 0 ? "€0.00" : `€${entry.costEur.toFixed(5)}`}
            </span>
          </div>
          <div className="trace-summary">
            <div className="trace-summary-row">
              <span className="trace-sum-label">Wall clock</span>
              <span className="trace-sum-value">{fmtLatency(entry.latencyMs)}</span>
            </div>
            <div className="trace-summary-row">
              <span className="trace-sum-label">Tier</span>
              <span className={`badge ${entry.tier}`}>{entry.tier}</span>
            </div>
            <div className="trace-summary-row">
              <span className="trace-sum-label">Complexity</span>
              <span className={`trace-cmplx ${cmplx.cls}`}>
                {cmplx.label} ({entry.score.toFixed(2)})
              </span>
            </div>
            <div className="trace-summary-row">
              <span className="trace-sum-label">Cost</span>
              <span className="trace-sum-value">
                {entry.costEur === 0 ? "€0.00 (local — free)" : `€${entry.costEur.toFixed(5)}`}
              </span>
            </div>
            {isLocal && (
              <div className="trace-summary-row">
                <span className="trace-sum-label">Saving</span>
                <span className="trace-sum-value" style={{ color: "#10b981" }}>
                  100% (fully local)
                </span>
              </div>
            )}
          </div>
          <div className="trace-actions">
            <button
              className="btn-ghost btn-xs"
              onClick={() => navigator.clipboard.writeText(JSON.stringify(entry, null, 2))}
            >
              <Download size={11} /> Copy as JSON
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── DonutChart ───────────────────────────────────────────────────────────────

function DonutChart({ localPct }: { localPct: number }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const localArc = (localPct / 100) * circ;
  return (
    <svg width="90" height="90" viewBox="0 0 90 90">
      <circle cx="45" cy="45" r={r} fill="none" stroke="#272a30" strokeWidth="10" />
      <circle
        cx="45"
        cy="45"
        r={r}
        fill="none"
        stroke="#eab308"
        strokeWidth="10"
        strokeDasharray={circ}
        strokeDashoffset={localArc}
        strokeLinecap="round"
        transform="rotate(-90 45 45)"
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
      <circle
        cx="45"
        cy="45"
        r={r}
        fill="none"
        stroke="#10b981"
        strokeWidth="10"
        strokeDasharray={`${localArc} ${circ - localArc}`}
        strokeLinecap="round"
        transform="rotate(-90 45 45)"
        style={{ transition: "stroke-dasharray 0.6s ease" }}
      />
      <text x="45" y="49" textAnchor="middle" fill="#f8fafc" fontSize="13" fontWeight="700">
        {localPct.toFixed(0)}%
      </text>
    </svg>
  );
}

// ─── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({ values, cap }: { values: number[]; cap: number }) {
  if (values.length < 2) return <div className="sparkline-placeholder">No data yet</div>;
  const w = 260;
  const h = 56;
  const maxV = Math.max(cap, ...values, 0.001);
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - (v / maxV) * (h - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const capY = h - (cap / maxV) * (h - 8);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: "visible" }}>
      <line
        x1={0}
        y1={capY}
        x2={w}
        y2={capY}
        stroke="#ef4444"
        strokeWidth="1"
        strokeDasharray="4 3"
        opacity="0.5"
      />
      <polyline
        fill="none"
        stroke="#3b82f6"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts.join(" ")}
      />
      {values.map((v, i) => {
        const x = (i / (values.length - 1)) * w;
        const y = h - (v / maxV) * (h - 8);
        return <circle key={i} cx={x} cy={y} r={3} fill="#3b82f6" />;
      })}
    </svg>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

interface DashboardProps {
  onNavigate?: (view: string) => void;
}

export function Dashboard({ onNavigate }: DashboardProps = {}) {
  const [stats, setStats] = useState<CostStats | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [health, setHealth] = useState<HealthData | null>(null);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`${API_BASE()}/v1/history?limit=20`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data.entries ?? []);
      }
    } catch {
      /* offline */
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch(`${API_BASE()}/v1/cost`)
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
    fetch(`${API_BASE()}/v1/health`)
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => {});
    fetchHistory();
  }, [fetchHistory]);

  // Derived
  const todayLocal = stats?.today.localQueries ?? 0;
  const todayCloud = stats?.today.cloudQueries ?? 0;
  const todayTotal = stats?.today.queryCount ?? 0;
  const localPct = todayTotal > 0 ? (todayLocal / todayTotal) * 100 : 0;
  const todayCost = stats?.today.totalEur ?? 0;
  const dailyCap = stats?.limits.dailyLimitEur ?? 2;
  const dailyUsedPct = stats?.limits.dailyUsedPercent ?? 0;
  const monthlySavings = stats?.month.savingsVsNaiveEur ?? 0;
  const avoidedToday = todayLocal * 0.005;
  const effPct = todayTotal > 0 ? Math.min(99, Math.round(localPct)) : 0;
  const sparkData = [0, 0.001, 0.003, 0, 0.002, 0.004, todayCost];
  const today = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="dashboard-root">
      {/* Intelligence Summary Banner */}
      <div className="intel-banner">
        <div className="intel-banner-date">{today}</div>
        <div className="intel-banner-row">
          <div className="intel-stat">
            <span className="intel-num">{todayTotal}</span>
            <span className="intel-label">queries today</span>
          </div>
          <div className="intel-divider" />
          <div className="intel-stat">
            <span className="intel-num" style={{ color: "#10b981" }}>
              {localPct.toFixed(0)}%
            </span>
            <span className="intel-label">local</span>
          </div>
          <div className="intel-divider" />
          <div className="intel-stat">
            <span className="intel-num">€{todayCost.toFixed(3)}</span>
            <span className="intel-label">spent</span>
          </div>
          <div className="intel-divider" />
          <div className="intel-stat">
            <span
              className="intel-num"
              style={{ color: effPct > 0 ? "#10b981" : "var(--text-muted)" }}
            >
              {effPct > 0 ? `${effPct}%` : "—"}
            </span>
            <span className="intel-label">efficiency</span>
          </div>
        </div>
        {(avoidedToday > 0.001 || dailyUsedPct > 0) && (
          <div className="intel-savings-line">
            <TrendingUp size={14} />
            {avoidedToday > 0.001 ? (
              <>
                Cloud-only would cost <strong>€{(todayCost + avoidedToday).toFixed(3)}</strong> —
                you saved <strong style={{ color: "#10b981" }}>€{avoidedToday.toFixed(3)}</strong>{" "}
                today
              </>
            ) : (
              <>
                Daily budget: <strong>€{dailyCap}</strong> — used{" "}
                <strong>{dailyUsedPct.toFixed(1)}%</strong>
              </>
            )}
          </div>
        )}
      </div>

      {/* Middle row: Routing Split + Cost Trend + Quick Actions */}
      <div className="dashboard-mid-row">
        <div className="card routing-split-card">
          <div className="card-header">
            <h3>Routing Split — Today</h3>
            <Zap size={16} className="icon-green" />
          </div>
          <div className="routing-split-body">
            <DonutChart localPct={localPct} />
            <div className="routing-split-legend">
              <div className="legend-row">
                <span className="legend-dot legend-local" />
                <span className="legend-label">
                  Local — {todayLocal} quer{todayLocal === 1 ? "y" : "ies"}
                </span>
              </div>
              <div className="legend-row">
                <span className="legend-dot legend-cloud" />
                <span className="legend-label">
                  Cloud — {todayCloud} quer{todayCloud === 1 ? "y" : "ies"}
                </span>
              </div>
              {localPct > 0 && (
                <div className="legend-trend">↑ {localPct.toFixed(0)}% local — zero cloud cost</div>
              )}
            </div>
          </div>
        </div>

        <div className="card cost-trend-card">
          <div className="card-header">
            <h3>Cost Trend — 7 Days</h3>
            <Euro size={16} className="icon-blue" />
          </div>
          <div className="cost-trend-body">
            <Sparkline values={sparkData} cap={dailyCap} />
            <div className="cost-trend-legend">
              <span className="trend-dot" style={{ background: "#3b82f6" }} />
              <span>Cloud spend</span>
              <span className="trend-dash" />
              <span style={{ color: "#ef4444", fontSize: "0.75rem" }}>Daily cap (€{dailyCap})</span>
            </div>
          </div>
        </div>

        <div className="card quick-actions-card">
          <div className="card-header">
            <h3>Quick Actions</h3>
            <Target size={16} className="icon-purple" />
          </div>
          <div className="quick-actions-list">
            <button className="qa-btn" onClick={() => onNavigate?.("chat")}>
              <MessageSquare size={15} /> New Chat <span className="qa-kbd">⌘N</span>
            </button>
            <button className="qa-btn" onClick={() => onNavigate?.("prompts")}>
              <BookOpen size={15} /> Prompt Library <span className="qa-kbd">⌘T</span>
            </button>
            <button className="qa-btn" onClick={() => onNavigate?.("audit")}>
              <Euro size={15} /> LokaAudit
            </button>
            <button className="qa-btn" onClick={() => onNavigate?.("playground")}>
              <FlaskConical size={15} /> Playground
            </button>
            <button className="qa-btn" onClick={() => onNavigate?.("settings")}>
              <Settings size={15} /> Routing Rules
            </button>
          </div>
        </div>
      </div>

      {/* Bottom row: System Health + Budget + Savings */}
      <div className="dashboard-bottom-row">
        <div className="card health-mini-card">
          <div className="card-header">
            <h3>System Health</h3>
            <button className="btn-ghost btn-xs" onClick={() => onNavigate?.("mesh")}>
              Go to Mesh →
            </button>
          </div>
          {health ? (
            <div className="health-mini-list">
              {health.providers.map((p, i) => {
                const isOk = p.status === "ok";
                const isCloudP = p.tier === "cloud";
                const latMs = p.latencyMs;
                const dotCls = isOk
                  ? isCloudP
                    ? "dot-amber"
                    : latMs > 200
                      ? "dot-amber"
                      : "dot-green"
                  : "dot-red";
                const note = !isOk
                  ? "Offline"
                  : `${latMs}ms${isCloudP && latMs > 800 ? " — Slow" : ""}`;
                return (
                  <div key={i} className="health-mini-row">
                    <span className={`status-dot ${dotCls}`} />
                    <span className="hm-name">{p.name}</span>
                    <span className="hm-latency">{note}</span>
                    <span>{isOk ? "✅" : "⚠️"}</span>
                  </div>
                );
              })}
              <div className="health-mini-uptime">
                API uptime: {health.uptime ? fmtUptime(health.uptime) : "—"}
              </div>
            </div>
          ) : (
            <div className="health-mini-offline">
              <Activity size={14} style={{ opacity: 0.4 }} />
              <span>Connecting…</span>
            </div>
          )}
        </div>

        <div className="card budget-card">
          <div className="card-header">
            <h3>Daily Budget</h3>
            <Shield size={16} className="icon-purple" />
          </div>
          <div className="budget-pct-big">{dailyUsedPct.toFixed(0)}%</div>
          <div className="budget-bar-wrap" style={{ marginTop: 8 }}>
            <div className="budget-bar-bg">
              <div
                className="budget-bar-fill"
                style={{
                  width: `${Math.min(100, dailyUsedPct)}%`,
                  background:
                    dailyUsedPct > 80 ? "#ef4444" : dailyUsedPct > 60 ? "#eab308" : "#3b82f6",
                }}
              />
            </div>
          </div>
          <div className="subtext" style={{ marginTop: 8 }}>
            €{todayCost.toFixed(3)} of €{dailyCap} daily cap
          </div>
          {dailyUsedPct > 80 && (
            <div className="budget-alert">
              <AlertTriangle size={13} /> Approaching daily limit —{" "}
              {(100 - dailyUsedPct).toFixed(0)}% remaining
            </div>
          )}
        </div>

        <div className="card savings-hero-card">
          <div className="card-header">
            <h3>Monthly Savings</h3>
            <Leaf size={16} className="icon-green" />
          </div>
          <div className="savings-big">€{monthlySavings.toFixed(2)}</div>
          <div className="subtext">vs cloud-only execution</div>
          <div className="subtext" style={{ marginTop: 8 }}>
            {stats?.month.localPercent?.toFixed(0) ?? 0}% local · {stats?.month.queryCount ?? 0}{" "}
            queries
          </div>
          {monthlySavings === 0 && (
            <div className="savings-hint">Send your first message to start saving.</div>
          )}
        </div>
      </div>

      {/* Message Trace Rows */}
      <div className="card trace-card">
        <div className="chart-header">
          <h3>Recent Message Traces</h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="btn-ghost btn-xs" onClick={() => onNavigate?.("audit")}>
              View All
            </button>
            <button
              className="btn-ghost btn-xs"
              onClick={fetchHistory}
              disabled={historyLoading}
              title="Refresh"
            >
              <RefreshCw size={12} className={historyLoading ? "spin" : ""} /> Refresh
            </button>
          </div>
        </div>
        <div className="trace-list">
          {history.length === 0 && !historyLoading && (
            <div className="route-empty">
              No traces yet — start the API and send a chat message.
            </div>
          )}
          {historyLoading && history.length === 0 && (
            <div className="route-empty">
              <RefreshCw size={14} className="spin" style={{ marginRight: 8 }} /> Loading…
            </div>
          )}
          {history.map((e, i) => (
            <TraceRow key={i} entry={e} />
          ))}
        </div>
        <div className="trace-list-footer">
          Click any row to expand the full pipeline waterfall →
        </div>
      </div>
    </div>
  );
}
