import { useEffect, useState, useCallback } from 'react';
import { Activity, Zap, Shield, Euro, RefreshCw } from 'lucide-react';

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
    node?: string;   // provider node, e.g. @192.168.2.65 or gemini
}

const API_BASE = () => localStorage.getItem('lf_api_url') || 'http://127.0.0.1:4141';

function TierBadge({ tier }: { tier: string }) {
    return <span className={`badge ${tier}`}>{tier}</span>;
}

function fmtTime(iso: string) {
    try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    catch { return iso; }
}

function fmtLatency(ms: number) {
    if (ms >= 60000) return `${(ms / 60000).toFixed(1)}m`;
    if (ms >= 1000)  return `${(ms / 1000).toFixed(1)}s`;
    return `${ms}ms`;
}

function fmtNode(node: string) {
    // Show IP part cleanly: "@192.168.2.65" → "192.168.2.65"
    // "@localhost" → "localhost", "gemini" → "gemini"
    return node.replace(/^@/, '');
}

function shortModel(m: string) {
    // planned-by:X,executed-by:Y → show as "Y (delegated)"
    const exec = m.match(/executed-by:([^,]+)/);
    const plan = m.match(/planned-by:([^,]+)/);
    if (exec && plan) return `${exec[1]} ← ${plan[1]}`;
    return m;
}

export function Dashboard() {
    const [stats, setStats] = useState<CostStats | null>(null);
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    const fetchHistory = useCallback(async () => {
        setHistoryLoading(true);
        try {
            const res = await fetch(`${API_BASE()}/v1/history?limit=15`);
            if (res.ok) {
                const data = await res.json();
                setHistory(data.entries ?? []);
            }
        } catch { /* API offline */ }
        finally { setHistoryLoading(false); }
    }, []);

    useEffect(() => {
        fetch(`${API_BASE()}/v1/cost`)
            .then(res => res.json())
            .then(data => setStats(data))
            .catch(err => console.error('Could not fetch cost stats', err));
        fetchHistory();
    }, [fetchHistory]);

    return (
        <div className="dashboard">
            <header>
                <h1>Routing & Analytics</h1>
                <p className="subtitle">Real-time decisions from the LokaFlow pipeline.</p>
            </header>

            <div className="cards">
                <div className="card highlight">
                    <div className="card-header">
                        <h3>Monthly Savings</h3>
                        <Euro size={18} className="icon-green" />
                    </div>
                    <p className="metric">€{stats?.month.savingsVsNaiveEur?.toFixed(2) || '0.00'}</p>
                    <div className="subtext">vs naive cloud execution</div>
                </div>

                <div className="card">
                    <div className="card-header">
                        <h3>Queries (Today)</h3>
                        <Activity size={18} className="icon-blue" />
                    </div>
                    <p className="metric">{stats?.today.queryCount || 0}</p>
                    <div className="subtext">{stats?.today.localQueries || 0} local | {stats?.today.cloudQueries || 0} cloud</div>
                </div>

                <div className="card">
                    <div className="card-header">
                        <h3>Cost (Today)</h3>
                        <Zap size={18} className="icon-yellow" />
                    </div>
                    <p className="metric">€{stats?.today.totalEur?.toFixed(3) || '0.000'}</p>
                    <div className="subtext">Monthly total: €{stats?.month.totalEur?.toFixed(2) || '0.00'}</div>
                </div>

                <div className="card">
                    <div className="card-header">
                        <h3>Daily Budget</h3>
                        <Shield size={18} className="icon-purple" />
                    </div>
                    <p className="metric">
                        {stats?.limits.dailyUsedPercent || 0}%
                    </p>
                    <div className="subtext">Daily cap: €{stats?.limits.dailyLimitEur || 2.0}</div>
                </div>
            </div>

            <div className="chart-container">
                <div className="chart-header">
                    <h3>Recent Routing Decisions</h3>
                    <button className="btn-ghost" onClick={fetchHistory} disabled={historyLoading} title="Refresh">
                        <RefreshCw size={13} className={historyLoading ? 'spin' : ''} />
                        Refresh
                    </button>
                </div>
                <div className="routing-table">
                    <div className="route-row header">
                        <div>Time</div>
                        <div>Tier</div>
                        <div>Score</div>
                        <div>Model</div>
                        <div>Node / IP</div>
                        <div>Latency</div>
                        <div>Cost</div>
                    </div>
                    {history.length === 0 && !historyLoading && (
                        <div className="route-empty">No routing history yet — start the API and send a chat message.</div>
                    )}
                    {history.map((e, i) => (
                        <div className="route-row" key={i}>
                            <div className="route-time">{fmtTime(e.timestamp)}</div>
                            <div><TierBadge tier={e.tier} /></div>
                            <div className="route-score">{e.score.toFixed(2)}</div>
                            <div className="route-model" title={e.model}>{shortModel(e.model)}</div>
                            <div className="route-node" title={e.node}>{e.node ? fmtNode(e.node) : '—'}</div>
                            <div className="route-latency">{fmtLatency(e.latencyMs)}</div>
                            <div className="route-cost">{e.costEur > 0 ? `€${e.costEur.toFixed(5)}` : '—'}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
