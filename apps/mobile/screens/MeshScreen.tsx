import React, { useState, useEffect, useCallback } from "react";
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

interface Provider {
  name: string;
  tier: "local" | "specialist" | "cloud";
  status: "ok" | "error" | "unknown";
  latencyMs: number;
  models?: string[];
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

// ── helpers ────────────────────────────────────────────────────────────────────

function fmtUptime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${String(mins).padStart(2, "0")}m`;
  return `${mins}m`;
}

function statusColor(s: string): string {
  return s === "ok" ? "#10b981" : s === "error" ? "#ef4444" : "#f59e0b";
}

function tierEmoji(tier: string): string {
  if (tier === "local") return "🖥";
  if (tier === "specialist") return "⚡";
  return "☁";
}

function tierLabel(tier: string): string {
  if (tier === "local") return "LOCAL";
  if (tier === "specialist") return "SPECIALIST";
  return "CLOUD";
}

function tierBg(tier: string): string {
  if (tier === "local") return "#064e3b";
  if (tier === "specialist") return "#451a03";
  return "#1e1b4b";
}

function tierTextColor(tier: string): string {
  if (tier === "local") return "#10b981";
  if (tier === "specialist") return "#f59e0b";
  return "#818cf8";
}

const MOCK_HEALTH: HealthData = {
  status: "ok",
  version: "2.8.0",
  uptime: 14400,
  providers: [
    {
      name: "ollama",
      tier: "local",
      status: "ok",
      latencyMs: 42,
      cpuPct: 34,
      ramPct: 58,
      models: ["qwen2.5:7b", "qwen2.5-coder:7b", "mistral:7b"],
    },
    {
      name: "lm-studio",
      tier: "local",
      status: "ok",
      latencyMs: 67,
      cpuPct: 12,
      ramPct: 30,
      models: ["llama3:8b"],
    },
    {
      name: "llama-server",
      tier: "specialist",
      status: "ok",
      latencyMs: 210,
      cpuPct: 72,
      ramPct: 81,
      models: ["llama3.3:70b"],
    },
    {
      name: "openai",
      tier: "cloud",
      status: "ok",
      latencyMs: 620,
      models: ["gpt-4o", "gpt-4o-mini"],
    },
    { name: "anthropic", tier: "cloud", status: "error", latencyMs: 0, models: [] },
  ],
};

// ── component ──────────────────────────────────────────────────────────────────

export default function MeshScreen() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setOffline(false);
    const base = (await AsyncStorage.getItem("lf_api_url")) ?? "http://localhost:4141";
    try {
      const res = await fetch(`${base}/v1/health`);
      if (!res.ok) {
        if (__DEV__) {
          const body = await res.text().catch(() => "");
          console.error("[MeshScreen] Health check failed", { status: res.status, body });
        }
        throw new Error(`Health check returned HTTP ${res.status}`);
      }
      const data = (await res.json()) as HealthData;
      setHealth(data);
    } catch {
      setOffline(true);
      // Keep stale health data visible if available; fall back to mock only on first load.
      // Use functional updater to avoid closing over `health` and causing an infinite effect loop.
      setHealth((prev) => prev ?? MOCK_HEALTH);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const h = health ?? MOCK_HEALTH;

  return (
    <SafeAreaView style={s.container}>
      {offline && (
        <View style={s.offlineBanner}>
          <Text style={s.offlineBannerText}>⚠ API unreachable — showing cached data</Text>
        </View>
      )}
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor="#10b981" />
        }
      >
        {/* Cluster overview */}
        <View style={s.overviewCard}>
          <View style={s.overviewRow}>
            <View style={[s.statusDot, { backgroundColor: statusColor(h.status) }]} />
            <Text style={s.overviewTitle}>LokaFlow Mesh {h.version}</Text>
          </View>
          <Text style={s.overviewSub}>Uptime {fmtUptime(h.uptime)}</Text>
          <View style={s.countersRow}>
            {(["local", "specialist", "cloud"] as const).map((tier) => {
              const count = h.providers.filter((p) => p.tier === tier).length;
              const ok = h.providers.filter((p) => p.tier === tier && p.status === "ok").length;
              return (
                <View key={tier} style={[s.tierCount, { backgroundColor: tierBg(tier) }]}>
                  <Text style={[s.tierCountLabel, { color: tierTextColor(tier) }]}>
                    {tierLabel(tier)}
                  </Text>
                  <Text style={[s.tierCountVal, { color: tierTextColor(tier) }]}>
                    {ok}/{count}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Providers */}
        <Text style={s.sectionTitle}>Providers</Text>
        {h.providers.map((p) => (
          <View key={p.name} style={s.providerCard}>
            <TouchableOpacity
              style={s.providerHeader}
              onPress={() => setExpanded(expanded === p.name ? null : p.name)}
            >
              <Text style={s.providerEmoji}>{tierEmoji(p.tier)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.providerName}>{p.name}</Text>
                <Text style={[s.providerTier, { color: tierTextColor(p.tier) }]}>
                  {tierLabel(p.tier)}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <View
                  style={[
                    s.statusPill,
                    {
                      backgroundColor: statusColor(p.status) + "22",
                      borderColor: statusColor(p.status),
                    },
                  ]}
                >
                  <Text style={[s.statusText, { color: statusColor(p.status) }]}>{p.status}</Text>
                </View>
                {p.status === "ok" && <Text style={s.latency}>{p.latencyMs}ms</Text>}
              </View>
              <Text style={s.chevron}>{expanded === p.name ? "▲" : "▼"}</Text>
            </TouchableOpacity>

            {p.status === "ok" && <LatencyBar ms={p.latencyMs} tier={p.tier} />}

            {expanded === p.name && (
              <View style={s.providerDetails}>
                {p.models && p.models.length > 0 && (
                  <View style={s.detailRow}>
                    <Text style={s.detailLabel}>Models</Text>
                    <Text style={s.detailValue}>{p.models.join(", ")}</Text>
                  </View>
                )}
                {p.cpuPct !== undefined && <MiniStat label="CPU" pct={p.cpuPct} color="#6366f1" />}
                {p.ramPct !== undefined && <MiniStat label="RAM" pct={p.ramPct} color="#f59e0b" />}
                {p.batteryPct !== undefined && (
                  <MiniStat label="Battery" pct={p.batteryPct} color="#10b981" />
                )}
                {p.routingLoad !== undefined && (
                  <MiniStat label="Routing Load" pct={p.routingLoad} color="#ec4899" />
                )}
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── sub-components ─────────────────────────────────────────────────────────────

function LatencyBar({ ms, tier }: { ms: number; tier: string }) {
  const max = tier === "local" ? 300 : 800;
  const pct = Math.min(100, (ms / max) * 100);
  let color = "#10b981";
  if (tier === "cloud") color = "#f59e0b";
  else if (ms > 100) color = "#f59e0b";
  return (
    <View style={s.barWrap}>
      <View style={s.barBg}>
        <View style={[s.barFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function MiniStat({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <View style={{ marginBottom: 8 }}>
      <View style={s.miniStatLabelRow}>
        <Text style={s.miniStatLabel}>{label}</Text>
        <Text style={[s.miniStatPct, { color }]}>{pct.toFixed(0)}%</Text>
      </View>
      <View style={s.miniStatBg}>
        <View
          style={[s.miniStatFill, { width: `${Math.min(100, pct)}%`, backgroundColor: color }]}
        />
      </View>
    </View>
  );
}

// ── styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#09090b" },
  offlineBanner: {
    backgroundColor: "#7c2d12",
    paddingVertical: 8,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  offlineBannerText: { color: "#fef2f2", fontSize: 13, fontWeight: "600" },
  content: { padding: 16, paddingBottom: 32 },
  overviewCard: {
    backgroundColor: "#18181b",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#27272a",
    marginBottom: 16,
  },
  overviewRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  overviewTitle: { color: "#fafafa", fontSize: 16, fontWeight: "700" },
  overviewSub: { color: "#71717a", fontSize: 13, marginBottom: 12 },
  countersRow: { flexDirection: "row", gap: 8 },
  tierCount: { flex: 1, borderRadius: 8, padding: 10, alignItems: "center" },
  tierCountLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  tierCountVal: { fontSize: 18, fontWeight: "800", marginTop: 2 },
  sectionTitle: {
    color: "#71717a",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 10,
  },
  providerCard: {
    backgroundColor: "#18181b",
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#27272a",
    overflow: "hidden",
  },
  providerHeader: { flexDirection: "row", alignItems: "center", padding: 14, gap: 10 },
  providerEmoji: { fontSize: 20 },
  providerName: { color: "#fafafa", fontSize: 15, fontWeight: "600" },
  providerTier: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginTop: 1 },
  statusPill: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  statusText: { fontSize: 11, fontWeight: "600" },
  latency: { color: "#71717a", fontSize: 11 },
  chevron: { color: "#52525b", fontSize: 12, marginLeft: 6 },
  barWrap: { paddingHorizontal: 14, paddingBottom: 10 },
  barBg: { height: 4, backgroundColor: "#27272a", borderRadius: 99 },
  barFill: { height: 4, borderRadius: 99 },
  providerDetails: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#27272a",
  },
  detailRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  detailLabel: { color: "#71717a", fontSize: 12 },
  detailValue: { color: "#a1a1aa", fontSize: 12, flex: 1, textAlign: "right", flexShrink: 1 },
  miniStatLabelRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  miniStatLabel: { color: "#71717a", fontSize: 12 },
  miniStatPct: { fontSize: 12, fontWeight: "600" },
  miniStatBg: { height: 4, backgroundColor: "#27272a", borderRadius: 99 },
  miniStatFill: { height: 4, borderRadius: 99 },
});
