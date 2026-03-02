import React, { useState, useMemo, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  FlatList,
  Modal,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ── types ──────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  trace?: {
    tier: string;
    model: string;
    costEur: number;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
  };
}

interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
}

interface SearchResult {
  session: ChatSession;
  message: Message;
  score: number;
}

// ── helpers ────────────────────────────────────────────────────────────────────

function fmtDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmtEur(v: number): string {
  if (v === 0) return "€0.00";
  if (v < 0.01) return `€${(v * 100).toFixed(2)}¢`;
  return `€${v.toFixed(3)}`;
}

function fmtMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

// ── component ──────────────────────────────────────────────────────────────────

export default function HistoryScreen() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [query, setQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<"all" | "local" | "cloud">("all");
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null);

  useEffect(() => {
    AsyncStorage.getItem("lf_chat_sessions").then((raw: string | null) => {
      setSessions(raw ? JSON.parse(raw) : []);
    });
  }, []);

  const results = useMemo((): SearchResult[] => {
    const q = query.toLowerCase().trim();
    const out: SearchResult[] = [];
    for (const session of sessions) {
      for (const msg of session.messages) {
        const tierOk = tierFilter === "all" || (msg.trace?.tier ?? "local") === tierFilter;
        if (!tierOk) continue;
        if (!q) {
          out.push({ session, message: msg, score: session.updatedAt });
          continue;
        }
        const content = msg.content.toLowerCase();
        if (content.includes(q)) {
          const idx = content.indexOf(q);
          out.push({ session, message: msg, score: (idx === 0 ? 2 : 1) * session.updatedAt });
        }
      }
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 50);
  }, [sessions, query, tierFilter]);

  // Aggregate stats
  const totalQueries = sessions.reduce(
    (a, s) => a + s.messages.filter((m) => m.role === "user").length,
    0,
  );
  const totalCost = sessions.reduce(
    (a, s) => a + s.messages.reduce((b, m) => b + (m.trace?.costEur ?? 0), 0),
    0,
  );

  return (
    <SafeAreaView style={s.container}>
      {/* Search bar */}
      <View style={s.searchRow}>
        <TextInput
          style={s.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search your conversations…"
          placeholderTextColor="#52525b"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery("")} style={s.clearBtn}>
            <Text style={s.clearBtnText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tier filter */}
      <View style={s.filterRow}>
        {(["all", "local", "cloud"] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[s.filterBtn, tierFilter === f && s.filterBtnActive]}
            onPress={() => setTierFilter(f)}
          >
            <Text style={[s.filterText, tierFilter === f && s.filterTextActive]}>
              {f === "local" ? "🖥 Local" : f === "cloud" ? "☁ Cloud" : "All"}
            </Text>
          </TouchableOpacity>
        ))}
        <View style={s.statsRow}>
          <Text style={s.statsText}>
            {totalQueries} queries · {fmtEur(totalCost)}
          </Text>
        </View>
      </View>

      {sessions.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>No history yet</Text>
          <Text style={s.emptyDesc}>Start chatting to accumulate conversation history here.</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => `${item.session.id}-${item.message.id}`}
          contentContainerStyle={s.list}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.resultCard} onPress={() => setSelectedSession(item.session)}>
              <View style={s.resultHeader}>
                <Text style={s.resultSession} numberOfLines={1}>
                  {item.session.title}
                </Text>
                <Text style={s.resultDate}>{fmtDate(item.session.updatedAt)}</Text>
              </View>
              <View style={s.roleRow}>
                <View
                  style={[
                    s.roleBadge,
                    item.message.role === "user" ? s.roleBadgeUser : s.roleBadgeBot,
                  ]}
                >
                  <Text style={s.roleText}>{item.message.role === "user" ? "You" : "AI"}</Text>
                </View>
                <Text style={s.resultContent} numberOfLines={2}>
                  {item.message.content}
                </Text>
              </View>
              {item.message.trace && (
                <View style={s.traceRow}>
                  <Text style={s.traceText}>
                    {item.message.trace.tier === "local" ? "🖥" : "☁"}
                    {"  "}
                    {item.message.trace.model}
                    {"  ·  "}
                    {fmtEur(item.message.trace.costEur)}
                    {"  ·  "}
                    {fmtMs(item.message.trace.latencyMs)}
                    {"  ·  "}
                    {item.message.trace.inputTokens}+{item.message.trace.outputTokens} tok
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        />
      )}

      {/* Session detail modal */}
      <Modal visible={!!selectedSession} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle} numberOfLines={1}>
                {selectedSession?.title}
              </Text>
              <TouchableOpacity onPress={() => setSelectedSession(null)}>
                <Text style={s.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={s.modalScroll} contentContainerStyle={s.modalContent}>
              {selectedSession?.messages.map((msg) => (
                <View
                  key={msg.id}
                  style={[s.msgBubble, msg.role === "user" ? s.msgUser : s.msgBot]}
                >
                  <Text style={[s.msgText, msg.role === "user" ? s.msgTextUser : s.msgTextBot]}>
                    {msg.content}
                  </Text>
                  {msg.trace && (
                    <Text style={s.msgTrace}>
                      {msg.trace.model} · {fmtEur(msg.trace.costEur)} · {fmtMs(msg.trace.latencyMs)}
                    </Text>
                  )}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#09090b" },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#27272a",
  },
  searchInput: {
    flex: 1,
    backgroundColor: "#18181b",
    color: "#fafafa",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#27272a",
  },
  clearBtn: { paddingLeft: 10 },
  clearBtnText: { color: "#71717a", fontSize: 16 },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#27272a",
  },
  filterBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#18181b",
    borderWidth: 1,
    borderColor: "#27272a",
  },
  filterBtnActive: { backgroundColor: "#064e3b", borderColor: "#10b981" },
  filterText: { color: "#71717a", fontSize: 12 },
  filterTextActive: { color: "#10b981", fontWeight: "600" },
  statsRow: { flex: 1, alignItems: "flex-end" },
  statsText: { color: "#52525b", fontSize: 11 },
  list: { padding: 12, gap: 8, paddingBottom: 32 },
  resultCard: {
    backgroundColor: "#18181b",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#27272a",
  },
  resultHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  resultSession: { color: "#71717a", fontSize: 12, flex: 1 },
  resultDate: { color: "#52525b", fontSize: 11 },
  roleRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 6 },
  roleBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginTop: 1 },
  roleBadgeUser: { backgroundColor: "#27272a" },
  roleBadgeBot: { backgroundColor: "#064e3b" },
  roleText: { color: "#fafafa", fontSize: 10, fontWeight: "700" },
  resultContent: { flex: 1, color: "#d4d4d8", fontSize: 13, lineHeight: 19 },
  traceRow: { paddingTop: 4, borderTopWidth: 1, borderTopColor: "#27272a" },
  traceText: { color: "#52525b", fontSize: 11 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  emptyTitle: { color: "#fafafa", fontSize: 18, fontWeight: "700", marginBottom: 8 },
  emptyDesc: { color: "#71717a", fontSize: 14, textAlign: "center", lineHeight: 22 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,.75)", justifyContent: "flex-end" },
  modalBox: {
    backgroundColor: "#18181b",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#27272a",
  },
  modalTitle: { color: "#fafafa", fontSize: 16, fontWeight: "700", flex: 1, marginRight: 8 },
  modalClose: { color: "#71717a", fontSize: 18 },
  modalScroll: { maxHeight: 500 },
  modalContent: { padding: 16, gap: 10, paddingBottom: 40 },
  msgBubble: { borderRadius: 14, padding: 12, maxWidth: "85%" },
  msgUser: { alignSelf: "flex-end", backgroundColor: "#27272a", borderBottomRightRadius: 4 },
  msgBot: { alignSelf: "flex-start", backgroundColor: "#064e3b", borderBottomLeftRadius: 4 },
  msgText: { fontSize: 14, lineHeight: 20 },
  msgTextUser: { color: "#fafafa" },
  msgTextBot: { color: "#ecfdf5" },
  msgTrace: { color: "#6ee7b7", fontSize: 10, marginTop: 4, opacity: 0.7 },
});
