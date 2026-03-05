import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  ActivityIndicator,
  Modal,
  FlatList,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ── types ──────────────────────────────────────────────────────────────────────

interface RunResult {
  output: string;
  latencyMs: number;
  tokens: number;
  costEur: number;
  rating: number;
}

interface BenchmarkEntry {
  category: string;
  winner: string;
  avgRating: number;
  queryCount: number;
  avgLatencyMs: number;
}

// ── constants (mirror web) ─────────────────────────────────────────────────────

const MODELS_LOCAL = [
  "qwen2.5:7b",
  "qwen2.5-coder:7b",
  "tinyllama:1.1b",
  "mistral:7b",
  "llama3:8b",
  "phi:latest",
];
const MODELS_ALL = [...MODELS_LOCAL, "gemini-2.0-flash", "claude-3-haiku", "gpt-4o-mini"];

const DEMO_BENCHMARK: BenchmarkEntry[] = [
  {
    category: "Compliance analysis",
    winner: "qwen2.5:7b",
    avgRating: 4.2,
    queryCount: 14,
    avgLatencyMs: 4200,
  },
  {
    category: "Code generation",
    winner: "qwen2.5-coder:7b",
    avgRating: 4.6,
    queryCount: 22,
    avgLatencyMs: 3100,
  },
  {
    category: "Summarisation",
    winner: "mistral:7b",
    avgRating: 4.1,
    queryCount: 9,
    avgLatencyMs: 2800,
  },
  {
    category: "Creative writing",
    winner: "gemini-2.0-flash",
    avgRating: 4.5,
    queryCount: 6,
    avgLatencyMs: 19000,
  },
];

// ── helpers ────────────────────────────────────────────────────────────────────

function fmtEur(v: number): string {
  if (v === 0) return "€0.00";
  if (v < 0.01) return `${(v * 100).toFixed(2)}¢`;
  return `€${v.toFixed(3)}`;
}

function fmtMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function isCloud(model: string): boolean {
  return model.includes("gemini") || model.includes("claude") || model.includes("gpt");
}

async function mockRun(model: string, prompt: string, apiBase: string): Promise<RunResult> {
  const isCloudModel = isCloud(model);
  const baseLatency = isCloudModel ? 8000 + Math.random() * 15000 : 1500 + Math.random() * 5000;
  const tokens = Math.ceil(prompt.length / 3) + Math.floor(Math.random() * 300) + 100;
  const costEur = isCloudModel ? (tokens / 1000) * 0.002 : 0;
  const serverLabel =
    apiBase && apiBase.trim().length > 0 ? apiBase.trim() : "your LokaFlow server";

  return new Promise((resolve) => {
    setTimeout(
      () => {
        resolve({
          output: `[Mock — ${model}]\n\nSimulated response to:\n"${prompt.slice(0, 60)}…"\n\nConnect to a real LokaFlow server at ${serverLabel} for live inference.`,
          latencyMs: Math.round(baseLatency),
          tokens,
          costEur,
          rating: 0,
        });
      },
      Math.min(baseLatency, 2000),
    );
  });
}

// ── component ──────────────────────────────────────────────────────────────────

