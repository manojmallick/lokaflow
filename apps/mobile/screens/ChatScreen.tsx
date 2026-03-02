import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  FlatList,
  Alert,
  Clipboard,
  Animated,
  Easing,
  Dimensions,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

/* ── constants ──────────────────────────────────────────────────────────────── */

const DEFAULT_BASE = Platform.OS === "android" ? "http://10.0.2.2:4141" : "http://localhost:4141";
const LS_SESSIONS = "lf_chat_sessions";
const LS_API_URL = "lf_api_url";
const { width: SCREEN_W } = Dimensions.get("window");

/* ── types ──────────────────────────────────────────────────────────────────── */

interface LokaFlowTrace {
  tier: string;
  model: string;
  reason: string;
  complexityScore: number;
  inputTokens: number;
  outputTokens: number;
  costEur: number;
  latencyMs: number;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  trace?: LokaFlowTrace;
  timestamp: number;
}

interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
}

/* ── helpers ────────────────────────────────────────────────────────────────── */

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function fmtEur(v: number) {
  return v === 0 ? "€0" : v < 0.01 ? `€${(v * 100).toFixed(2)}¢` : `€${v.toFixed(3)}`;
}
function fmtMs(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}
function fmtTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function tierColor(t: string) {
  return t === "local" ? "#10b981" : t === "specialist" ? "#f59e0b" : "#6366f1";
}
function tierLabel(t: string) {
  return t === "local" ? "🖥 Local" : t === "specialist" ? "⚡ Specialist" : "☁ Cloud";
}

/* ── starter suggestions ────────────────────────────────────────────────────── */

const STARTERS = [
  {
    emoji: "💡",
    label: "Explain a concept",
    prompt: "Explain how transformers work in simple terms.",
  },
  {
    emoji: "🐛",
    label: "Debug my code",
    prompt: "I have a bug in my code. Can you help me debug it?",
  },
  {
    emoji: "📝",
    label: "Write something",
    prompt: "Help me write a professional email to my team.",
  },
  {
    emoji: "🔒",
    label: "GDPR question",
    prompt: "What are the key GDPR requirements for storing user data?",
  },
  { emoji: "⚡", label: "Optimise code", prompt: "How can I make this function faster?" },
  {
    emoji: "🧪",
    label: "Write tests",
    prompt: "Write unit tests for a function that validates email addresses.",
  },
];

/* ── smart reply suggestions ────────────────────────────────────────────────── */

function getSmartReplies(content: string): string[] {
  const lc = content.toLowerCase();
  if (lc.includes("code") || lc.includes("function") || lc.includes("```"))
    return ["Explain this in detail", "Show a simpler version", "How do I test this?"];
  if (lc.includes("error") || lc.includes("bug") || lc.includes("fail"))
    return ["How do I fix this?", "What causes this error?", "Show me an example"];
  if (lc.includes("step") || lc.includes("1.") || lc.includes("first"))
    return [
      "Tell me more about step 1",
      "What do I need to get started?",
      "Are there alternatives?",
    ];
  if (lc.includes("gdpr") || lc.includes("compliance") || lc.includes("privacy"))
    return ["What are the penalties?", "How do I become compliant?", "Give me a checklist"];
  return ["Tell me more", "Give me an example", "How does this work?"];
}

/* ── code-block detection ───────────────────────────────────────────────────── */

type Part =
  | { type: "text"; text: string }
  | { type: "code"; lang: string; code: string }
  | { type: "bold"; text: string }
  | { type: "inline_code"; text: string };

function parseParts(content: string): Part[] {
  const parts: Part[] = [];
  const blockRe = /```(\w*)\n?([\s\S]*?)```/g;
  let last = 0,
    m: RegExpExecArray | null;
  while ((m = blockRe.exec(content)) !== null) {
    if (m.index > last) parseInline(content.slice(last, m.index), parts);
    parts.push({ type: "code", lang: m[1] || "code", code: m[2].trimEnd() });
    last = m.index + m[0].length;
  }
  if (last < content.length) parseInline(content.slice(last), parts);
  return parts;
}

function parseInline(text: string, parts: Part[]) {
  const re = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let last = 0,
    m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: "text", text: text.slice(last, m.index) });
    if (m[0].startsWith("**")) parts.push({ type: "bold", text: m[0].slice(2, -2) });
    else parts.push({ type: "inline_code", text: m[0].slice(1, -1) });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: "text", text: text.slice(last) });
}

