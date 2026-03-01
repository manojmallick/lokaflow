import { useEffect, useState } from 'react';
import { Activity, Zap, Shield, Euro } from 'lucide-react';

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

export function Dashboard() {
    const [stats, setStats] = useState<CostStats | null>(null);

    useEffect(() => {
        fetch('http://localhost:4141/v1/cost')
            .then(res => res.json())
            .then(data => setStats(data))
            .catch(err => console.error("Could not fetch cost stats", err));
    }, []);

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
                <h3>Recent Routing Decisions (Mock Data)</h3>
                <div className="routing-table">
                    <div className="route-row header">
                        <div>Time</div>
                        <div>Query Snippet</div>
                        <div>Complexity</div>
                        <div>Tier</div>
                        <div>Action</div>
                    </div>
                    <div className="route-row">
                        <div>10:45 AM</div>
                        <div>"What is the capital..."</div>
                        <div><span className="badge local">0.12</span></div>
                        <div>Local</div>
                        <div>mistral:7b</div>
                    </div>
                    <div className="route-row">
                        <div>10:40 AM</div>
                        <div>"Analyze this 400..."</div>
                        <div><span className="badge cloud">0.86</span></div>
                        <div>Cloud</div>
                        <div>gpt-4o</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
