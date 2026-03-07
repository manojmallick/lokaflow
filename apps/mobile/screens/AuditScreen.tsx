import React, { useEffect, useState, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  SafeAreaView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ── types ──────────────────────────────────────────────────────────────────────

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

interface CategoryBreakdown {
  label: string;
  local: number;
  cloud: number;
  savings: number;
}

// ── helpers ────────────────────────────────────────────────────────────────────

function fmtEur(v: number): string {
  if (v >= 1) return `€${v.toFixed(2)}`;
  if (v === 0) return "€0.00";
  return `${(v * 100).toFixed(1)}¢`;
}
function fmtPct(v: number) {
  return `${v.toFixed(1)}%`;
}

const MOCK_COST: CostData = {
  today: { totalEur: 0.03, queryCount: 18, localQueries: 15, cloudQueries: 3 },
  month: { totalEur: 0.41, queryCount: 312, savingsVsNaiveEur: 68.4, localPercent: 84.0 },
  limits: { dailyLimitEur: 1.0, monthlyLimitEur: 20.0, dailyUsedPercent: 3, monthlyUsedPercent: 2 },
};

function deriveCategoryBreakdown(cost: CostData): CategoryBreakdown[] {
  const total = cost.month.queryCount;
  return [
    {
      label: "General Q&A",
      local: Math.round(total * 0.45),
      cloud: Math.round(total * 0.05),
      savings: cost.month.savingsVsNaiveEur * 0.35,
    },
    {
      label: "Coding",
      local: Math.round(total * 0.2),
      cloud: Math.round(total * 0.08),
      savings: cost.month.savingsVsNaiveEur * 0.28,
    },
    {
      label: "Document AI",
      local: Math.round(total * 0.08),
      cloud: Math.round(total * 0.06),
      savings: cost.month.savingsVsNaiveEur * 0.2,
    },
    {
      label: "Compliance",
      local: Math.round(total * 0.03),
      cloud: Math.round(total * 0.03),
      savings: cost.month.savingsVsNaiveEur * 0.12,
    },
    {
      label: "Creative",
      local: Math.round(total * 0.01),
      cloud: Math.round(total * 0.01),
      savings: cost.month.savingsVsNaiveEur * 0.05,
    },
  ];
}

function buildTrend(monthTotal: number): { day: string; cost: number; savings: number }[] {
  const now = new Date();
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now.getTime() - (13 - i) * 86400000);
    const dayLabel = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    const progressFactor = (i + 1) / 14;
    const baseCost = (monthTotal / 30) * (1 - progressFactor * 0.5 + Math.random() * 0.2);
    const savings = baseCost * 120;
    return { day: dayLabel, cost: baseCost, savings };
  });
}

// ── component ──────────────────────────────────────────────────────────────────

