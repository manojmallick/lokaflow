/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { useEffect, useState, useCallback } from "react";
import { ChevronDown, ChevronRight, Cloud, Cpu, RefreshCw, Wifi, WifiOff, Zap } from "lucide-react";

interface Provider {
  name: string;
  tier: "local" | "specialist" | "cloud";
  status: "ok" | "error" | "unknown";
  latencyMs: number;
  models?: string[];
  // Optional extended fields the API may provide
  cpuPct?: number;
  ramPct?: number;
  batteryPct?: number;
  routingLoad?: number;
}

interface HealthData {
  status: string;
  version: string;
  uptime: number;
  providers: Provider[];
}

/** Format seconds → "4d 23h" or "12h 05m" or "45s" */
function fmtUptime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${String(mins).padStart(2, "0")}m`;
  return `${mins}m`;
}

function TierIcon({ tier }: { tier: Provider["tier"] }) {
  if (tier === "cloud") return <Cloud size={14} />;
  if (tier === "specialist") return <Zap size={14} />;
  return <Cpu size={14} />;
}

function StatusDot({ status }: { status: Provider["status"] }) {
  const cls = status === "ok" ? "dot-green" : status === "error" ? "dot-red" : "dot-amber";
  return <span className={`status-dot ${cls}`} title={status} />;
}

/** Latency bar — color is tier-aware, not just speed-based */
function LatencyBar({
  ms,
  tier,
  status,
}: {
  ms: number;
  tier: Provider["tier"];
  status: Provider["status"];
}) {
  const max = tier === "local" ? 300 : 800;
  const pct = Math.min(100, (ms / max) * 100);

  // Color logic:
  // - offline/broken → red always
  // - local + fast (< 100ms) → green
  // - local + slow (> 100ms) → amber
  // - cloud reachable → amber (shows it's routable but not free)
  // - cloud unreachable → red
  let color = "#4ade80";
  if (status !== "ok") {
    color = "#f87171";
  } else if (tier === "cloud") {
    color = "#fbbf24";
  } else if (ms > 100) {
    color = "#fbbf24";
  }

  return (
    <div className="latency-bar-wrap" title={`${ms}ms`}>
      <div className="latency-bar-bg">
        <div className="latency-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="latency-value" style={{ color }}>
        {ms}ms
      </span>
    </div>
  );
}

function MiniBar({ pct, color = "var(--accent)" }: { pct: number; color?: string }) {
  return (
    <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,.08)", borderRadius: 99 }}>
      <div
        style={{
          width: `${Math.min(100, pct)}%`,
          height: "100%",
          background: color,
          borderRadius: 99,
        }}
      />
    </div>
  );
}

const API_BASE = () => {
  const raw = localStorage.getItem("lf_api_url") || "http://127.0.0.1:4141";
  return raw.trim().replace(/\/+$/, "");
};

export function MeshCluster() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedNode, setExpandedNode] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`${API_BASE()}/v1/health`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setHealth(data);
      setError(null);
      setLastRefresh(new Date());
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setError(`Cannot reach LokaFlow API at ${API_BASE()}/v1/health — ${detail}`);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const timer = setInterval(fetchHealth, 10000);
    return () => clearInterval(timer);
  }, [fetchHealth]);

  const localProviders = health?.providers.filter((p) => p.tier === "local") ?? [];
  const specialistProviders = health?.providers.filter((p) => p.tier === "specialist") ?? [];
  const cloudProviders = health?.providers.filter((p) => p.tier === "cloud") ?? [];
  const onlineCount = health?.providers.filter((p) => p.status === "ok").length ?? 0;
  const avgLatency =
    health && health.providers.length > 0
      ? Math.round(
          health.providers
            .filter((p) => p.status === "ok" && p.latencyMs > 0)
            .reduce((a, p) => a + p.latencyMs, 0) /
            Math.max(
              1,
              health.providers.filter((p) => p.status === "ok" && p.latencyMs > 0).length,
            ),
        )
      : null;

  function renderProviderCard(p: Provider, _i: number) {
    const providerId = `${p.tier}:${p.name}`;
    const isExpanded = expandedNode === providerId;
    const modelState = p.latencyMs > 0 && p.status === "ok" ? "warm" : "cold";

    return (
      <div key={providerId} className={`provider-card ${p.status}`}>
        <button
          type="button"
          className="provider-card-top"
          aria-expanded={isExpanded}
          aria-label={`${p.name} details`}
          onClick={() => setExpandedNode(isExpanded ? null : providerId)}
        >
          <StatusDot status={p.status} />
          <TierIcon tier={p.tier} />
          <span className="provider-name">{p.name}</span>
          <span
            className={`model-state-badge ${modelState === "warm" ? "model-warm" : "model-cold"}`}
            style={{ marginLeft: "auto", marginRight: 4 }}
          >
            {modelState}
          </span>
          {isExpanded ? (
            <ChevronDown size={13} style={{ color: "var(--text-muted)" }} />
          ) : (
            <ChevronRight size={13} style={{ color: "var(--text-muted)" }} />
          )}
        </button>

        <div className="provider-card-bottom">
          <span className={`provider-status-label ${p.status}`}>
            {p.status === "ok" ? "Online" : p.status === "error" ? "Offline" : "Unknown"}
          </span>
          {p.latencyMs > 0 && <LatencyBar ms={p.latencyMs} tier={p.tier} status={p.status} />}
        </div>

        {p.models && p.models.length > 0 && (
          <div className="provider-models">
            {p.models.map((m) => (
              <span key={m} className="model-chip" title={m}>
                {m}
              </span>
            ))}
          </div>
        )}

        {isExpanded && (
          <div className="node-card-expanded">
            <div className="node-card-expanded-row">
              <span className="nce-lbl">CPU</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
                <MiniBar pct={p.cpuPct ?? 0} color="#60a5fa" />
                <span className="nce-val">{p.cpuPct != null ? `${p.cpuPct}%` : "—"}</span>
              </div>
            </div>
            <div className="node-card-expanded-row">
              <span className="nce-lbl">RAM</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
                <MiniBar pct={p.ramPct ?? 0} color="#a78bfa" />
                <span className="nce-val">{p.ramPct != null ? `${p.ramPct}%` : "—"}</span>
              </div>
            </div>
            <div className="node-card-expanded-row">
              <span className="nce-lbl">Battery</span>
              <span className="nce-val">{p.batteryPct != null ? `${p.batteryPct}%` : "—"}</span>
            </div>
            <div className="node-card-expanded-row">
              <span className="nce-lbl">Routing load</span>
              <span className="nce-val">{p.routingLoad != null ? `${p.routingLoad}%` : "—"}</span>
            </div>
            <div className="node-card-expanded-row">
              <span className="nce-lbl">Model state</span>
              <span
                className={`model-state-badge ${modelState === "warm" ? "model-warm" : "model-cold"}`}
              >
                {modelState === "warm" ? "🟢 Warm" : "🔵 Cold"}
              </span>
            </div>
            <div className="node-card-expanded-row">
              <span className="nce-lbl">Tier</span>
              <span className="nce-val" style={{ textTransform: "capitalize" }}>
                {p.tier}
              </span>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mesh-container">
      <header className="mesh-header">
        <div>
          <h1>Mesh Cluster</h1>
          <p className="subtitle">Live provider health across local and cloud models.</p>
        </div>
        <div className="mesh-header-actions">
          {lastRefresh && (
            <span className="last-refresh">Updated {lastRefresh.toLocaleTimeString()}</span>
          )}
          <button className="btn-ghost" onClick={fetchHealth} disabled={refreshing} title="Refresh">
            <RefreshCw size={15} className={refreshing ? "spin" : ""} />
            Refresh
          </button>
        </div>
      </header>

      {error && (
        <div className="mesh-error">
          <WifiOff size={16} />
          {error}
          <span className="mesh-error-hint">
            Run: <code>npx tsx packages/cli/src/index.ts serve</code>
          </span>
        </div>
      )}

      {health && (
        <>
          {/* Cluster overview */}
          <div className="mesh-cluster-summary">
            <div className="mesh-summary-item">
              <div
                className="mesh-summary-val"
                style={{ color: onlineCount > 0 ? "#4ade80" : "#f87171" }}
              >
                {onlineCount} / {health.providers.length}
              </div>
              <div className="mesh-summary-lbl">Online</div>
            </div>
            <div className="mesh-summary-item">
              <div className="mesh-summary-val">{fmtUptime(health.uptime)}</div>
              <div className="mesh-summary-lbl">API Uptime</div>
            </div>
            {avgLatency != null && (
              <div className="mesh-summary-item">
                <div
                  className="mesh-summary-val"
                  style={{
                    color: avgLatency < 100 ? "#4ade80" : avgLatency < 300 ? "#fbbf24" : "#f87171",
                  }}
                >
                  {avgLatency}ms
                </div>
                <div className="mesh-summary-lbl">Avg Latency</div>
              </div>
            )}
            <div className="mesh-summary-item">
              <div className="mesh-summary-val">
                {localProviders.filter((p) => p.status === "ok").length}
              </div>
              <div className="mesh-summary-lbl">Local Nodes</div>
            </div>
            <div className="mesh-summary-item">
              <div className="mesh-summary-val">
                {cloudProviders.filter((p) => p.status === "ok").length}
              </div>
              <div className="mesh-summary-lbl">Cloud Nodes</div>
            </div>
            <div className="mesh-summary-item">
              <div className="mesh-summary-val">v{health.version}</div>
              <div className="mesh-summary-lbl">Version</div>
            </div>
          </div>

          {/* Provider tiers */}
          {[
            {
              label: "Local Models",
              icon: <Cpu size={15} />,
              providers: localProviders,
              color: "#4ade80",
            },
            {
              label: "Specialist Models",
              icon: <Zap size={15} />,
              providers: specialistProviders,
              color: "#a78bfa",
            },
            {
              label: "Cloud Models",
              icon: <Cloud size={15} />,
              providers: cloudProviders,
              color: "#fbbf24",
            },
          ].map(
            (group) =>
              group.providers.length > 0 && (
                <div key={group.label} className="provider-group">
                  <div className="provider-group-header" style={{ color: group.color }}>
                    {group.icon}
                    <span>{group.label}</span>
                    <span className="provider-count">{group.providers.length}</span>
                    <span style={{ marginLeft: 6, fontSize: 11, color: "var(--text-muted)" }}>
                      {group.providers.filter((p) => p.status === "ok").length} online
                    </span>
                  </div>
                  <div className="provider-grid">
                    {group.providers.map((p, i) => renderProviderCard(p, i))}
                  </div>
                </div>
              ),
          )}
        </>
      )}

      {!health && !error && (
        <div className="mesh-loading">
          <Wifi size={20} className="spin" />
          <span>Connecting to LokaFlow API…</span>
        </div>
      )}
    </div>
  );
}
