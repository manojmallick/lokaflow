import { useEffect, useState } from "react";
import { CheckCircle, XCircle, Wifi, DollarSign, Settings2, Info } from "lucide-react";

const MODEL_OPTIONS = [
  { value: "auto", label: "Auto (router decides)" },
  { value: "mistral:7b", label: "Mistral 7B (local)" },
  { value: "llama3.2:8b", label: "Llama 3.2 8B (local)" },
  { value: "llama3.3:70b", label: "Llama 3.3 70B (specialist)" },
  { value: "qwen2.5-coder:7b", label: "Qwen 2.5 Coder 7B (local)" },
  { value: "gpt-4o", label: "GPT-4o (cloud)" },
  { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4 (cloud)" },
  { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash (cloud)" },
];

interface CostData {
  today: { totalEur: number; queryCount: number; localQueries: number; cloudQueries: number };
  month: { totalEur: number; queryCount: number; savingsVsNaiveEur: number; localPercent: number };
  limits: {
    dailyLimitEur: number;
    monthlyLimitEur: number;
    dailyUsedPercent: number;
    monthlyUsedPercent: number;
  };
}

type TestState = "idle" | "testing" | "ok" | "fail";

export function Settings() {
  const [apiUrl, setApiUrl] = useState(
    () => localStorage.getItem("lf_api_url") || "http://127.0.0.1:4141",
  );
  const [model, setModel] = useState(() => localStorage.getItem("lf_model") || "auto");
  const [saved, setSaved] = useState(false);
  const [testState, setTestState] = useState<TestState>("idle");
  const [testMsg, setTestMsg] = useState("");
  const [cost, setCost] = useState<CostData | null>(null);
  const [costError, setCostError] = useState(false);

  useEffect(() => {
    fetch(`${apiUrl}/v1/cost`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        setCost(data);
        setCostError(false);
      })
      .catch(() => setCostError(true));
  }, [apiUrl]);

  function handleSave() {
    const trimmed = apiUrl.replace(/\/$/, "");
    localStorage.setItem("lf_api_url", trimmed);
    localStorage.setItem("lf_model", model);
    setApiUrl(trimmed);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  async function handleTest() {
    setTestState("testing");
    setTestMsg("");
    try {
      const res = await fetch(`${apiUrl}/v1/health`);
      const data = await res.json();
      if (data.status === "ok") {
        setTestState("ok");
        setTestMsg(
          `Connected — LokaFlow v${data.version}, ${data.providers?.length ?? 0} providers.`,
        );
      } else {
        throw new Error("Unexpected status");
      }
    } catch {
      setTestState("fail");
      setTestMsg(`Cannot reach ${apiUrl} — make sure the API server is running.`);
    }
  }

  const used = (val: number, limit: number) => (limit > 0 ? Math.min(100, (val / limit) * 100) : 0);

  return (
    <div className="settings-container">
      <header className="settings-header">
        <Settings2 size={20} />
        <div>
          <h1>Settings</h1>
          <p className="subtitle">Configure your LokaFlow™ connection and preferences.</p>
        </div>
      </header>

      {/* Connection */}
      <section className="settings-section">
        <h2 className="settings-section-title">
          <Wifi size={15} /> API Connection
        </h2>
        <div className="settings-field">
          <label htmlFor="apiUrl">API Base URL</label>
          <input
            id="apiUrl"
            className="settings-input"
            type="text"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            placeholder="http://localhost:4141"
          />
          <span className="settings-hint">Default: http://localhost:4141</span>
        </div>
        <div className="settings-field">
          <label htmlFor="model">Default Model</label>
          <select
            id="model"
            className="settings-input settings-select"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            {MODEL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <span className="settings-hint">
            "Auto" lets the router pick based on complexity and budget.
          </span>
        </div>

        <div className="settings-actions">
          <button className="btn-test" onClick={handleTest} disabled={testState === "testing"}>
            {testState === "testing" ? "Testing…" : "Test Connection"}
          </button>
          <button className="btn-save" onClick={handleSave}>
            {saved ? "✓ Saved" : "Save Settings"}
          </button>
        </div>

        {testState !== "idle" && testState !== "testing" && (
          <div className={`test-result ${testState}`}>
            {testState === "ok" ? <CheckCircle size={15} /> : <XCircle size={15} />}
            {testMsg}
          </div>
        )}
      </section>

      {/* Budget */}
      <section className="settings-section">
        <h2 className="settings-section-title">
          <DollarSign size={15} /> Budget &amp; Usage
        </h2>
        {costError && (
          <p className="settings-cost-error">Could not load cost data — API may be offline.</p>
        )}
        {cost && (
          <div className="cost-grid">
            {/* Today */}
            <div className="cost-card">
              <div className="cost-card-title">Today</div>
              <div className="cost-main">€{cost.today.totalEur.toFixed(4)}</div>
              <div className="cost-meta">
                {cost.today.queryCount} queries · {cost.today.localQueries} local /{" "}
                {cost.today.cloudQueries} cloud
              </div>
              <div className="budget-bar-wrap">
                <div className="budget-bar-bg">
                  <div
                    className="budget-bar-fill"
                    style={{
                      width: `${used(cost.today.totalEur, cost.limits.dailyLimitEur)}%`,
                      background: cost.limits.dailyUsedPercent > 80 ? "#ef4444" : "#3b82f6",
                    }}
                  />
                </div>
                <span className="budget-pct">
                  {cost.limits.dailyUsedPercent.toFixed(0)}% of €{cost.limits.dailyLimitEur} limit
                </span>
              </div>
            </div>
            {/* Month */}
            <div className="cost-card">
              <div className="cost-card-title">This Month</div>
              <div className="cost-main">€{cost.month.totalEur.toFixed(4)}</div>
              <div className="cost-meta">
                {cost.month.queryCount} queries · {cost.month.localPercent.toFixed(0)}% local
              </div>
              <div className="budget-bar-wrap">
                <div className="budget-bar-bg">
                  <div
                    className="budget-bar-fill"
                    style={{
                      width: `${used(cost.month.totalEur, cost.limits.monthlyLimitEur)}%`,
                      background: cost.limits.monthlyUsedPercent > 80 ? "#ef4444" : "#3b82f6",
                    }}
                  />
                </div>
                <span className="budget-pct">
                  {cost.limits.monthlyUsedPercent.toFixed(0)}% of €{cost.limits.monthlyLimitEur}{" "}
                  limit
                </span>
              </div>
            </div>
            {/* Savings */}
            <div className="cost-card savings-card">
              <div className="cost-card-title">Savings vs Cloud-Only</div>
              <div className="cost-main green">€{cost.month.savingsVsNaiveEur.toFixed(2)}</div>
              <div className="cost-meta">this month</div>
            </div>
          </div>
        )}
      </section>

      {/* About */}
      <section className="settings-section">
        <h2 className="settings-section-title">
          <Info size={15} /> About LokaFlow™
        </h2>
        <div className="about-grid">
          <div className="about-row">
            <span>Product</span>
            <span>LokaFlow™</span>
          </div>
          <div className="about-row">
            <span>Owner</span>
            <span>LearnHubPlay BV</span>
          </div>
          <div className="about-row">
            <span>License</span>
            <span>BUSL 1.1 — free for personal use</span>
          </div>
          <div className="about-row">
            <span>Website</span>
            <a href="https://lokaflow.com" target="_blank" rel="noreferrer">
              lokaflow.com
            </a>
          </div>
          <div className="about-row">
            <span>Sponsors</span>
            <a href="https://github.com/sponsors/lokaflow" target="_blank" rel="noreferrer">
              github.com/sponsors/lokaflow
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