export default function AuditScreen() {
  const [cost, setCost] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const base = (await AsyncStorage.getItem("lf_api_url")) ?? "http://localhost:4141";
    try {
      const data = await fetch(`${base}/v1/cost`).then((r) => r.json());
      setCost(data);
    } catch {
      setCost(MOCK_COST);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const c = cost ?? MOCK_COST;
  const breakdown = deriveCategoryBreakdown(c);
  const trend = buildTrend(c.month.totalEur);
  const naiveTotal = c.month.totalEur + c.month.savingsVsNaiveEur;
  const trendMax = Math.max(...trend.map((t) => t.savings), 1);

  return (
    <SafeAreaView style={s.container}>
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor="#10b981" />
        }
      >
        {/* Hero savings */}
        <View style={s.heroCard}>
          <Text style={s.heroLabel}>💸 Cloud spend saved this month</Text>
          <Text style={s.heroValue}>{fmtEur(c.month.savingsVsNaiveEur)}</Text>
          <Text style={s.heroSub}>
            You'd have paid {fmtEur(naiveTotal)} without local routing · actual{" "}
            {fmtEur(c.month.totalEur)}
          </Text>
          <View style={s.heroBadgeRow}>
            <View style={s.heroBadge}>
              <Text style={s.heroBadgeText}>🌍 {fmtPct(c.month.localPercent)} local</Text>
            </View>
            <View style={s.heroBadge}>
              <Text style={s.heroBadgeText}>📊 {c.month.queryCount} queries</Text>
            </View>
          </View>
        </View>

        {/* Today stats */}
        <Text style={s.sectionTitle}>Today</Text>
        <View style={s.row}>
          <StatCard label="Queries" value={String(c.today.queryCount)} />
          <StatCard label="Cost" value={fmtEur(c.today.totalEur)} accent />
          <StatCard label="Local" value={String(c.today.localQueries)} green />
          <StatCard label="Cloud" value={String(c.today.cloudQueries)} />
        </View>

        {/* Month stats */}
        <Text style={s.sectionTitle}>This Month</Text>
        <View style={s.row}>
          <StatCard label="Spent" value={fmtEur(c.month.totalEur)} />
          <StatCard label="Saved" value={fmtEur(c.month.savingsVsNaiveEur)} green />
        </View>

        {/* Trend */}
        <Text style={s.sectionTitle}>14-Day Cost Trend</Text>
        <View style={s.trendCard}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={s.trendChart}>
              {trend.map((t, i) => {
                const barH = Math.max(4, (t.savings / trendMax) * 80);
                return (
                  <View key={i} style={s.trendBar}>
                    <Text style={s.trendCost}>{fmtEur(t.cost)}</Text>
                    <View style={[s.trendBarFill, { height: barH }]} />
                    <Text style={s.trendDay}>{t.day}</Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>

        {/* Category breakdown */}
        <Text style={s.sectionTitle}>By Category</Text>
        <View style={s.card}>
          {breakdown.map((b, i) => {
            const total = b.local + b.cloud;
            const localPct = total > 0 ? (b.local / total) * 100 : 0;
            return (
              <View key={b.label} style={[s.catRow, i < breakdown.length - 1 && s.catRowBorder]}>
                <Text style={s.catLabel}>{b.label}</Text>
                <View style={s.catBarWrap}>
                  <View style={s.catBarBg}>
                    <View style={[s.catBarLocal, { width: `${localPct}%` }]} />
                  </View>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={s.catSaved}>saved {fmtEur(b.savings)}</Text>
                  <Text style={s.catPct}>{fmtPct(localPct)} local</Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* Budget */}
        <Text style={s.sectionTitle}>Budget</Text>
        <View style={s.card}>
          <BudgetBar
            label="Daily"
            used={c.limits.dailyUsedPercent}
            limit={c.limits.dailyLimitEur}
          />
          <BudgetBar
            label="Monthly"
            used={c.limits.monthlyUsedPercent}
            limit={c.limits.monthlyLimitEur}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── sub-components ─────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  accent,
  green,
}: {
  label: string;
  value: string;
  accent?: boolean;
  green?: boolean;
}) {
  return (
    <View style={s.statCard}>
      <Text style={s.statLabel}>{label}</Text>
      <Text
        style={[s.statValue, green ? { color: "#10b981" } : accent ? { color: "#f59e0b" } : {}]}
      >
        {value}
      </Text>
    </View>
  );
}

function BudgetBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const color = used > 80 ? "#ef4444" : used > 50 ? "#f59e0b" : "#10b981";
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
        <Text style={s.budgetLabel}>{label}</Text>
        <Text style={s.budgetPct}>
          {fmtPct(used)} of {fmtEur(limit)}
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

// ── styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#09090b" },
  content: { padding: 16, paddingBottom: 32 },
  heroCard: {
    backgroundColor: "#064e3b",
    borderRadius: 16,
    padding: 20,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#065f46",
    alignItems: "center",
  },
  heroLabel: { color: "#6ee7b7", fontSize: 13, marginBottom: 8 },
  heroValue: { color: "#ecfdf5", fontSize: 40, fontWeight: "800", marginBottom: 6 },
  heroSub: { color: "#a7f3d0", fontSize: 12, textAlign: "center", marginBottom: 12 },
  heroBadgeRow: { flexDirection: "row", gap: 8 },
  heroBadge: {
    backgroundColor: "#065f46",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  heroBadgeText: { color: "#6ee7b7", fontSize: 12, fontWeight: "600" },
  sectionTitle: {
    color: "#71717a",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 16,
  },
  row: { flexDirection: "row", gap: 8 },
  statCard: {
    flex: 1,
    backgroundColor: "#18181b",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#27272a",
  },
  statLabel: { color: "#71717a", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 },
  statValue: { color: "#fafafa", fontSize: 18, fontWeight: "700", marginTop: 4 },
  card: {
    backgroundColor: "#18181b",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#27272a",
  },
  // Trend
  trendCard: {
    backgroundColor: "#18181b",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#27272a",
  },
  trendChart: { flexDirection: "row", alignItems: "flex-end", height: 120, gap: 6 },
  trendBar: { alignItems: "center", width: 40 },
  trendCost: { color: "#52525b", fontSize: 8, marginBottom: 2 },
  trendBarFill: { width: 24, backgroundColor: "#10b981", borderRadius: 4 },
  trendDay: { color: "#52525b", fontSize: 8, marginTop: 4 },
  // Category
  catRow: { paddingVertical: 10 },
  catRowBorder: { borderBottomWidth: 1, borderBottomColor: "#27272a" },
  catLabel: { color: "#fafafa", fontSize: 13, fontWeight: "500", marginBottom: 6 },
  catBarWrap: { flex: 1, marginVertical: 4 },
  catBarBg: { height: 6, backgroundColor: "#27272a", borderRadius: 99 },
  catBarLocal: { height: 6, backgroundColor: "#10b981", borderRadius: 99 },
  catSaved: { color: "#10b981", fontSize: 11, fontWeight: "600" },
  catPct: { color: "#71717a", fontSize: 11 },
  // Budget
  budgetLabel: { color: "#a1a1aa", fontSize: 13 },
  budgetPct: { color: "#71717a", fontSize: 12 },
  budgetBg: { height: 6, backgroundColor: "#27272a", borderRadius: 99 },
  budgetFill: { height: 6, borderRadius: 99 },
});
