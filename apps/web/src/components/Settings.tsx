import { useEffect, useState } from "react";
import {
  CheckCircle,
  XCircle,
  Wifi,
  DollarSign,
  Settings2,
  Info,
  Key,
  Shield,
  Bell,
  Palette,
  Zap,
  AlertTriangle,
  Plus,
  Trash2,
  TestTube,
} from "lucide-react";

// ─── Model options ────────────────────────────────────────────────────────────

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

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface CategoryRule {
  id: string;
  category: string;
  strategy: "always-local" | "always-cloud" | "smart";
  threshold: number;
  preferredModel: string;
}

type TestState = "idle" | "testing" | "ok" | "fail";
type Tab =
  | "connection"
  | "routing"
  | "keys"
  | "budget"
  | "privacy"
  | "notifications"
  | "appearance";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "connection", label: "Connection", icon: <Wifi size={14} /> },
  { id: "routing", label: "Routing Rules", icon: <Zap size={14} /> },
  { id: "keys", label: "API Keys", icon: <Key size={14} /> },
  { id: "budget", label: "Budget", icon: <DollarSign size={14} /> },
  { id: "privacy", label: "Privacy", icon: <Shield size={14} /> },
  { id: "notifications", label: "Notifications", icon: <Bell size={14} /> },
  { id: "appearance", label: "Appearance", icon: <Palette size={14} /> },
];

const DEFAULT_RULES: CategoryRule[] = [
  {
    id: "r1",
    category: "Coding",
    strategy: "always-local",
    threshold: 0.75,
    preferredModel: "qwen2.5-coder:7b",
  },
  {
    id: "r2",
    category: "Document AI",
    strategy: "always-local",
    threshold: 0.7,
    preferredModel: "qwen2.5:7b",
  },
  { id: "r3", category: "Compliance", strategy: "smart", threshold: 0.6, preferredModel: "auto" },
  { id: "r4", category: "Creative", strategy: "smart", threshold: 0.55, preferredModel: "auto" },
];

const DEFAULT_PII_KEYWORDS = ["IBAN", "BSN", "patient", "salary", "confidential"];

// ─── Settings Component ───────────────────────────────────────────────────────

interface SettingsProps {
  initialTab?: Tab;
  onTabChange?: (tab: Tab) => void;
}

