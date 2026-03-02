import React, { useEffect, useState, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  SafeAreaView,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ── types ──────────────────────────────────────────────────────────────────────

interface CostStats {
  today: { totalEur: number; queryCount: number; localQueries: number; cloudQueries: number };
  month: { totalEur: number; queryCount: number; savingsVsNaiveEur: number; localPercent: number };
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

// ── helpers ────────────────────────────────────────────────────────────────────

function fmtEur(v: number): string {
  if (v >= 1) return `€${v.toFixed(2)}`;
  if (v === 0) return "€0.00";
  return `€${(v * 100).toFixed(1)}¢`;
}

function fmtPct(v: number): string {
  return `${v.toFixed(1)}%`;
}

function fmtUptime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return `${h}h ${m}m`;
}

function fmtLatency(ms: number): string {
  if (ms >= 60000) return `${(ms / 60000).toFixed(1)}m`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function tierEmoji(tier: string): string {
  if (tier === "local") return "🖥";
  if (tier === "specialist") return "⚡";
  return "☁";
}

function statusColor(s: string): string {
  return s === "ok" ? "#10b981" : s === "error" ? "#ef4444" : "#f59e0b";
}

// ── mock fallback ──────────────────────────────────────────────────────────────

const MOCK_COST: CostStats = {
  today: { totalEur: 0.03, queryCount: 18, localQueries: 15, cloudQueries: 3 },
  month: { totalEur: 0.41, queryCount: 312, savingsVsNaiveEur: 68.4, localPercent: 84.0 },
  limits: { dailyLimitEur: 1.0, monthlyLimitEur: 20.0, dailyUsedPercent: 3, monthlyUsedPercent: 2 },
};

const MOCK_HEALTH: HealthData = {
  status: "ok",
  version: "2.8.0",
  uptime: 14400,
  providers: [
    { name: "ollama", tier: "local", status: "ok", latencyMs: 42 },
    { name: "lm-studio", tier: "local", status: "ok", latencyMs: 67 },
    { name: "openai", tier: "cloud", status: "ok", latencyMs: 620 },
  ],
};

const MOCK_HISTORY: HistoryEntry[] = [
  {
    timestamp: new Date(Date.now() - 300000).toISOString(),
    tier: "local",
    model: "qwen2.5:7b",
    reason: "Simple query",
    score: 0.2,
    costEur: 0,
    latencyMs: 540,
    prompt: "What is GDPR?",
  },
  {
    timestamp: new Date(Date.now() - 900000).toISOString(),
    tier: "cloud",
    model: "gpt-4o",
    reason: "Complex legal",
    score: 0.82,
    costEur: 0.012,
    latencyMs: 3200,
    prompt: "Review this contract for compliance...",
  },
  {
    timestamp: new Date(Date.now() - 1800000).toISOString(),
    tier: "local",
    model: "qwen2.5-coder:7b",
    reason: "Code task",
    score: 0.35,
    costEur: 0,
    latencyMs: 890,
    prompt: "Write a Python function...",
  },
];

// ── component ──────────────────────────────────────────────────────────────────

export default function DashboardScreen({ navigation }: any) {
  const [cost, setCost] = useState<CostStats | null>(null);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiBase, setApiBase] = useState("http://localhost:4141");

  const load = useCallback(async () => {
    setLoading(true);
    const base = (await AsyncStorage.getItem("lf_api_url")) ?? "http://localhost:4141";
    setApiBase(base);
    try {
      const [costRes, healthRes, histRes] = await Promise.allSettled([
        fetch(`${base}/v1/cost/stats`).then((r) => r.json()),
        fetch(`${base}/health`).then((r) => r.json()),
        fetch(`${base}/v1/routing/history?limit=5`).then((r) => r.json()),
      ]);
      setCost(costRes.status === "fulfilled" ? costRes.value : MOCK_COST);
      setHealth(healthRes.status === "fulfilled" ? healthRes.value : MOCK_HEALTH);
      setHistory(
        histRes.status === "fulfilled"
          ? Array.isArray(histRes.value)
            ? histRes.value
            : (histRes.value?.entries ?? [])
          : MOCK_HISTORY,
      );
    } catch {
      setCost(MOCK_COST);
      setHealth(MOCK_HEALTH);
      setHistory(MOCK_HISTORY);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const c = cost ?? MOCK_COST;
  const h = health ?? MOCK_HEALTH;

  return (
    <SafeAreaView style={s.container}>
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor="#10b981" />
        }
      >
        {/* LokaFlow status bar */}
        <View style={[s.statusBanner, { borderColor: statusColor(h.status) }]}>
          <View style={[s.statusDot, { backgroundColor: statusColor(h.status) }]} />
          <Text style={s.statusText}>
            LokaFlow {h.version} · {h.status.toUpperCase()} · up {fmtUptime(h.uptime)}
          </Text>
        </View>

        {/* Today stats */}
        <Text style={s.sectionTitle}>Today</Text>
        <View style={s.row}>
          <StatCard label="Queries" value={String(c.today.queryCount)} sub="today" />
          <StatCard label="Cost" value={fmtEur(c.today.totalEur)} sub="today" accent />
          <StatCard
            label="Local"
            value={`${c.today.localQueries}`}
            sub={`of ${c.today.queryCount}`}
            green
          />
        </View>

        {/* Monthly stats */}
        <Text style={s.sectionTitle}>This Month</Text>
        <View style={s.row}>
          <StatCard label="Spent" value={fmtEur(c.month.totalEur)} sub="month" />
          <StatCard label="Saved" value={fmtEur(c.month.savingsVsNaiveEur)} sub="vs cloud" green />
          <StatCard label="Local %" value={fmtPct(c.month.localPercent)} sub="private" green />
        </View>

        {/* Budget bars */}
        <Text style={s.sectionTitle}>Budget</Text>
        <View style={s.card}>
          <BudgetBar
            label="Daily"
            used={c.limits.dailyUsedPercent}
            limit={fmtEur(c.limits.dailyLimitEur)}
          />
          <BudgetBar
            label="Monthly"
            used={c.limits.monthlyUsedPercent}
            limit={fmtEur(c.limits.monthlyLimitEur)}
          />
        </View>

        {/* Providers */}
        <Text style={s.sectionTitle}>Providers</Text>
        <View style={s.card}>
          {h.providers.map((p) => (
            <View key={p.name} style={s.providerRow}>
              <Text style={s.providerEmoji}>{tierEmoji(p.tier)}</Text>
              <Text style={s.providerName}>{p.name}</Text>
              <View
                style={[
                  s.providerStatus,
                  {
                    backgroundColor: statusColor(p.status) + "22",
                    borderColor: statusColor(p.status),
                  },
                ]}
              >
                <Text style={[s.providerStatusText, { color: statusColor(p.status) }]}>
                  {p.status}
                </Text>
              </View>
              <Text style={s.providerLatency}>{fmtLatency(p.latencyMs)}</Text>
            </View>
          ))}
        </View>

        {/* Recent routing */}
        <Text style={s.sectionTitle}>Recent Decisions</Text>
        <View style={s.card}>
          {history.slice(0, 5).map((entry, i) => (
            <View key={i} style={[s.historyRow, i < history.length - 1 && s.historyRowBorder]}>
              <Text style={s.historyEmoji}>{tierEmoji(entry.tier)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.historyModel} numberOfLines={1}>
                  {entry.model}
                </Text>
                <Text style={s.historyReason} numberOfLines={1}>
                  {entry.reason}
                </Text>
                {entry.prompt && (
                  <Text style={s.historyPrompt} numberOfLines={1}>
                    {entry.prompt}
                  </Text>
                )}
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={s.historyCost}>{fmtEur(entry.costEur)}</Text>
                <Text style={s.historyLatency}>{fmtLatency(entry.latencyMs)}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Quick actions */}
        <Text style={s.sectionTitle}>Quick Actions</Text>
        <View style={s.row}>
          <QuickBtn label="💬 Chat" onPress={() => navigation.navigate("Chat")} />
          <QuickBtn label="🔍 History" onPress={() => navigation.navigate("History")} />
          <QuickBtn label="📊 Audit" onPress={() => navigation.navigate("Audit")} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── sub-components ─────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  accent,
  green,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
  green?: boolean;
}) {
  const valueColor = green ? "#10b981" : accent ? "#f59e0b" : "#fafafa";
  return (
    <View style={s.statCard}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, { color: valueColor }]}>{value}</Text>
      <Text style={s.statSub}>{sub}</Text>
    </View>
  );
}

function BudgetBar({ label, used, limit }: { label: string; used: number; limit: string }) {
  const color = used > 80 ? "#ef4444" : used > 50 ? "#f59e0b" : "#10b981";
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={s.budgetLabelRow}>
        <Text style={s.budgetLabel}>{label}</Text>
        <Text style={s.budgetLimit}>
          {fmtPct(used)} of {limit}
        </Text>
      </View>
      <View style={s.budgetBg}>
        <View
          style={[s.budgetFill, { width: `${Math.min(100, used)}%`, backgroundColor: color }]}
        />
      </View>
    </View>
  );
}

function QuickBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.quickBtn} onPress={onPress}>
      <Text style={s.quickBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#09090b" },
  content: { padding: 16, paddingBottom: 32 },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderWidth: 1,
    borderRadius: 10,
    marginBottom: 16,
    gap: 8,
    backgroundColor: "#18181b",
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { color: "#a1a1aa", fontSize: 13 },
  sectionTitle: {
    color: "#71717a",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 16,
  },
  row: { flexDirection: "row", gap: 8, marginBottom: 4 },
  statCard: {
    flex: 1,
    backgroundColor: "#18181b",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#27272a",
  },
  statLabel: { color: "#71717a", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 },
  statValue: { fontSize: 20, fontWeight: "700", marginTop: 4 },
  statSub: { color: "#52525b", fontSize: 11, marginTop: 2 },
  card: {
    backgroundColor: "#18181b",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#27272a",
    marginBottom: 4,
  },
  // Budget
  budgetLabelRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  budgetLabel: { color: "#a1a1aa", fontSize: 13 },
  budgetLimit: { color: "#71717a", fontSize: 12 },
  budgetBg: { height: 6, backgroundColor: "#27272a", borderRadius: 99 },
  budgetFill: { height: 6, borderRadius: 99 },
  // Providers
  providerRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, gap: 10 },
  providerEmoji: { fontSize: 18 },
  providerName: { flex: 1, color: "#fafafa", fontSize: 14, fontWeight: "500" },
  providerStatus: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  providerStatusText: { fontSize: 11, fontWeight: "600" },
  providerLatency: { color: "#71717a", fontSize: 12, minWidth: 48, textAlign: "right" },
  // History
  historyRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 10, gap: 10 },
  historyRowBorder: { borderBottomWidth: 1, borderBottomColor: "#27272a" },
  historyEmoji: { fontSize: 16, marginTop: 1 },
  historyModel: { color: "#fafafa", fontSize: 13, fontWeight: "600" },
  historyReason: { color: "#71717a", fontSize: 12, marginTop: 1 },
  historyPrompt: { color: "#52525b", fontSize: 11, marginTop: 1, fontStyle: "italic" },
  historyCost: { color: "#10b981", fontSize: 12, fontWeight: "600" },
  historyLatency: { color: "#71717a", fontSize: 11 },
  // Quick
  quickBtn: {
    flex: 1,
    backgroundColor: "#18181b",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  quickBtnText: { color: "#fafafa", fontSize: 13, fontWeight: "600" },
});