/* ── TypingDots ──────────────────────────────────────────────────────────────── */

function TypingDots() {
  const d0 = useRef(new Animated.Value(0)).current;
  const d1 = useRef(new Animated.Value(0)).current;
  const d2 = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const bounce = (v: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, {
            toValue: 1,
            duration: 300,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(v, {
            toValue: 0,
            duration: 300,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.delay(480 - delay),
        ]),
      );
    const anims = [bounce(d0, 0), bounce(d1, 160), bounce(d2, 320)];
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [d0, d1, d2]);
  const dot = (v: Animated.Value) => (
    <Animated.View
      style={{
        width: 7,
        height: 7,
        borderRadius: 4,
        backgroundColor: "#10b981",
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }],
      }}
    />
  );
  return (
    <View style={{ flexDirection: "row", gap: 5, paddingVertical: 6 }}>
      {dot(d0)}
      {dot(d1)}
      {dot(d2)}
    </View>
  );
}

/* ── CodeBlock ───────────────────────────────────────────────────────────────── */

function CodeBlock({
  lang,
  code,
  onExplain,
}: {
  lang: string;
  code: string;
  onExplain: (code: string, mode: "basic" | "detailed") => void;
}) {
  const [copied, setCopied] = useState(false);
  const [showExplain, setShowExplain] = useState(false);
  const copy = () => {
    Clipboard.setString(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <View style={cb.wrap}>
      <View style={cb.header}>
        <Text style={cb.lang}>{lang || "code"}</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity style={cb.btn} onPress={() => setShowExplain((v) => !v)}>
            <Text style={[cb.btnTxt, { color: "#10b981" }]}>📖 Explain</Text>
          </TouchableOpacity>
          <TouchableOpacity style={cb.btn} onPress={copy}>
            <Text style={cb.btnTxt}>{copied ? "✓ Copied" : "Copy"}</Text>
          </TouchableOpacity>
        </View>
      </View>
      {showExplain && (
        <View style={cb.explainRow}>
          <TouchableOpacity
            style={cb.explainOpt}
            onPress={() => {
              onExplain(code, "basic");
              setShowExplain(false);
            }}
          >
            <Text style={cb.explainOptTxt}>🟢 Basic — simple English, no jargon</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[cb.explainOpt, { borderBottomWidth: 0 }]}
            onPress={() => {
              onExplain(code, "detailed");
              setShowExplain(false);
            }}
          >
            <Text style={cb.explainOptTxt}>🔵 Detailed — line-by-line deep dive</Text>
          </TouchableOpacity>
        </View>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <Text style={cb.code}>{code}</Text>
      </ScrollView>
    </View>
  );
}

const cb = StyleSheet.create({
  wrap: {
    backgroundColor: "#0d0d0d",
    borderRadius: 10,
    overflow: "hidden",
    marginVertical: 6,
    borderWidth: 1,
    borderColor: "#3f3f46",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "#18181b",
    borderBottomWidth: 1,
    borderBottomColor: "#27272a",
  },
  lang: {
    color: "#71717a",
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  btn: { backgroundColor: "#27272a", borderRadius: 5, paddingHorizontal: 8, paddingVertical: 4 },
  btnTxt: { color: "#a1a1aa", fontSize: 11, fontWeight: "600" },
  explainRow: { borderBottomWidth: 1, borderBottomColor: "#27272a" },
  explainOpt: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#27272a",
  },
  explainOptTxt: { color: "#e4e4e7", fontSize: 13 },
  code: {
    color: "#7dd3fc",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 12.5,
    lineHeight: 20,
    padding: 12,
  },
});

/* ── RichText ─────────────────────────────────────────────────────────────────── */

function RichText({
  content,
  isUser,
  onExplain,
}: {
  content: string;
  isUser: boolean;
  onExplain: (code: string, mode: "basic" | "detailed") => void;
}) {
  const parts = parseParts(content);
  return (
    <View style={{ gap: 2 }}>
      {parts.map((p, i) => {
        if (p.type === "code")
          return <CodeBlock key={i} lang={p.lang} code={p.code} onExplain={onExplain} />;
        if (p.type === "text")
          return (
            <Text key={i} style={[rt.text, isUser && rt.userText]}>
              {p.text}
            </Text>
          );
        if (p.type === "bold")
          return (
            <Text key={i} style={[rt.text, rt.bold, isUser && rt.userText]}>
              {p.text}
            </Text>
          );
        if (p.type === "inline_code")
          return (
            <Text key={i} style={rt.inlineCode}>
              {p.text}
            </Text>
          );
        return null;
      })}
    </View>
  );
}

const rt = StyleSheet.create({
  text: { color: "#ecfdf5", fontSize: 15, lineHeight: 23 },
  userText: { color: "#fafafa" },
  bold: { fontWeight: "700" },
  inlineCode: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 13,
    backgroundColor: "#27272a",
    color: "#7dd3fc",
    borderRadius: 4,
    paddingHorizontal: 4,
  },
});

/* ── MessageBubble ───────────────────────────────────────────────────────────── */

function MessageBubble({
  msg,
  isLast,
  onRegenerate,
  onExplain,
}: {
  msg: Message;
  isLast: boolean;
  onRegenerate: () => void;
  onExplain: (code: string, mode: "basic" | "detailed") => void;
}) {
  const [expandTrace, setExpandTrace] = useState(false);
  const [copied, setCopied] = useState(false);
  const isUser = msg.role === "user";
  const copy = () => {
    Clipboard.setString(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <View style={[mb.row, isUser && mb.rowUser]}>
      {!isUser && (
        <View style={mb.avatar}>
          <Text style={mb.avatarTxt}>🤖</Text>
        </View>
      )}
      <View style={[mb.col, isUser && mb.colUser]}>
        <View style={[mb.bubble, isUser ? mb.bubbleUser : mb.bubbleBot]}>
          <RichText content={msg.content} isUser={isUser} onExplain={onExplain} />
        </View>
        <View style={[mb.meta, isUser && mb.metaUser]}>
          <Text style={mb.metaTxt}>{fmtTime(msg.timestamp)}</Text>
          {msg.trace && (
            <TouchableOpacity onPress={() => setExpandTrace((v) => !v)}>
              <Text style={[mb.tierBadge, { color: tierColor(msg.trace!.tier) }]}>
                {tierLabel(msg.trace!.tier)} · {fmtEur(msg.trace!.costEur)} ·{" "}
                {fmtMs(msg.trace!.latencyMs)}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={copy} style={mb.iconBtn}>
            <Text style={mb.iconTxt}>{copied ? "✓" : "⎘"}</Text>
          </TouchableOpacity>
          {!isUser && isLast && (
            <TouchableOpacity onPress={onRegenerate} style={mb.iconBtn}>
              <Text style={mb.iconTxt}>↻</Text>
            </TouchableOpacity>
          )}
        </View>
        {expandTrace && msg.trace && (
          <View style={mb.traceBox}>
            <Text style={mb.traceRow}>
              Model: <Text style={mb.traceVal}>{msg.trace.model}</Text>
            </Text>
            <Text style={mb.traceRow}>
              Reason: <Text style={mb.traceVal}>{msg.trace.reason}</Text>
            </Text>
            <Text style={mb.traceRow}>
              Complexity:{" "}
              <Text style={mb.traceVal}>{(msg.trace.complexityScore * 100).toFixed(0)}%</Text>
            </Text>
            <Text style={mb.traceRow}>
              Tokens:{" "}
              <Text style={mb.traceVal}>
                {msg.trace.inputTokens} in / {msg.trace.outputTokens} out
              </Text>
            </Text>
          </View>
        )}
      </View>
      {isUser && (
        <View style={mb.avatar}>
          <Text style={mb.avatarTxt}>👤</Text>
        </View>
      )}
    </View>
  );
}

const mb = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end", marginBottom: 6, paddingHorizontal: 12 },
  rowUser: { justifyContent: "flex-end" },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#27272a",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 6,
    flexShrink: 0,
  },
  avatarTxt: { fontSize: 14 },
  col: { maxWidth: SCREEN_W * 0.76 },
  colUser: { alignItems: "flex-end" },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleUser: { backgroundColor: "#27272a", borderBottomRightRadius: 4 },
  bubbleBot: { backgroundColor: "#052e16", borderBottomLeftRadius: 4 },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
    marginLeft: 4,
  },
  metaUser: { justifyContent: "flex-end", marginRight: 4, marginLeft: 0 },
  metaTxt: { color: "#52525b", fontSize: 10 },
  tierBadge: { fontSize: 10, fontWeight: "600" },
  iconBtn: { paddingHorizontal: 4 },
  iconTxt: { color: "#71717a", fontSize: 14 },
  traceBox: { backgroundColor: "#18181b", borderRadius: 8, padding: 10, marginTop: 4 },
  traceRow: { color: "#71717a", fontSize: 11, marginBottom: 2 },
  traceVal: { color: "#a1a1aa", fontWeight: "600" },
});