export function Settings({ initialTab, onTabChange }: SettingsProps = {}) {
  const [tab, setTab] = useState<Tab>(initialTab ?? "connection");

  // Sync tab when hash changes externally (e.g. browser back/forward)
  useEffect(() => {
    const handler = () => {
      const raw = window.location.hash.slice(1);
      const sub = raw.split("/")[1] as Tab | undefined;
      if (sub && TABS.some((t) => t.id === sub)) setTab(sub);
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  function changeTab(t: Tab) {
    setTab(t);
    onTabChange?.(t);
  }

  // Connection
  const [apiUrl, setApiUrl] = useState(
    () => localStorage.getItem("lf_api_url") || "http://127.0.0.1:4141",
  );
  const [model, setModel] = useState(() => localStorage.getItem("lf_model") || "auto");
  const [saved, setSaved] = useState(false);
  const [testState, setTestState] = useState<TestState>("idle");
  const [testMsg, setTestMsg] = useState("");

  // Budget
  const [cost, setCost] = useState<CostData | null>(null);
  const [costError, setCostError] = useState(false);
  const [dailyCap, setDailyCap] = useState("2.00");
  const [monthlyCap, setMonthlyCap] = useState("30.00");
  const [alertPct, setAlertPct] = useState("80");

  // Routing
  const [globalThreshold, setGlobalThreshold] = useState(0.55);
  const [categoryRules, setCategoryRules] = useState<CategoryRule[]>(DEFAULT_RULES);
  const [piiKeywords, setPiiKeywords] = useState<string[]>(DEFAULT_PII_KEYWORDS);
  const [newKeyword, setNewKeyword] = useState("");
  const [simulatePrompt, setSimulatePrompt] = useState("");
  const [simulateResult, setSimulateResult] = useState<string | null>(null);

  // API Keys
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem("lf_key_gemini") || "");
  const [anthropicKey, setAnthropicKey] = useState(
    () => localStorage.getItem("lf_key_anthropic") || "",
  );
  const [openaiKey, setOpenaiKey] = useState(() => localStorage.getItem("lf_key_openai") || "");
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});

  // Privacy
  const [scanPii, setScanPii] = useState(true);
  const [blockCloudPii, setBlockCloudPii] = useState(true);
  const [localOnlyMode, setLocalOnlyMode] = useState(false);
  const [telemetry, setTelemetry] = useState(false);
  const [retention, setRetention] = useState("90");

  // Notifications
  const [notifBudget, setNotifBudget] = useState(true);
  const [notifBudgetExceeded, setNotifBudgetExceeded] = useState(true);
  const [notifNodeOffline, setNotifNodeOffline] = useState(true);
  const [notifModelUnavail, setNotifModelUnavail] = useState(true);
  const [notifNewModel, setNotifNewModel] = useState(false);
  const [notifBatch, setNotifBatch] = useState(true);
  const [notifPii, setNotifPii] = useState(true);

  // Appearance
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [fontSize, setFontSize] = useState<"14" | "16">("14");
  const [showModelBadge, setShowModelBadge] = useState(true);
  const [showTokenCount, setShowTokenCount] = useState(true);
  const [showCostPerMsg, setShowCostPerMsg] = useState(true);
  const [showRoutingBadge, setShowRoutingBadge] = useState(true);
  const [showComplexity, setShowComplexity] = useState(false);

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
      } else throw new Error();
    } catch {
      setTestState("fail");
      setTestMsg(`Cannot reach ${apiUrl} — make sure the API server is running.`);
    }
  }

  function saveApiKey(provider: string, value: string) {
    localStorage.setItem(`lf_key_${provider}`, value);
  }

  function simulateRouting() {
    if (!simulatePrompt.trim()) return;
    const words = simulatePrompt.toLowerCase().split(/\s+/);
    const hasPii = piiKeywords.some((k) => words.includes(k.toLowerCase()));
    const complexWords = [
      "analyse",
      "compare",
      "evaluate",
      "assess",
      "review",
      "compliance",
      "gap",
    ];
    const complexCount = words.filter((w) => complexWords.some((c) => w.includes(c))).length;
    const score = Math.min(0.95, 0.2 + complexCount * 0.15 + simulatePrompt.length / 2000);
    const label =
      score < 0.3 ? "Simple" : score < 0.6 ? "Moderate" : score < 0.8 ? "Complex" : "Expert";
    const tier = hasPii ? "local (PII guard)" : score <= globalThreshold ? "local" : "cloud";
    const estCost = tier === "local" || hasPii ? "€0.00" : `~€${(score * 0.005).toFixed(4)}`;
    setSimulateResult(
      `Complexity: ${score.toFixed(2)} (${label})\nPII detected: ${hasPii ? "Yes — forced local" : "No"}\nDecision: → ${tier}\nModel: ${tier.includes("local") ? MODEL_OPTIONS[4]?.label : "gemini-2.0-flash"}\nEstimated cost: ${estCost}`,
    );
  }

  function addKeyword() {
    const kw = newKeyword.trim();
    if (kw && !piiKeywords.includes(kw)) {
      setPiiKeywords([...piiKeywords, kw]);
      setNewKeyword("");
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

      {/* Tab bar */}
      <div className="settings-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`settings-tab ${tab === t.id ? "active" : ""}`}
            onClick={() => changeTab(t.id)}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Connection ──────────────────────────────────────────────────── */}
      {tab === "connection" && (
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
      )}

      {/* ── Routing Rules ──────────────────────────────────────────────── */}
      {tab === "routing" && (
        <section className="settings-section">
          <h2 className="settings-section-title">
            <Zap size={15} /> Routing Rules
          </h2>

          <div className="routing-global-section">
            <h3 className="settings-sub-title">Global Default</h3>
            <div className="settings-field">
              <label>
                Complexity threshold: <strong>{globalThreshold.toFixed(2)}</strong>
              </label>
              <input
                type="range"
                min="0.1"
                max="0.9"
                step="0.05"
                value={globalThreshold}
                onChange={(e) => setGlobalThreshold(parseFloat(e.target.value))}
                className="settings-range"
              />
              <span className="settings-hint">
                Below {globalThreshold.toFixed(2)} → local model · Above → smart route to cloud
              </span>
            </div>
          </div>

          <div className="routing-categories-section">
            <h3 className="settings-sub-title">Category Overrides</h3>
            <div className="routing-rules-table">
              <div className="rr-header">
                <span>Category</span>
                <span>Strategy</span>
                <span>Threshold</span>
                <span>Preferred Model</span>
                <span></span>
              </div>
              {categoryRules.map((rule) => (
                <div key={rule.id} className="rr-row">
                  <span className="rr-category">{rule.category}</span>
                  <select
                    className="rr-select"
                    value={rule.strategy}
                    onChange={(e) =>
                      setCategoryRules(
                        categoryRules.map((r) =>
                          r.id === rule.id
                            ? { ...r, strategy: e.target.value as CategoryRule["strategy"] }
                            : r,
                        ),
                      )
                    }
                  >
                    <option value="always-local">Always local</option>
                    <option value="smart">Smart route</option>
                    <option value="always-cloud">Always cloud</option>
                  </select>
                  {rule.strategy === "smart" && (
                    <input
                      type="number"
                      min="0.1"
                      max="0.9"
                      step="0.05"
                      value={rule.threshold}
                      onChange={(e) =>
                        setCategoryRules(
                          categoryRules.map((r) =>
                            r.id === rule.id ? { ...r, threshold: parseFloat(e.target.value) } : r,
                          ),
                        )
                      }
                      className="rr-threshold-input"
                    />
                  )}
                  {rule.strategy !== "smart" && <span className="rr-na">—</span>}
                  <span className="rr-model">{rule.preferredModel}</span>
                  <button
                    className="btn-icon-danger"
                    onClick={() => setCategoryRules(categoryRules.filter((r) => r.id !== rule.id))}
                    title="Remove rule"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
            <button
              className="btn-ghost btn-sm"
              onClick={() =>
                setCategoryRules([
                  ...categoryRules,
                  {
                    id: `r${Date.now()}`,
                    category: "Custom",
                    strategy: "smart",
                    threshold: 0.55,
                    preferredModel: "auto",
                  },
                ])
              }
            >
              <Plus size={13} /> Add category rule
            </button>
          </div>

          <div className="pii-keywords-section">
            <h3 className="settings-sub-title">Always-Local Keywords (PII Guard)</h3>
            <p className="settings-hint" style={{ marginBottom: 12 }}>
              If prompt contains any of these → force local, never cloud
            </p>
            <div className="keyword-chips">
              {piiKeywords.map((k) => (
                <span key={k} className="keyword-chip">
                  {k}
                  <button onClick={() => setPiiKeywords(piiKeywords.filter((x) => x !== k))}>
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="keyword-add-row">
              <input
                className="settings-input settings-input-sm"
                placeholder="Add keyword…"
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addKeyword()}
              />
              <button className="btn-add" onClick={addKeyword}>
                <Plus size={13} /> Add
              </button>
            </div>
          </div>

          <div className="routing-tester-section">
            <h3 className="settings-sub-title">
              <TestTube size={14} /> Routing Rules Tester
            </h3>
            <p className="settings-hint" style={{ marginBottom: 10 }}>
              Simulate routing on any prompt — zero tokens, zero cost
            </p>
            <textarea
              className="settings-input settings-textarea"
              placeholder="Paste any prompt here…"
              value={simulatePrompt}
              onChange={(e) => setSimulatePrompt(e.target.value)}
              rows={3}
            />
            <button className="btn-save" style={{ marginTop: 8 }} onClick={simulateRouting}>
              Simulate Routing →
            </button>
            {simulateResult && <pre className="simulate-result">{simulateResult}</pre>}
          </div>
        </section>
      )}

      {/* ── API Keys ───────────────────────────────────────────────────── */}
      {tab === "keys" && (
        <section className="settings-section">
          <h2 className="settings-section-title">
            <Key size={15} /> API Keys
          </h2>
          <p className="settings-hint" style={{ marginBottom: 20 }}>
            Cloud provider keys — stored in your browser's localStorage, never sent to LokaFlow
            servers.
          </p>

          <div className="api-keys-list">
            {[
              {
                id: "gemini",
                label: "Google Gemini",
                placeholder: "AIza…",
                value: geminiKey,
                setter: setGeminiKey,
              },
              {
                id: "anthropic",
                label: "Anthropic Claude",
                placeholder: "sk-ant-…",
                value: anthropicKey,
                setter: setAnthropicKey,
              },
              {
                id: "openai",
                label: "OpenAI",
                placeholder: "sk-…",
                value: openaiKey,
                setter: setOpenaiKey,
              },
            ].map(({ id, label, placeholder, value, setter }) => (
              <div key={id} className="api-key-row">
                <div className="api-key-label">{label}</div>
                <div className="api-key-input-wrap">
                  <input
                    className="settings-input"
                    type={showKey[id] ? "text" : "password"}
                    placeholder={value ? "••••••••••••••••" : placeholder}
                    value={value}
                    onChange={(e) => setter(e.target.value)}
                  />
                  <button
                    className="btn-ghost btn-sm"
                    onClick={() => setShowKey((s) => ({ ...s, [id]: !s[id] }))}
                  >
                    {showKey[id] ? "Hide" : "Show"}
                  </button>
                  <button className="btn-save btn-sm" onClick={() => saveApiKey(id, value)}>
                    Save
                  </button>
                </div>
                <div className="api-key-status">
                  {value ? (
                    <span className="key-set">
                      <CheckCircle size={13} /> Key saved
                    </span>
                  ) : (
                    <span className="key-unset">Not configured</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="settings-security-note">
            <Shield size={14} />
            <div>
              <strong>Key Security</strong>
              <ul>
                <li>Keys are stored in browser localStorage on your device only</li>
                <li>Keys are never transmitted to LokaFlow servers</li>
                <li>Keys are sent only directly to the provider's API endpoint</li>
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* ── Budget ─────────────────────────────────────────────────────── */}
      {tab === "budget" && (
        <section className="settings-section">
          <h2 className="settings-section-title">
            <DollarSign size={15} /> Budget &amp; Limits
          </h2>

          <div className="budget-limits-grid">
            <div className="budget-limit-row">
              <label>Daily cap</label>
              <div className="budget-limit-inputs">
                <span>€</span>
                <input
                  className="settings-input settings-input-sm"
                  type="number"
                  min="0"
                  step="0.5"
                  value={dailyCap}
                  onChange={(e) => setDailyCap(e.target.value)}
                />
                <span className="settings-hint">
                  Alert at {alertPct}% → €
                  {((parseFloat(dailyCap || "2") * parseFloat(alertPct)) / 100).toFixed(2)}
                </span>
              </div>
            </div>
            <div className="budget-limit-row">
              <label>Monthly cap</label>
              <div className="budget-limit-inputs">
                <span>€</span>
                <input
                  className="settings-input settings-input-sm"
                  type="number"
                  min="0"
                  step="1"
                  value={monthlyCap}
                  onChange={(e) => setMonthlyCap(e.target.value)}
                />
              </div>
            </div>
            <div className="budget-limit-row">
              <label>Alert threshold</label>
              <div className="budget-limit-inputs">
                <select
                  className="settings-input settings-select settings-select-sm"
                  value={alertPct}
                  onChange={(e) => setAlertPct(e.target.value)}
                >
                  {["50", "70", "80", "90"].map((v) => (
                    <option key={v} value={v}>
                      {v}%
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <h3 className="settings-sub-title" style={{ marginTop: 24 }}>
            Current Usage
          </h3>
          {costError && (
            <p className="settings-cost-error">Could not load cost data — API may be offline.</p>
          )}
          {cost && (
            <div className="cost-grid">
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
                    {cost.limits.dailyUsedPercent.toFixed(0)}% of €{cost.limits.dailyLimitEur}
                  </span>
                </div>
              </div>
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
                    {cost.limits.monthlyUsedPercent.toFixed(0)}% of €{cost.limits.monthlyLimitEur}
                  </span>
                </div>
              </div>
              <div className="cost-card savings-card">
                <div className="cost-card-title">Savings vs Cloud-Only</div>
                <div className="cost-main green">€{cost.month.savingsVsNaiveEur.toFixed(2)}</div>
                <div className="cost-meta">this month</div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── Privacy ────────────────────────────────────────────────────── */}
      {tab === "privacy" && (
        <section className="settings-section">
          <h2 className="settings-section-title">
            <Shield size={15} /> Privacy Controls
          </h2>

          <div className="settings-group">
            <h3 className="settings-sub-title">PII Scanner</h3>
            <div className="settings-toggle-row">
              <label>
                <input
                  type="checkbox"
                  checked={scanPii}
                  onChange={(e) => setScanPii(e.target.checked)}
                />{" "}
                Scan all prompts for PII before routing
              </label>
            </div>
            <div className="settings-toggle-row">
              <label>
                <input
                  type="checkbox"
                  checked={blockCloudPii}
                  onChange={(e) => setBlockCloudPii(e.target.checked)}
                />{" "}
                Block cloud routing if PII is detected
              </label>
            </div>
          </div>

          <div className="settings-group" style={{ marginTop: 20 }}>
            <h3 className="settings-sub-title">Telemetry</h3>
            <div className="settings-toggle-row">
              <label>
                <input
                  type="checkbox"
                  checked={telemetry}
                  onChange={(e) => setTelemetry(e.target.checked)}
                />
                Share anonymous usage statistics with LokaFlow team
              </label>
            </div>
            <p className="settings-hint" style={{ marginTop: 6, marginLeft: 24 }}>
              Includes: model assignments · token counts · latency · routing decisions
              <br />
              Never includes: prompt content · file content · personal data · API keys
            </p>
          </div>

          <div className="settings-group" style={{ marginTop: 20 }}>
            <h3 className="settings-sub-title">Data Retention</h3>
            <div className="settings-field">
              <label>Chat history retention</label>
              <select
                className="settings-input settings-select"
                value={retention}
                onChange={(e) => setRetention(e.target.value)}
              >
                <option value="30">30 days</option>
                <option value="90">90 days</option>
                <option value="180">180 days</option>
                <option value="365">1 year</option>
                <option value="0">Forever</option>
              </select>
            </div>
            <div className="settings-actions" style={{ marginTop: 8 }}>
              <button
                className="btn-ghost"
                onClick={() => {
                  if (confirm("Clear all chat history? This cannot be undone."))
                    localStorage.removeItem("lf_chat_sessions");
                }}
              >
                <Trash2 size={13} /> Clear all chat history
              </button>
            </div>
          </div>

          <div className="settings-group" style={{ marginTop: 20 }}>
            <h3 className="settings-sub-title">Local-Only Mode</h3>
            <div className="settings-toggle-row">
              <label>
                <input
                  type="checkbox"
                  checked={localOnlyMode}
                  onChange={(e) => setLocalOnlyMode(e.target.checked)}
                />
                Force ALL queries to local models — never make cloud API calls
              </label>
            </div>
            {localOnlyMode && (
              <div className="privacy-warning">
                <AlertTriangle size={14} /> Maximum privacy — nothing leaves your machine. Quality
                may be lower for complex tasks.
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Notifications ──────────────────────────────────────────────── */}
      {tab === "notifications" && (
        <section className="settings-section">
          <h2 className="settings-section-title">
            <Bell size={15} /> Notifications
          </h2>

          <div className="notif-list">
            {[
              {
                label: "Budget alerts",
                desc: "When spending hits 80% of daily cap",
                val: notifBudget,
                setter: setNotifBudget,
              },
              {
                label: "Budget exceeded",
                desc: "When cap is reached (blocks further cloud queries)",
                val: notifBudgetExceeded,
                setter: setNotifBudgetExceeded,
              },
              {
                label: "Node offline",
                desc: "When a mesh node goes offline",
                val: notifNodeOffline,
                setter: setNotifNodeOffline,
              },
              {
                label: "Model unavailable",
                desc: "When a local model fails to load",
                val: notifModelUnavail,
                setter: setNotifModelUnavail,
              },
              {
                label: "New model available",
                desc: "Weekly digest when a better local model is released",
                val: notifNewModel,
                setter: setNotifNewModel,
              },
              {
                label: "Batch job complete",
                desc: "When a scheduled batch finishes (with results summary)",
                val: notifBatch,
                setter: setNotifBatch,
              },
              {
                label: "PII detected",
                desc: "When PII is found in a prompt and cloud is blocked",
                val: notifPii,
                setter: setNotifPii,
              },
            ].map(({ label, desc, val, setter }) => (
              <div key={label} className="notif-row">
                <input type="checkbox" checked={val} onChange={(e) => setter(e.target.checked)} />
                <div className="notif-text">
                  <span className="notif-label">{label}</span>
                  <span className="notif-desc">{desc}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="settings-field" style={{ marginTop: 20 }}>
            <label>Delivery method</label>
            <select className="settings-input settings-select">
              <option>Desktop notification</option>
              <option>Slack webhook</option>
              <option>Email</option>
            </select>
          </div>
        </section>
      )}

      {/* ── Appearance ─────────────────────────────────────────────────── */}
      {tab === "appearance" && (
        <section className="settings-section">
          <h2 className="settings-section-title">
            <Palette size={15} /> Appearance
          </h2>

          <div className="appearance-group">
            <h3 className="settings-sub-title">Theme</h3>
            <div className="radio-group">
              <label>
                <input type="radio" name="theme" defaultChecked /> Dark (default)
              </label>
              <label>
                <input type="radio" name="theme" /> System
              </label>
            </div>
            <p className="settings-hint">
              Light mode is not planned — dark is intentional for readability.
            </p>
          </div>

          <div className="appearance-group" style={{ marginTop: 20 }}>
            <h3 className="settings-sub-title">Density</h3>
            <div className="radio-group">
              <label>
                <input
                  type="radio"
                  name="density"
                  checked={density === "comfortable"}
                  onChange={() => setDensity("comfortable")}
                />{" "}
                Comfortable (default)
              </label>
              <label>
                <input
                  type="radio"
                  name="density"
                  checked={density === "compact"}
                  onChange={() => setDensity("compact")}
                />{" "}
                Compact (smaller rows, tighter spacing)
              </label>
            </div>
          </div>

          <div className="appearance-group" style={{ marginTop: 20 }}>
            <h3 className="settings-sub-title">Font Size</h3>
            <div className="radio-group">
              <label>
                <input
                  type="radio"
                  name="fontSize"
                  checked={fontSize === "14"}
                  onChange={() => setFontSize("14")}
                />{" "}
                Default (14px)
              </label>
              <label>
                <input
                  type="radio"
                  name="fontSize"
                  checked={fontSize === "16"}
                  onChange={() => setFontSize("16")}
                />{" "}
                Large (16px)
              </label>
            </div>
          </div>

          <div className="appearance-group" style={{ marginTop: 20 }}>
            <h3 className="settings-sub-title">Chat Display</h3>
            <div className="notif-list">
              {[
                {
                  label: "Show model badge on every AI message",
                  val: showModelBadge,
                  setter: setShowModelBadge,
                },
                {
                  label: "Show token count per message",
                  val: showTokenCount,
                  setter: setShowTokenCount,
                },
                { label: "Show cost per message", val: showCostPerMsg, setter: setShowCostPerMsg },
                {
                  label: "Show routing tier badge (local / cloud / specialist)",
                  val: showRoutingBadge,
                  setter: setShowRoutingBadge,
                },
                {
                  label: "Show complexity score (developer mode)",
                  val: showComplexity,
                  setter: setShowComplexity,
                },
              ].map(({ label, val, setter }) => (
                <div key={label} className="notif-row">
                  <input type="checkbox" checked={val} onChange={(e) => setter(e.target.checked)} />
                  <div className="notif-text">
                    <span className="notif-label">{label}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* About — always at bottom */}
      <section className="settings-section settings-about">
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
