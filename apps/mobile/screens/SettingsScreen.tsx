import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  SafeAreaView,
  Alert,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ── constants ──────────────────────────────────────────────────────────────────

const LS_API_URL = "lf_api_url";
const LS_ROUTING_MODEL = "lf_routing_model";
const LS_DAILY_LIMIT = "lf_daily_limit";
const LS_MONTHLY_LIMIT = "lf_monthly_limit";
const LS_OPENAI_KEY = "lf_openai_key";
const LS_ANTHROPIC_KEY = "lf_anthropic_key";
const LS_GEMINI_KEY = "lf_gemini_key";
const LS_LOCAL_ONLY = "lf_local_only";
const LS_PII_GUARD = "lf_pii_guard";
const LS_COST_ALERTS = "lf_cost_alerts";
const LS_DARK_THEME = "lf_dark_theme";

const DEFAULT_BASE = Platform.OS === "android" ? "http://10.0.2.2:4141" : "http://localhost:4141";

const MODEL_OPTIONS = [
  { value: "auto", label: "Auto (router decides)" },
  { value: "mistral:7b", label: "Mistral 7B (local)" },
  { value: "llama3.2:8b", label: "Llama 3.2 8B (local)" },
  { value: "qwen2.5-coder:7b", label: "Qwen 2.5 Coder 7B (local)" },
  { value: "gpt-4o", label: "GPT-4o (cloud)" },
  { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4 (cloud)" },
  { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash (cloud)" },
];

type Tab =
  | "connection"
  | "routing"
  | "keys"
  | "budget"
  | "privacy"
  | "notifications"
  | "appearance";
const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id: "connection", label: "Connection", emoji: "🔗" },
  { id: "routing", label: "Routing", emoji: "⚡" },
  { id: "keys", label: "API Keys", emoji: "🔑" },
  { id: "budget", label: "Budget", emoji: "💰" },
  { id: "privacy", label: "Privacy", emoji: "🛡" },
  { id: "notifications", label: "Notifications", emoji: "🔔" },
  { id: "appearance", label: "Appearance", emoji: "🎨" },
];