/* ── SmartReplies ────────────────────────────────────────────────────────────── */

function SmartReplies({ content, onSend }: { content: string; onSend: (t: string) => void }) {
  const replies = getSmartReplies(content);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={sr.row}
      contentContainerStyle={{ gap: 8, paddingHorizontal: 14 }}
    >
      {replies.map((r) => (
        <TouchableOpacity key={r} style={sr.chip} onPress={() => onSend(r)}>
          <Text style={sr.chipTxt}>{r}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const sr = StyleSheet.create({
  row: { paddingVertical: 6 },
  chip: {
    backgroundColor: "#18181b",
    borderWidth: 1,
    borderColor: "#3f3f46",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  chipTxt: { color: "#d4d4d8", fontSize: 13 },
});

/* ── WelcomeStarters ─────────────────────────────────────────────────────────── */

function WelcomeStarters({ onSend }: { onSend: (t: string) => void }) {
  return (
    <ScrollView contentContainerStyle={ws.wrap}>
      <View style={ws.logo}>
        <Text style={ws.logoTxt}>🌐</Text>
      </View>
      <Text style={ws.title}>LokaFlow AI</Text>
      <Text style={ws.sub}>Local-first intelligence · Private by default</Text>
      <View style={ws.grid}>
        {STARTERS.map((st) => (
          <TouchableOpacity key={st.label} style={ws.card} onPress={() => onSend(st.prompt)}>
            <Text style={ws.cardEmoji}>{st.emoji}</Text>
            <Text style={ws.cardLabel}>{st.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const ws = StyleSheet.create({
  wrap: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 0 },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#052e16",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  logoTxt: { fontSize: 28 },
  title: { color: "#fafafa", fontSize: 22, fontWeight: "700", marginBottom: 4 },
  sub: { color: "#71717a", fontSize: 13, marginBottom: 24, textAlign: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" },
  card: {
    width: (SCREEN_W - 72) / 2,
    backgroundColor: "#18181b",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  cardEmoji: { fontSize: 22 },
  cardLabel: { color: "#d4d4d8", fontSize: 13, fontWeight: "600" },
});

/* ── ChatScreen ──────────────────────────────────────────────────────────────── */

function newSession(): ChatSession {
  return {
    id: uid(),
    title: "New chat",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
  };
}

export default function ChatScreen() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeId, setActiveId] = useState("");
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [apiBase, setApiBase] = useState(DEFAULT_BASE);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    (async () => {
      const [raw, url] = await Promise.all([
        AsyncStorage.getItem(LS_SESSIONS),
        AsyncStorage.getItem(LS_API_URL),
      ]);
      if (url) setApiBase(url);
      const loaded: ChatSession[] = raw ? JSON.parse(raw) : [];
      if (!loaded.length) {
        const s = newSession();
        setSessions([s]);
        setActiveId(s.id);
        await AsyncStorage.setItem(LS_SESSIONS, JSON.stringify([s]));
      } else {
        setSessions(loaded);
        setActiveId(loaded[0].id);
      }
    })();
  }, []);

  const active = sessions.find((s) => s.id === activeId) ?? sessions[0];
  const messages = active?.messages ?? [];

  async function persist(updated: ChatSession[]) {
    setSessions(updated);
    await AsyncStorage.setItem(LS_SESSIONS, JSON.stringify(updated));
  }

  async function createNew() {
    const s = newSession();
    await persist([s, ...sessions]);
    setActiveId(s.id);
    setShowSessions(false);
  }

  async function deleteSession(id: string) {
    const next = sessions.filter((s) => s.id !== id);
    await persist(next.length ? next : [newSession()]);
    if (activeId === id) setActiveId(next[0]?.id ?? sessions[0]?.id ?? "");
  }

  const doSend = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading || !active) return;
      const userMsg: Message = {
        id: uid(),
        role: "user",
        content: text.trim(),
        timestamp: Date.now(),
      };
      const history = [...messages, userMsg];
      const title = active.title === "New chat" ? text.trim().slice(0, 40) : active.title;
      const updSession = { ...active, title, updatedAt: Date.now(), messages: history };
      await persist(sessions.map((s) => (s.id === activeId ? updSession : s)));
      setInput("");
      setIsLoading(true);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

      try {
        const res = await fetch(`${apiBase}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: history.map((m) => ({ role: m.role, content: m.content })),
            stream: false,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const content: string = data.choices?.[0]?.message?.content ?? "No response.";
        const raw = data.choices?.[0]?.message?.lokaflow_trace;
        const trace: LokaFlowTrace | undefined = raw
          ? {
              tier: raw.tier ?? "local",
              model: raw.model ?? "—",
              reason: raw.reason ?? "—",
              complexityScore: raw.complexity_score ?? 0,
              inputTokens: raw.input_tokens ?? 0,
              outputTokens: raw.output_tokens ?? 0,
              costEur: raw.cost_eur ?? 0,
              latencyMs: raw.latency_ms ?? 0,
            }
          : undefined;
        const botMsg: Message = {
          id: uid(),
          role: "assistant",
          content,
          trace,
          timestamp: Date.now(),
        };
        const final = { ...updSession, updatedAt: Date.now(), messages: [...history, botMsg] };
        await persist(sessions.map((s) => (s.id === activeId ? final : s)));
      } catch (err: unknown) {
        const botMsg: Message = {
          id: uid(),
          role: "assistant",
          timestamp: Date.now(),
          content: `❌ Could not connect to LokaFlow.\n\nMake sure **lokaflow serve** is running at \`${apiBase}\`.\n\nGo to Settings → Connection to change the API URL.`,
        };
        const final = { ...updSession, updatedAt: Date.now(), messages: [...history, botMsg] };
        await persist(sessions.map((s) => (s.id === activeId ? final : s)));
      } finally {
        setIsLoading(false);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);
      }
    },
    [isLoading, active, sessions, activeId, apiBase, messages],
  );

  const regenerate = useCallback(() => {
    if (!active || isLoading || messages.length === 0) return;
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (lastUser) doSend(lastUser.content);
  }, [active, isLoading, messages, doSend]);

  const handleExplain = useCallback(
    (code: string, mode: "basic" | "detailed") => {
      const prompt =
        mode === "basic"
          ? `Please explain this code in **simple, plain English** that anyone can understand — no jargon. Walk through each part in a numbered list:\n\n\`\`\`\n${code}\n\`\`\``
          : `Give a **detailed technical explanation** of this code covering: purpose, line-by-line breakdown, algorithms used, edge cases, and improvement suggestions:\n\n\`\`\`\n${code}\n\`\`\``;
      doSend(prompt);
    },
    [doSend],
  );

  const showSmartReplies =
    messages.length > 0 && messages[messages.length - 1].role === "assistant" && !isLoading;
  const lastBotMsg = showSmartReplies ? messages[messages.length - 1] : null;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => setShowSessions(true)} style={{ flex: 1 }}>
          <Text style={s.headerTitle} numberOfLines={1}>
            {active?.title ?? "Chat"}
          </Text>
          <Text style={s.headerSub}>
            {messages.length} message{messages.length !== 1 ? "s" : ""} · tap to switch
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={createNew} style={s.newBtn}>
          <Text style={s.newBtnTxt}>＋ New</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {messages.length === 0 && !isLoading ? (
          <WelcomeStarters onSend={doSend} />
        ) : (
          <ScrollView
            ref={scrollRef}
            style={s.scroll}
            contentContainerStyle={s.scrollContent}
            keyboardDismissMode="on-drag"
          >
            {messages.map((msg, i) => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                isLast={i === messages.length - 1}
                onRegenerate={regenerate}
                onExplain={handleExplain}
              />
            ))}
            {isLoading && (
              <View style={s.loadingRow}>
                <View style={mb.avatar}>
                  <Text style={mb.avatarTxt}>🤖</Text>
                </View>
                <View style={[mb.bubble, mb.bubbleBot]}>
                  <TypingDots />
                </View>
              </View>
            )}
            <View style={{ height: 8 }} />
          </ScrollView>
        )}

        {lastBotMsg && <SmartReplies content={lastBotMsg.content} onSend={doSend} />}

        <View style={s.inputWrap}>
          <View style={s.inputRow}>
            <TextInput
              style={s.input}
              value={input}
              onChangeText={setInput}
              placeholder="Ask LokaFlow anything…"
              placeholderTextColor="#52525b"
              multiline
              maxLength={4000}
            />
            <TouchableOpacity
              style={[s.sendBtn, (!input.trim() || isLoading) && s.sendBtnOff]}
              onPress={() => doSend(input)}
              disabled={!input.trim() || isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={s.sendBtnTxt}>↑</Text>
              )}
            </TouchableOpacity>
          </View>
          {input.length > 50 && <Text style={s.charCount}>{input.length} / 4000</Text>}
          <Text style={s.hint}>Local-first · private · data stays on device</Text>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={showSessions} animationType="slide" transparent>
        <View style={sm.overlay}>
          <View style={sm.box}>
            <View style={sm.top}>
              <Text style={sm.title}>Chats</Text>
              <TouchableOpacity onPress={() => setShowSessions(false)}>
                <Text style={sm.close}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={sessions}
              keyExtractor={(it) => it.id}
              renderItem={({ item }) => (
                <View style={sm.row}>
                  <TouchableOpacity
                    style={{ flex: 1 }}
                    onPress={() => {
                      setActiveId(item.id);
                      setShowSessions(false);
                    }}
                  >
                    <Text
                      style={[sm.rowTitle, item.id === activeId && sm.rowTitleActive]}
                      numberOfLines={1}
                    >
                      {item.title}
                    </Text>
                    <Text style={sm.rowMeta}>
                      {item.messages.length} msg{item.messages.length !== 1 ? "s" : ""} ·{" "}
                      {new Date(item.updatedAt).toLocaleDateString()}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() =>
                      Alert.alert("Delete Chat", `Delete "${item.title}"?`, [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Delete",
                          style: "destructive",
                          onPress: () => deleteSession(item.id),
                        },
                      ])
                    }
                  >
                    <Text style={sm.del}>🗑</Text>
                  </TouchableOpacity>
                </View>
              )}
            />
            <TouchableOpacity style={sm.newBtn} onPress={createNew}>
              <Text style={sm.newBtnTxt}>＋ New Chat</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#09090b" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#1c1917",
    backgroundColor: "#09090b",
  },
  headerTitle: { color: "#fafafa", fontSize: 16, fontWeight: "700" },
  headerSub: { color: "#52525b", fontSize: 11, marginTop: 1 },
  newBtn: {
    backgroundColor: "#052e16",
    borderWidth: 1,
    borderColor: "#10b981",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  newBtnTxt: { color: "#10b981", fontWeight: "700", fontSize: 13 },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: 12, paddingBottom: 4 },
  loadingRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  inputWrap: {
    backgroundColor: "#09090b",
    borderTopWidth: 1,
    borderTopColor: "#1c1917",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 20 : 12,
  },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  input: {
    flex: 1,
    backgroundColor: "#18181b",
    color: "#fafafa",
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    lineHeight: 22,
    maxHeight: 130,
    borderWidth: 1,
    borderColor: "#27272a",
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#10b981",
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnOff: { backgroundColor: "#18181b", opacity: 0.4 },
  sendBtnTxt: { color: "#fff", fontSize: 20, fontWeight: "700", lineHeight: 28 },
  charCount: { color: "#52525b", fontSize: 11, textAlign: "right", marginTop: 3 },
  hint: { color: "#3f3f46", fontSize: 10, textAlign: "center", marginTop: 5 },
});

const sm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,.75)", justifyContent: "flex-end" },
  box: {
    backgroundColor: "#18181b",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#27272a",
  },
  title: { color: "#fafafa", fontSize: 17, fontWeight: "700" },
  close: { color: "#71717a", fontSize: 18 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1c1917",
  },
  rowTitle: { color: "#d4d4d8", fontSize: 15, fontWeight: "500" },
  rowTitleActive: { color: "#10b981" },
  rowMeta: { color: "#52525b", fontSize: 11, marginTop: 2 },
  del: { fontSize: 18, paddingLeft: 12 },
  newBtn: {
    margin: 16,
    backgroundColor: "#10b981",
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  newBtnTxt: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