export default function PlaygroundScreen() {
  const [modelA, setModelA] = useState("qwen2.5:7b");
  const [modelB, setModelB] = useState("qwen2.5-coder:7b");
  const [prompt, setPrompt] = useState("");
  const [resultA, setResultA] = useState<RunResult | null>(null);
  const [resultB, setResultB] = useState<RunResult | null>(null);
  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);
  const [benchmark, setBenchmark] = useState<BenchmarkEntry[]>(DEMO_BENCHMARK);
  const [pickerFor, setPickerFor] = useState<"A" | "B" | null>(null);

  async function run() {
    if (!prompt.trim()) return;
    const base = (await AsyncStorage.getItem("lf_api_url")) ?? "http://localhost:4141";
    setLoadingA(true);
    setLoadingB(true);
    setResultA(null);
    setResultB(null);
    const [rA, rB] = await Promise.all([
      mockRun(modelA, prompt, base).finally(() => setLoadingA(false)),
      mockRun(modelB, prompt, base).finally(() => setLoadingB(false)),
    ]);
    setResultA(rA);
    setResultB(rB);
  }

  function reset() {
    setPrompt("");
    setResultA(null);
    setResultB(null);
  }

  function rateResult(which: "A" | "B", stars: number) {
    if (which === "A") setResultA((prev) => (prev ? { ...prev, rating: stars } : null));
    else setResultB((prev) => (prev ? { ...prev, rating: stars } : null));
  }

  function submitRating() {
    if (!resultA || !resultB) return;
    const winner =
      resultA.rating > resultB.rating ? modelA : resultB.rating > resultA.rating ? modelB : "tie";
    const category = prompt.toLowerCase().includes("code")
      ? "Code generation"
      : prompt.toLowerCase().includes("legal") || prompt.toLowerCase().includes("compliance")
        ? "Compliance analysis"
        : "General";
    const exists = benchmark.find((b) => b.category === category);
    if (exists) {
      setBenchmark(
        benchmark.map((b) =>
          b.category === category
            ? {
                ...b,
                winner,
                queryCount: b.queryCount + 1,
                avgRating:
                  (b.avgRating * b.queryCount + Math.max(resultA.rating, resultB.rating)) /
                  (b.queryCount + 1),
                avgLatencyMs: Math.round(
                  (b.avgLatencyMs * b.queryCount + (resultA.latencyMs + resultB.latencyMs) / 2) /
                    (b.queryCount + 1),
                ),
              }
            : b,
        ),
      );
    } else {
      setBenchmark([
        ...benchmark,
        {
          category,
          winner,
          avgRating: Math.max(resultA.rating, resultB.rating),
          queryCount: 1,
          avgLatencyMs: Math.round((resultA.latencyMs + resultB.latencyMs) / 2),
        },
      ]);
    }
  }

  const bothDone = resultA && resultB;
  const rated = (resultA?.rating ?? 0) > 0 || (resultB?.rating ?? 0) > 0;

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {/* Model selectors */}
        <View style={s.modelsRow}>
          <ModelPicker label="Model A" value={modelA} onPress={() => setPickerFor("A")} />
          <View style={s.vsDivider}>
            <Text style={s.vsText}>VS</Text>
          </View>
          <ModelPicker label="Model B" value={modelB} onPress={() => setPickerFor("B")} />
        </View>

        {/* Prompt */}
        <Text style={s.inputLabel}>Prompt</Text>
        <TextInput
          style={s.promptInput}
          value={prompt}
          onChangeText={setPrompt}
          placeholder="Enter your prompt here to compare models side-by-side…"
          placeholderTextColor="#52525b"
          multiline
          textAlignVertical="top"
        />
        <View style={s.actionRow}>
          <TouchableOpacity
            style={[s.runBtn, (!prompt.trim() || loadingA || loadingB) && s.runBtnDisabled]}
            onPress={run}
            disabled={!prompt.trim() || loadingA || loadingB}
          >
            <Text style={s.runBtnText}>▶ Run Both</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.resetBtn} onPress={reset}>
            <Text style={s.resetBtnText}>↺ Reset</Text>
          </TouchableOpacity>
        </View>

        {/* Results */}
        {(resultA || resultB || loadingA || loadingB) && (
          <View style={s.resultsGrid}>
            <ResultPane
              label="Model A"
              model={modelA}
              result={resultA}
              loading={loadingA}
              onRate={(stars) => rateResult("A", stars)}
            />
            <ResultPane
              label="Model B"
              model={modelB}
              result={resultB}
              loading={loadingB}
              onRate={(stars) => rateResult("B", stars)}
            />
          </View>
        )}

        {bothDone && rated && (
          <TouchableOpacity style={s.submitRatingBtn} onPress={submitRating}>
            <Text style={s.submitRatingText}>🏆 Submit rating to benchmark</Text>
          </TouchableOpacity>
        )}

        {/* Benchmark */}
        <Text style={s.sectionTitle}>Benchmark Leaderboard</Text>
        <View style={s.benchmarkCard}>
          {benchmark.map((b, i) => (
            <View
              key={b.category}
              style={[s.benchRow, i < benchmark.length - 1 && s.benchRowBorder]}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.benchCategory}>{b.category}</Text>
                <Text style={s.benchWinner}>🏆 {b.winner}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={s.benchRating}>★ {b.avgRating.toFixed(1)}</Text>
                <Text style={s.benchMeta}>
                  {b.queryCount} runs · {fmtMs(b.avgLatencyMs)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Model picker modal */}
      <Modal visible={!!pickerFor} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Select Model {pickerFor}</Text>
              <TouchableOpacity onPress={() => setPickerFor(null)}>
                <Text style={s.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={MODELS_ALL}
              keyExtractor={(m) => m}
              renderItem={({ item }) => {
                const current = pickerFor === "A" ? modelA : modelB;
                return (
                  <TouchableOpacity
                    style={[s.pickerRow, item === current && s.pickerRowActive]}
                    onPress={() => {
                      if (pickerFor === "A") setModelA(item);
                      else setModelB(item);
                      setPickerFor(null);
                    }}
                  >
                    <Text style={[s.pickerLabel, item === current && s.pickerLabelActive]}>
                      {isCloud(item) ? "☁ " : "🖥 "}
                      {item}
                    </Text>
                    {item === current && <Text style={s.checkmark}>✓</Text>}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── sub-components ─────────────────────────────────────────────────────────────

function ModelPicker({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={s.modelPicker} onPress={onPress}>
      <Text style={s.modelPickerLabel}>{label}</Text>
      <Text style={s.modelPickerValue} numberOfLines={1}>
        {value} ▾
      </Text>
    </TouchableOpacity>
  );
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity key={star} onPress={() => onChange(star)}>
          <Text style={{ fontSize: 20, color: value >= star ? "#fbbf24" : "#27272a" }}>★</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function ResultPane({
  label,
  model,
  result,
  loading,
  onRate,
}: {
  label: string;
  model: string;
  result: RunResult | null;
  loading: boolean;
  onRate: (stars: number) => void;
}) {
  return (
    <View style={s.pane}>
      <Text style={s.paneLabel}>{label}</Text>
      <Text style={s.paneModel} numberOfLines={1}>
        {model}
      </Text>
      {loading ? (
        <View style={s.paneLoading}>
          <ActivityIndicator color="#10b981" />
          <Text style={s.paneLoadingText}>Running…</Text>
        </View>
      ) : result ? (
        <>
          <Text style={s.paneMeta}>
            {fmtMs(result.latencyMs)} · {result.tokens} tok · {fmtEur(result.costEur)}
          </Text>
          <ScrollView style={s.paneOutput} nestedScrollEnabled>
            <Text style={s.paneOutputText}>{result.output}</Text>
          </ScrollView>
          <Text style={s.rateLabel}>Rate:</Text>
          <StarRating value={result.rating} onChange={onRate} />
        </>
      ) : null}
    </View>
  );
}

// ── styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#09090b" },
  content: { padding: 16, paddingBottom: 40 },
  modelsRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 },
  modelPicker: {
    flex: 1,
    backgroundColor: "#18181b",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#27272a",
  },
  modelPickerLabel: { color: "#71717a", fontSize: 11, marginBottom: 2 },
  modelPickerValue: { color: "#fafafa", fontSize: 13, fontWeight: "600" },
  vsDivider: { justifyContent: "center", alignItems: "center", width: 32 },
  vsText: { color: "#52525b", fontSize: 12, fontWeight: "800" },
  inputLabel: {
    color: "#71717a",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  promptInput: {
    backgroundColor: "#18181b",
    color: "#fafafa",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#27272a",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    minHeight: 100,
    marginBottom: 12,
  },
  actionRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  runBtn: {
    flex: 1,
    backgroundColor: "#10b981",
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
  },
  runBtnDisabled: { opacity: 0.4 },
  runBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  resetBtn: {
    backgroundColor: "#27272a",
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 18,
    alignItems: "center",
  },
  resetBtnText: { color: "#a1a1aa", fontWeight: "600", fontSize: 15 },
  // Results
  resultsGrid: { flexDirection: "row", gap: 8, marginBottom: 12 },
  pane: {
    flex: 1,
    backgroundColor: "#18181b",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#27272a",
  },
  paneLabel: {
    color: "#71717a",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: 2,
  },
  paneModel: { color: "#fafafa", fontSize: 12, fontWeight: "600", marginBottom: 6 },
  paneLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 20,
    justifyContent: "center",
  },
  paneLoadingText: { color: "#71717a", fontSize: 12 },
  paneMeta: { color: "#52525b", fontSize: 10, marginBottom: 8 },
  paneOutput: { maxHeight: 150, marginBottom: 8 },
  paneOutputText: { color: "#d4d4d8", fontSize: 12, lineHeight: 18 },
  rateLabel: { color: "#71717a", fontSize: 11, marginBottom: 4 },
  submitRatingBtn: {
    backgroundColor: "#064e3b",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 16,
  },
  submitRatingText: { color: "#10b981", fontWeight: "700", fontSize: 14 },
  // Benchmark
  sectionTitle: {
    color: "#71717a",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 10,
  },
  benchmarkCard: {
    backgroundColor: "#18181b",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#27272a",
  },
  benchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  benchRowBorder: { borderBottomWidth: 1, borderBottomColor: "#27272a" },
  benchCategory: { color: "#fafafa", fontSize: 13, fontWeight: "600", marginBottom: 2 },
  benchWinner: { color: "#10b981", fontSize: 12 },
  benchRating: { color: "#fbbf24", fontSize: 14, fontWeight: "700", marginBottom: 2 },
  benchMeta: { color: "#52525b", fontSize: 11 },
  // Picker modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,.75)", justifyContent: "flex-end" },
  modalBox: {
    backgroundColor: "#18181b",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "65%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#27272a",
  },
  modalTitle: { color: "#fafafa", fontSize: 16, fontWeight: "700" },
  modalClose: { color: "#71717a", fontSize: 18 },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#27272a",
  },
  pickerRowActive: { backgroundColor: "#064e3b22" },
  pickerLabel: { flex: 1, color: "#a1a1aa", fontSize: 14 },
  pickerLabelActive: { color: "#10b981", fontWeight: "600" },
  checkmark: { color: "#10b981", fontSize: 16, fontWeight: "700" },
});
