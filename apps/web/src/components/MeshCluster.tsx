import { useEffect, useState, useCallback } from "react";
import { Cpu, Cloud, Zap, RefreshCw, Wifi, WifiOff, Activity } from "lucide-react";

interface Provider {
  name: string;
  tier: "local" | "specialist" | "cloud";
  status: "ok" | "error" | "unknown";
  latencyMs: number;
  models?: string[];
}

interface HealthData {
  status: string;
  version: string;
  uptime: number;
  providers: Provider[];
}

function TierIcon({ tier }: { tier: string }) {
  if (tier === "cloud") return <Cloud size={14} />;
  if (tier === "specialist") return <Zap size={14} />;
  return <Cpu size={14} />;
}

function StatusDot({ status }: { status: string }) {
  return <span className={`status-dot ${status}`} title={status} />;
}

function LatencyBar({ ms }: { ms: number }) {
  const max = 500;
  const pct = Math.min(100, (ms / max) * 100);
  const color = ms < 50 ? "#10b981" : ms < 200 ? "#eab308" : "#ef4444";
  return (
    <div className="latency-bar-wrap" title={`${ms}ms`}>
      <div className="latency-bar-bg">
        <div className="latency-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="latency-value">{ms}ms</span>
    </div>
  );
}

const API_BASE = () => localStorage.getItem("lf_api_url") || "http://127.0.0.1:4141";

export function MeshCluster() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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
      setError(`Cannot reach LokaFlow API at ${API_BASE()}/v1/health`);
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
          {/* Summary row */}
          <div className="mesh-summary-row">
            <div className="mesh-summary-card">
              <Wifi size={16} className="icon-green" />
              <div>
                <div className="mesh-stat">
                  {onlineCount} / {health.providers.length}
                </div>
                <div className="mesh-stat-label">Providers online</div>
              </div>
            </div>
            <div className="mesh-summary-card">
              <Activity size={16} className="icon-blue" />
              <div>
                <div className="mesh-stat">{Math.floor(health.uptime)}s</div>
                <div className="mesh-stat-label">API uptime</div>
              </div>
            </div>
            <div className="mesh-summary-card">
              <Cpu size={16} className="icon-purple" />
              <div>
                <div className="mesh-stat">v{health.version}</div>
                <div className="mesh-stat-label">LokaFlow version</div>
              </div>
            </div>
          </div>

          {/* Provider tiers */}
          {[
            {
              label: "Local Models",
              icon: <Cpu size={15} />,
              providers: localProviders,
              color: "#10b981",
            },
            {
              label: "Specialist Models",
              icon: <Zap size={15} />,
              providers: specialistProviders,
              color: "#8b5cf6",
            },
            {
              label: "Cloud Models",
              icon: <Cloud size={15} />,
              providers: cloudProviders,
              color: "#3b82f6",
            },
          ].map(
            (group) =>
              group.providers.length > 0 && (
                <div key={group.label} className="provider-group">
                  <div className="provider-group-header" style={{ color: group.color }}>
                    {group.icon}
                    <span>{group.label}</span>
                    <span className="provider-count">{group.providers.length}</span>
                  </div>
                  <div className="provider-grid">
                    {group.providers.map((p, i) => (
                      <div key={i} className={`provider-card ${p.status}`}>
                        <div className="provider-card-top">
                          <StatusDot status={p.status} />
                          <TierIcon tier={p.tier} />
                          <span className="provider-name">{p.name}</span>
                        </div>
                        <div className="provider-card-bottom">
                          <span className={`provider-status-label ${p.status}`}>
                            {p.status === "ok" ? "Online" : "Offline"}
                          </span>
                          {p.latencyMs > 0 && <LatencyBar ms={p.latencyMs} />}
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
                      </div>
                    ))}
                  </div>
                </div>
              ),
          )}
        </>
      )}

      {!health && !error && (
        <div className="mesh-loading">
          <RefreshCw size={20} className="spin" />
          <span>Connecting to LokaFlow API…</span>
        </div>
      )}
    </div>
  );
}