// ── component ──────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const [tab, setTab] = useState<Tab>("connection");

  // Connection
  const [apiUrl, setApiUrl] = useState(DEFAULT_BASE);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");

  // Routing
  const [model, setModel] = useState("auto");

  // API Keys
  const [openaiKey, setOpenaiKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [showKeys, setShowKeys] = useState(false);

  // Budget
  const [dailyLimit, setDailyLimit] = useState("1.00");
  const [monthlyLimit, setMonthlyLimit] = useState("20.00");

  // Privacy
  const [localOnly, setLocalOnly] = useState(false);
  const [piiGuard, setPiiGuard] = useState(true);

  // Notifications
  const [costAlerts, setCostAlerts] = useState(true);

  // Appearance (dark theme always on mobile – kept for future)
  const [darkTheme, setDarkTheme] = useState(true);

  // Load from storage
  useEffect(() => {
    (async () => {
      const vals = await Promise.all([
        AsyncStorage.getItem(LS_API_URL),
        AsyncStorage.getItem(LS_ROUTING_MODEL),
        AsyncStorage.getItem(LS_DAILY_LIMIT),
        AsyncStorage.getItem(LS_MONTHLY_LIMIT),
        AsyncStorage.getItem(LS_OPENAI_KEY),
        AsyncStorage.getItem(LS_ANTHROPIC_KEY),
        AsyncStorage.getItem(LS_GEMINI_KEY),
        AsyncStorage.getItem(LS_LOCAL_ONLY),
        AsyncStorage.getItem(LS_PII_GUARD),
        AsyncStorage.getItem(LS_COST_ALERTS),
        AsyncStorage.getItem(LS_DARK_THEME),
      ]);
      if (vals[0]) setApiUrl(vals[0]);
      if (vals[1]) setModel(vals[1]);
      if (vals[2]) setDailyLimit(vals[2]);
      if (vals[3]) setMonthlyLimit(vals[3]);
      if (vals[4]) setOpenaiKey(vals[4]);
      if (vals[5]) setAnthropicKey(vals[5]);
      if (vals[6]) setGeminiKey(vals[6]);
      if (vals[7] !== null) setLocalOnly(vals[7] === "true");
      if (vals[8] !== null) setPiiGuard(vals[8] !== "false");
      if (vals[9] !== null) setCostAlerts(vals[9] !== "false");
      if (vals[10] !== null) setDarkTheme(vals[10] !== "false");
    })();
  }, []);

  async function save(key: string, value: string) {
    await AsyncStorage.setItem(key, value);
  }

  async function testConnection() {
    setTestStatus("testing");
    try {
      const res = await fetch(`${apiUrl}/health`);
      if (!res.ok) throw new Error();
      setTestStatus("ok");
    } catch {
      setTestStatus("fail");
    }
  }

  return (
    <SafeAreaView style={s.container}>
      {/* Tab bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.tabBar}
        contentContainerStyle={s.tabBarContent}
      >
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.id}
            style={[s.tab, tab === t.id && s.tabActive]}
            onPress={() => setTab(t.id)}
          >
            <Text style={s.tabEmoji}>{t.emoji}</Text>
            <Text style={[s.tabLabel, tab === t.id && s.tabLabelActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={s.content}>
        {/* ── CONNECTION ─────────────────────────────────────────────── */}
        {tab === "connection" && (
          <View>
            <SectionHeader title="LokaFlow Server" />
            <SettingLabel label="API URL" hint="Desktop address, e.g. http://192.168.1.2:4141" />
            <TextInput
              style={s.textInput}
              value={apiUrl}
              onChangeText={setApiUrl}
              onBlur={() => save(LS_API_URL, apiUrl)}
              autoCapitalize="none"
              keyboardType="url"
              placeholder="http://localhost:4141"
              placeholderTextColor="#52525b"
            />
            <TouchableOpacity
              style={[s.btn, testStatus === "ok" && s.btnGreen, testStatus === "fail" && s.btnRed]}
              onPress={testConnection}
            >
              <Text style={s.btnText}>
                {testStatus === "idle"
                  ? "🔌 Test Connection"
                  : testStatus === "testing"
                    ? "⏳ Testing…"
                    : testStatus === "ok"
                      ? "✅ Connected"
                      : "❌ Failed — check URL"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── ROUTING ────────────────────────────────────────────────── */}
        {tab === "routing" && (
          <View>
            <SectionHeader title="Default Model" />
            <SettingLabel
              label="Preferred model"
              hint="Used when router cannot decide automatically"
            />
            {MODEL_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[s.radioRow, model === opt.value && s.radioRowActive]}
                onPress={() => {
                  setModel(opt.value);
                  save(LS_ROUTING_MODEL, opt.value);
                }}
              >
                <View style={[s.radioDot, model === opt.value && s.radioDotActive]} />
                <Text style={[s.radioLabel, model === opt.value && s.radioLabelActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}

            <SectionHeader title="Routing Rules" />
            <View style={s.ruleCard}>
              {[
                { cat: "Coding", strategy: "always-local", model: "qwen2.5-coder:7b" },
                { cat: "Document AI", strategy: "always-local", model: "qwen2.5:7b" },
                { cat: "Compliance", strategy: "smart", model: "auto" },
                { cat: "Creative", strategy: "smart", model: "auto" },
              ].map((r, i, arr) => (
                <View key={r.cat} style={[s.ruleRow, i < arr.length - 1 && s.ruleRowBorder]}>
                  <Text style={s.ruleCategory}>{r.cat}</Text>
                  <Text style={s.ruleStrategy}>{r.strategy}</Text>
                  <Text style={s.ruleModel}>{r.model}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── API KEYS ───────────────────────────────────────────────── */}
        {tab === "keys" && (
          <View>
            <SectionHeader title="Cloud Provider Keys" />
            <View style={s.warningBanner}>
              <Text style={s.warningText}>🔒 Keys are stored locally on device only.</Text>
            </View>
            <TouchableOpacity onPress={() => setShowKeys(!showKeys)} style={s.toggleKeysBtn}>
              <Text style={s.toggleKeysText}>{showKeys ? "🙈 Hide keys" : "👁 Show keys"}</Text>
            </TouchableOpacity>

            <SettingLabel label="OpenAI" hint="sk-..." />
            <TextInput
              style={s.textInput}
              value={openaiKey}
              onChangeText={setOpenaiKey}
              onBlur={() => save(LS_OPENAI_KEY, openaiKey)}
              placeholder="sk-..."
              placeholderTextColor="#52525b"
              secureTextEntry={!showKeys}
              autoCapitalize="none"
            />

            <SettingLabel label="Anthropic" hint="sk-ant-..." />
            <TextInput
              style={s.textInput}
              value={anthropicKey}
              onChangeText={setAnthropicKey}
              onBlur={() => save(LS_ANTHROPIC_KEY, anthropicKey)}
              placeholder="sk-ant-..."
              placeholderTextColor="#52525b"
              secureTextEntry={!showKeys}
              autoCapitalize="none"
            />

            <SettingLabel label="Google Gemini" hint="AIza..." />
            <TextInput
              style={s.textInput}
              value={geminiKey}
              onChangeText={setGeminiKey}
              onBlur={() => save(LS_GEMINI_KEY, geminiKey)}
              placeholder="AIza..."
              placeholderTextColor="#52525b"
              secureTextEntry={!showKeys}
              autoCapitalize="none"
            />
          </View>
        )}

        {/* ── BUDGET ─────────────────────────────────────────────────── */}
        {tab === "budget" && (
          <View>
            <SectionHeader title="Spending Limits" />
            <SettingLabel
              label="Daily limit (€)"
              hint="Stop routing to cloud after this amount today"
            />
            <TextInput
              style={s.textInput}
              value={dailyLimit}
              onChangeText={setDailyLimit}
              onBlur={() => save(LS_DAILY_LIMIT, dailyLimit)}
              keyboardType="decimal-pad"
              placeholder="1.00"
              placeholderTextColor="#52525b"
            />
            <SettingLabel label="Monthly limit (€)" hint="Hard cap for the entire calendar month" />
            <TextInput
              style={s.textInput}
              value={monthlyLimit}
              onChangeText={setMonthlyLimit}
              onBlur={() => save(LS_MONTHLY_LIMIT, monthlyLimit)}
              keyboardType="decimal-pad"
              placeholder="20.00"
              placeholderTextColor="#52525b"
            />
          </View>
        )}

        {/* ── PRIVACY ────────────────────────────────────────────────── */}
        {tab === "privacy" && (
          <View>
            <SectionHeader title="Data Controls" />
            <ToggleSetting
              label="Local-only mode"
              description="Never route any query to cloud providers, even if complexity is high."
              value={localOnly}
              onChange={(v) => {
                setLocalOnly(v);
                save(LS_LOCAL_ONLY, String(v));
              }}
            />
            <ToggleSetting
              label="PII guard"
              description="Scan prompts for personal data (IBAN, BSN, patient data) before sending to cloud."
              value={piiGuard}
              onChange={(v) => {
                setPiiGuard(v);
                save(LS_PII_GUARD, String(v));
              }}
            />
          </View>
        )}

        {/* ── NOTIFICATIONS ──────────────────────────────────────────── */}
        {tab === "notifications" && (
          <View>
            <SectionHeader title="Alerts" />
            <ToggleSetting
              label="Budget alerts"
              description="Notify when daily or monthly spending reaches 80% of limit."
              value={costAlerts}
              onChange={(v) => {
                setCostAlerts(v);
                save(LS_COST_ALERTS, String(v));
              }}
            />
          </View>
        )}

        {/* ── APPEARANCE ─────────────────────────────────────────────── */}
        {tab === "appearance" && (
          <View>
            <SectionHeader title="Theme" />
            <ToggleSetting
              label="Dark theme"
              description="LokaFlow mobile uses dark theme. Light theme coming in a future update."
              value={darkTheme}
              onChange={(v) => {
                setDarkTheme(v);
                save(LS_DARK_THEME, String(v));
              }}
            />
            <View style={s.versionCard}>
              <Text style={s.versionLabel}>App version</Text>
              <Text style={s.versionValue}>LokaMobile 2.8.0</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── sub-components ─────────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return <Text style={s.sectionHeader}>{title}</Text>;
}

function SettingLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <View style={s.labelWrap}>
      <Text style={s.label}>{label}</Text>
      {hint && <Text style={s.hint}>{hint}</Text>}
    </View>
  );
}

function ToggleSetting({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={s.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={s.toggleLabel}>{label}</Text>
        <Text style={s.toggleDesc}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: "#27272a", true: "#064e3b" }}
        thumbColor={value ? "#10b981" : "#71717a"}
      />
    </View>
  );
}

// ── styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#09090b" },
  tabBar: { maxHeight: 56, borderBottomWidth: 1, borderBottomColor: "#27272a" },
  tabBarContent: { paddingHorizontal: 8, alignItems: "center" },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 4,
  },
  tabActive: { borderBottomWidth: 2, borderBottomColor: "#10b981" },
  tabEmoji: { fontSize: 14 },
  tabLabel: { color: "#71717a", fontSize: 13, fontWeight: "500" },
  tabLabelActive: { color: "#10b981" },
  content: { padding: 16, paddingBottom: 40 },
  sectionHeader: {
    color: "#71717a",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 20,
    marginBottom: 10,
  },
  labelWrap: { marginBottom: 6 },
  label: { color: "#a1a1aa", fontSize: 14, fontWeight: "500" },
  hint: { color: "#52525b", fontSize: 12, marginTop: 1 },
  textInput: {
    backgroundColor: "#18181b",
    color: "#fafafa",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#27272a",
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    marginBottom: 14,
  },
  btn: {
    backgroundColor: "#27272a",
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
    marginBottom: 14,
  },
  btnGreen: { backgroundColor: "#064e3b" },
  btnRed: { backgroundColor: "#450a0a" },
  btnText: { color: "#fafafa", fontSize: 14, fontWeight: "600" },
  // Radio
  radioRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 4,
    backgroundColor: "#18181b",
    borderWidth: 1,
    borderColor: "#27272a",
  },
  radioRowActive: { borderColor: "#10b981", backgroundColor: "#064e3b22" },
  radioDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: "#71717a" },
  radioDotActive: { borderColor: "#10b981", backgroundColor: "#10b981" },
  radioLabel: { color: "#a1a1aa", fontSize: 14 },
  radioLabelActive: { color: "#fafafa", fontWeight: "600" },
  // Rule card
  ruleCard: {
    backgroundColor: "#18181b",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#27272a",
    marginTop: 4,
  },
  ruleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  ruleRowBorder: { borderBottomWidth: 1, borderBottomColor: "#27272a" },
  ruleCategory: { flex: 1, color: "#fafafa", fontSize: 13, fontWeight: "500" },
  ruleStrategy: { color: "#71717a", fontSize: 12, marginRight: 10 },
  ruleModel: { color: "#6366f1", fontSize: 12, fontWeight: "600" },
  // Warning
  warningBanner: { backgroundColor: "#422006", borderRadius: 10, padding: 12, marginBottom: 12 },
  warningText: { color: "#fcd34d", fontSize: 13 },
  toggleKeysBtn: { marginBottom: 14 },
  toggleKeysText: { color: "#6366f1", fontSize: 14 },
  // Toggle
  toggleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "#18181b",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#27272a",
    marginBottom: 10,
  },
  toggleLabel: { color: "#fafafa", fontSize: 14, fontWeight: "600", marginBottom: 2 },
  toggleDesc: { color: "#71717a", fontSize: 12, lineHeight: 18 },
  // Version
  versionCard: {
    backgroundColor: "#18181b",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#27272a",
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  versionLabel: { color: "#71717a", fontSize: 13 },
  versionValue: { color: "#a1a1aa", fontSize: 13, fontWeight: "600" },
});
