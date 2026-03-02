import { useState, useRef, useEffect, useCallback, useMemo, ChangeEvent } from "react";
import {
  Send,
  Bot,
  User,
  Loader2,
  Copy,
  Check,
  Cpu,
  Cloud,
  Zap,
  ChevronDown,
  ChevronUp,
  Shield,
  Coins,
  GitBranch,
  Terminal,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Hash,
  ArrowRight,
  Network,
  Plus,
  Trash2,
  Download,
  FileText,
  FileJson,
  Printer,
  LayoutTemplate,
  Pencil,
  Paperclip,
  X,
  MessageSquare,
  BarChart2,
  ChevronLeft,
  ChevronRight,
  Search,
  BookOpen,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";

// ─── Types ───────────────────────────────────────────────────────────────────

interface LokaFlowTrace {
  tier: string;
  model: string;
  reason: string;
  complexityScore: number;
  inputTokens: number;
  outputTokens: number;
  costEur: number;
  latencyMs: number;
  trace: string[];
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  trace?: LokaFlowTrace;
  attachments?: AttachedFile[];
}

interface AttachedFile {
  name: string;
  size: number;
  mimeType: string;
  dataUrl?: string; // base64 for images
  textContent?: string; // extracted text for text files
}

interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
}

interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  template: string;
  category: string;
  isBuiltIn?: boolean;
}

// ─── ID helpers ──────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ─── Default prompt templates ─────────────────────────────────────────────────

const BUILTIN_TEMPLATES: PromptTemplate[] = [
  {
    id: "tpl-code-review",
    name: "Code Review",
    description: "Review code for bugs, style, and improvements",
    template:
      "Please review the following code and provide feedback on bugs, code style, performance, and best practices:\n\n```\n{{code}}\n```",
    category: "Coding",
    isBuiltIn: true,
  },
  {
    id: "tpl-explain-error",
    name: "Explain Error",
    description: "Explain an error message and suggest fixes",
    template:
      "I'm getting the following error. Please explain what it means and suggest how to fix it:\n\n```\n{{error}}\n```",
    category: "Coding",
    isBuiltIn: true,
  },
  {
    id: "tpl-write-tests",
    name: "Write Tests",
    description: "Generate unit tests for a function or class",
    template:
      "Write comprehensive unit tests for the following code using best practices:\n\n```\n{{code}}\n```",
    category: "Coding",
    isBuiltIn: true,
  },
  {
    id: "tpl-summarise",
    name: "Summarise",
    description: "Summarise a piece of text concisely",
    template:
      "Please summarise the following text in a clear, concise way (3-5 bullet points):\n\n{{text}}",
    category: "Writing",
    isBuiltIn: true,
  },
  {
    id: "tpl-translate",
    name: "Translate",
    description: "Translate text to another language",
    template: "Translate the following text to {{language}}:\n\n{{text}}",
    category: "Writing",
    isBuiltIn: true,
  },
  {
    id: "tpl-explain-concept",
    name: "Explain Concept",
    description: "Explain a concept in simple terms",
    template:
      "Explain {{concept}} in simple terms, as if explaining to a beginner. Include practical examples.",
    category: "Analysis",
    isBuiltIn: true,
  },
];

// ─── CopyButton ──────────────────────────────────────────────────────────────

function CopyButton({
  text,
  label = "Copy",
  className = "copy-btn",
}: {
  text: string;
  label?: string;
  className?: string;
}): JSX.Element {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className={className}
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? "Copied" : label}
    </button>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function shortModel(m: string): string {
  const exec = m.match(/executed-by:([^,]+)/);
  const plan = m.match(/planned-by:([^,]+)/);
  if (exec && plan) return `${exec[1]} ← ${plan[1]}`;
  return m;
}

function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~>]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function downloadBlob(content: string, name: string, mime: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

// Use 127.0.0.1 explicitly to avoid macOS IPv6-first resolution of 'localhost'
const API_BASE = (): string => localStorage.getItem("lf_api_url") || "http://127.0.0.1:4141";
const MAX_QUEUE = 5;

// ─── Storage helpers ──────────────────────────────────────────────────────────

const SESSIONS_KEY = "lf_chat_sessions";
const ACTIVE_KEY = "lf_active_session";
const TEMPLATES_KEY = "lf_prompt_templates";

const WELCOME = (_sessionId?: string): Message => ({
  id: uid(),
  role: "assistant",
  content:
    "Hello! I am **LokaFlow™**. I route your queries intelligently between local and cloud models.\n\nTry asking me anything — I'll show you which model handled it and how much it cost.",
});

function loadSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ChatSession[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    /* ignore */
  }
  const initial: ChatSession = {
    id: uid(),
    title: "New Chat",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
  };
  initial.messages = [WELCOME(initial.id)];
  return [initial];
}

function saveSessions(sessions: ChatSession[]): void {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  } catch {
    /* quota */
  }
}

function loadActiveId(sessions: ChatSession[]): string {
  const stored = localStorage.getItem(ACTIVE_KEY);
  if (stored && sessions.find((s) => s.id === stored)) return stored;
  return sessions[0]?.id ?? "";
}

function loadTemplates(): PromptTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PromptTemplate[];
      if (Array.isArray(parsed)) {
        // Merge with built-ins (keep custom, add built-ins that are missing)
        const customIds = new Set(parsed.map((t) => t.id));
        const merged = [...BUILTIN_TEMPLATES.filter((t) => !customIds.has(t.id)), ...parsed];
        return merged;
      }
    }
  } catch {
    /* ignore */
  }
  return [...BUILTIN_TEMPLATES];
}

function saveTemplates(templates: PromptTemplate[]): void {
  try {
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates.filter((t) => !t.isBuiltIn)));
  } catch {
    /* ignore */
  }
}

// ─── MessageContent ───────────────────────────────────────────────────────────

const DOWNLOADABLE_EXT = /\.(pdf|csv|json|zip|png|jpg|jpeg|webp|svg|txt|md|ts|js|py|sh|yaml|yml)$/i;

const CODE_EXT_MAP: Record<string, string> = {
  typescript: "ts",
  javascript: "js",
  python: "py",
  bash: "sh",
  shell: "sh",
  json: "json",
  yaml: "yml",
  css: "css",
  html: "html",
  sql: "sql",
  rust: "rs",
  go: "go",
  java: "java",
  cpp: "cpp",
  c: "c",
};

// ─── ExplainButton ────────────────────────────────────────────────────────────

function ExplainButton({
  code,
  onExplain,
}: {
  code: string;
  onExplain: (code: string, mode: "basic" | "detailed") => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);
  return (
    <div className="explain-wrap" ref={ref}>
      <button
        className="copy-btn explain-btn"
        onClick={() => setOpen((v) => !v)}
        title="Explain this code"
      >
        <BookOpen size={13} /> Explain ▾
      </button>
      {open && (
        <div className="explain-dropdown">
          <button
            className="explain-opt"
            onClick={() => {
              onExplain(code, "basic");
              setOpen(false);
            }}
          >
            🟢 Basic — simple English, no jargon
          </button>
          <button
            className="explain-opt"
            onClick={() => {
              onExplain(code, "detailed");
              setOpen(false);
            }}
          >
            🔵 Detailed — deep dive, line by line
          </button>
        </div>
      )}
    </div>
  );
}

function MessageContent({
  content,
  onExplain,
}: {
  content: string;
  onExplain?: (code: string, mode: "basic" | "detailed") => void;
}): JSX.Element {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        pre({ children, ...props }) {
          const codeEl = (children as React.ReactElement)?.props;
          const codeText = codeEl?.children ?? "";
          const lang = (codeEl?.className ?? "").replace("language-", "");
          const ext = CODE_EXT_MAP[lang] ?? "txt";
          return (
            <div className="code-block-wrapper">
              <div className="code-block-header">
                <span className="code-lang">{lang || "code"}</span>
                <div className="code-block-actions">
                  {onExplain && (
                    <ExplainButton code={String(codeText).trimEnd()} onExplain={onExplain} />
                  )}
                  <button
                    className="copy-btn"
                    title="Download as file"
                    onClick={() =>
                      downloadBlob(String(codeText).trimEnd(), `snippet.${ext}`, "text/plain")
                    }
                  >
                    <Download size={13} /> Download
                  </button>
                  <CopyButton text={String(codeText).trimEnd()} />
                </div>
              </div>
              <pre {...props}>{children}</pre>
            </div>
          );
        },
        code({ children, className, ...props }) {
          if (className?.startsWith("language-"))
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          return (
            <code className="inline-code" {...props}>
              {children}
            </code>
          );
        },
        a({ href, children }) {
          if (href && DOWNLOADABLE_EXT.test(href)) {
            return (
              <span className="download-link-wrap">
                <a href={href} target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
                <a
                  href={href}
                  download
                  className="download-pill"
                  title={`Download ${href.split("/").pop()}`}
                >
                  <Download size={11} /> Download
                </a>
              </span>
            );
          }
          return (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          );
        },
        table({ children }) {
          return (
            <div className="md-table-wrapper">
              <table>{children}</table>
            </div>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

// ─── TraceLine parser ─────────────────────────────────────────────────────────

type TraceStepKind =
  | "header"
  | "config"
  | "memory"
  | "pii"
  | "tokens"
  | "search"
  | "classify"
  | "provider"
  | "budget"
  | "dispatch"
  | "delegation"
  | "agent"
  | "agent_quality"
  | "agent_telemetry"
  | "subtask"
  | "subtask_done"
  | "subtask_fail"
  | "error"
  | "fallback"
  | "result"
  | "decision"
  | "info";

interface TraceStep {
  kind: TraceStepKind;
  raw: string;
  status: "ok" | "warn" | "error" | "info";
}

function classifyLine(line: string): TraceStep {
  const raw = line;
  const l = line.trim();

  if (l.includes("─── NEW ROUTING REQUEST ───")) return { kind: "header", raw, status: "info" };
  if (l.startsWith("config:")) return { kind: "config", raw, status: "info" };
  if (l.startsWith("step 0:")) return { kind: "memory", raw, status: "ok" };
  if (l.startsWith("step 1:") && l.includes("PII detected"))
    return { kind: "pii", raw, status: "warn" };
  if (l.startsWith("step 1:")) return { kind: "pii", raw, status: "ok" };
  if (l.startsWith("step 2b:")) return { kind: "search", raw, status: "ok" };
  if (l.startsWith("step 2:")) return { kind: "tokens", raw, status: "ok" };
  if (l.startsWith("step 3:")) return { kind: "classify", raw, status: "ok" };
  if (l.startsWith("step 4(b)") && l.includes("EXCEEDED"))
    return { kind: "budget", raw, status: "error" };
  if (l.startsWith("step 4(b)")) return { kind: "budget", raw, status: "ok" };
  if (l.startsWith("step 4:")) return { kind: "provider", raw, status: "ok" };
  if (l.startsWith("step 5:")) return { kind: "dispatch", raw, status: "ok" };
  // ── LokaAgent 8-stage pipeline lines ────────────────────────────────────
  if (l.startsWith("[AGENT]") && l.includes("Pipeline complete"))
    return { kind: "result", raw, status: "ok" };
  if (l.startsWith("[AGENT]") && l.includes("QualityGate") && /\b0\//.test(l))
    return { kind: "agent_quality", raw, status: "warn" };
  if (l.startsWith("[AGENT]") && l.includes("QualityGate"))
    return { kind: "agent_quality", raw, status: "ok" };
  if (l.startsWith("[AGENT]") && (l.includes("Telemetry") || l.includes("Savings") || l.includes("Nodes:")))
    return { kind: "agent_telemetry", raw, status: "info" };
  if (l.startsWith("[AGENT]") && (l.includes("escalated") || l.includes("error")))
    return { kind: "agent", raw, status: "warn" };
  if (l.startsWith("[AGENT]")) return { kind: "agent", raw, status: "ok" };
  // ── Legacy delegation lines ───────────────────────────────────────────────
  if (l.startsWith("[DELEGATION]") && l.includes("failed"))
    return { kind: "delegation", raw, status: "error" };
  if (l.startsWith("[DELEGATION]")) return { kind: "delegation", raw, status: "ok" };
  if (l.includes("↪") && l.includes("completed"))
    return { kind: "subtask_done", raw, status: "ok" };
  if (l.includes("↪") || l.includes("failed"))
    return { kind: "subtask_fail", raw, status: "error" };
  if (l.includes("[Depth") || l.includes("Subtask"))
    return { kind: "subtask", raw, status: "info" };
  if (l.startsWith("error:")) return { kind: "error", raw, status: "error" };
  if (l.startsWith("fallback:")) return { kind: "fallback", raw, status: "warn" };
  if (l.startsWith("result:")) return { kind: "result", raw, status: "ok" };
  if (l.startsWith("decision:")) return { kind: "decision", raw, status: "ok" };
  return { kind: "info", raw, status: "info" };
}

const STEP_ICONS: Record<TraceStepKind, React.ReactNode> = {
  header: <Network size={13} />,
  config: <Terminal size={13} />,
  memory: <Hash size={13} />,
  pii: <Shield size={13} />,
  tokens: <Hash size={13} />,
  search: <Zap size={13} />,
  classify: <GitBranch size={13} />,
  provider: <ArrowRight size={13} />,
  budget: <Coins size={13} />,
  dispatch: <Zap size={13} />,
  delegation: <Network size={13} />,
  agent: <Bot size={13} />,
  agent_quality: <Shield size={13} />,
  agent_telemetry: <BarChart2 size={13} />,
  subtask: <ArrowRight size={13} />,
  subtask_done: <CheckCircle2 size={13} />,
  subtask_fail: <XCircle size={13} />,
  error: <XCircle size={13} />,
  fallback: <AlertCircle size={13} />,
  result: <CheckCircle2 size={13} />,
  decision: <CheckCircle2 size={13} />,
  info: <ArrowRight size={13} />,
};

// ─── TracePanel ───────────────────────────────────────────────────────────────

function TracePanel({ trace }: { trace: LokaFlowTrace }): JSX.Element {
  const [open, setOpen] = useState(false);
  const steps = trace.trace.map(classifyLine).filter((s) => s.kind !== "header");

  const tierColor =
    trace.tier === "local"
      ? "#10b981"
      : trace.tier === "cloud"
        ? "#eab308"
        : trace.tier === "delegated"
          ? "#8b5cf6"
          : "#3b82f6";

  // Parse subtask timing info for visual agent tree
  const subtasksDone = steps.filter((s) => s.kind === "subtask_done");
  const isDelegated = trace.tier === "delegated";

  // Extract the provider node/IP from "step 5: dispatching request to X"
  const step5 = trace.trace.find((l) => /step 5:/i.test(l));
  const nodeAddrRaw = step5?.match(/dispatching request to\s+(\S+)/i)?.[1] ?? "";
  const nodeAddr = nodeAddrRaw.replace(/^ollama\[/, "").replace(/\]$/, "");

  function fmtMs(ms: number): string {
    if (ms >= 60000) return `${(ms / 60000).toFixed(1)}m`;
    if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
    return `${ms}ms`;
  }

  return (
    <div className="trace-panel">
      {/* Summary bar — always visible */}
      <button className="trace-toggle" onClick={() => setOpen((o) => !o)}>
        <div className="trace-summary">
          <span className="trace-tier-pip" style={{ background: tierColor }} />
          <span className="trace-tier-lbl" style={{ color: tierColor }}>
            {trace.tier}
          </span>
          <span className="trace-divider">·</span>
          <span className="trace-model-lbl">{shortModel(trace.model)}</span>
          {nodeAddr && (
            <>
              <span className="trace-divider">·</span>
              <Network size={11} />
              <span className="trace-node-label">{nodeAddr}</span>
            </>
          )}
          <span className="trace-divider">·</span>
          <Clock size={11} />
          <span>{fmtMs(trace.latencyMs)}</span>
          <span className="trace-divider">·</span>
          <Hash size={11} />
          <span>{(trace.inputTokens + trace.outputTokens).toLocaleString()} tok</span>
          {trace.costEur > 0 && (
            <>
              <span className="trace-divider">·</span>
              <Coins size={11} />
              <span className="trace-cost">€{trace.costEur.toFixed(5)}</span>
            </>
          )}
          <span className="trace-score">(score {trace.complexityScore.toFixed(2)})</span>
        </div>
        <div className="trace-expand-btn">
          {open ? (
            <>
              <ChevronUp size={13} /> Hide trace
            </>
          ) : (
            <>
              <ChevronDown size={13} /> View trace
            </>
          )}
        </div>
      </button>

      {open && (
        <div className="trace-body">
          {/* Token summary */}
          <div className="trace-token-row">
            <div className="trace-token-card">
              <div className="ttc-label">Tokens in</div>
              <div className="ttc-val">{trace.inputTokens.toLocaleString()}</div>
            </div>
            <div className="trace-token-card">
              <div className="ttc-label">Tokens out</div>
              <div className="ttc-val">{trace.outputTokens.toLocaleString()}</div>
            </div>
            <div className="trace-token-card">
              <div className="ttc-label">Total tokens</div>
              <div className="ttc-val">
                {(trace.inputTokens + trace.outputTokens).toLocaleString()}
              </div>
            </div>
            <div className="trace-token-card">
              <div className="ttc-label">Latency</div>
              <div className="ttc-val">{fmtMs(trace.latencyMs)}</div>
            </div>
            <div className="trace-token-card">
              <div className="ttc-label">Cost</div>
              <div className="ttc-val" style={{ color: trace.costEur > 0 ? "#eab308" : "#10b981" }}>
                {trace.costEur > 0 ? `€${trace.costEur.toFixed(5)}` : "€0 (free)"}
              </div>
            </div>
            <div className="trace-token-card">
              <div className="ttc-label">Complexity</div>
              <div className="ttc-val">{trace.complexityScore.toFixed(3)}</div>
            </div>
          </div>

          {/* Agent tree (only for delegated) */}
          {isDelegated && subtasksDone.length > 0 && (
            <div className="trace-agent-tree">
              <div className="trace-section-title">
                <Network size={12} /> Agent Execution Tree
              </div>
              <div className="agent-tree-grid">
                {subtasksDone.map((s, i) => {
                  // Parse: ↪ [Depth 0] Subtask 1 completed by ollama[@192.168.2.65] [model=qwen2.5-coder:7b] in 88.7s (In: 990, Out: 1036).
                  const nodeM = s.raw.match(/completed by ([^\s[]+)/);
                  const modelM = s.raw.match(/\[model=([^\]]+)\]/);
                  const inM = s.raw.match(/In:\s*(\d+)/);
                  const outM = s.raw.match(/Out:\s*(\d+)/);
                  const timeM = s.raw.match(/in\s+([\d.]+)s/);
                  const idxM = s.raw.match(/Subtask\s+(\d+)/);
                  const depthM = s.raw.match(/\[Depth\s+(\d+)\]/);
                  const retryM = s.raw.match(/Retrying/);
                  return (
                    <div key={i} className={`agent-node ${retryM ? "retried" : "ok"}`}>
                      <div className="an-header">
                        <span className="an-idx">#{idxM?.[1] ?? i}</span>
                        <span className="an-status">
                          {retryM ? <AlertCircle size={11} /> : <CheckCircle2 size={11} />}
                        </span>
                        {depthM && <span className="an-depth">depth {depthM[1]}</span>}
                      </div>
                      <div className="an-node">{nodeM?.[1] ?? "-"}</div>
                      <div className="an-model">{modelM?.[1] ?? "-"}</div>
                      <div className="an-stats">
                        <span>{inM?.[1] ?? "?"} in</span>
                        <span>{outM?.[1] ?? "?"} out</span>
                        {timeM && <span>{timeM[1]}s</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Full pipeline log */}
          <div className="trace-section-title">
            <Terminal size={12} /> Pipeline Steps
          </div>
          <div className="trace-log">
            {steps.map((s, i) => (
              <div key={i} className={`trace-line tl-${s.status} tl-kind-${s.kind}`}>
                <span className="tl-icon">{STEP_ICONS[s.kind]}</span>
                <span className="tl-text">{s.raw.trim()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── QueueBar ────────────────────────────────────────────────────────────────

function QueueBar({
  queue,
  onClear,
}: {
  queue: string[];
  onClear: () => void;
}): JSX.Element | null {
  if (queue.length === 0) return null;
  return (
    <div className="queue-bar">
      <div className="queue-bar-header">
        <span>
          <Loader2 size={12} className="spin" />
          {queue.length} message{queue.length > 1 ? "s" : ""} queued
        </span>
        <button className="queue-clear-btn" onClick={onClear} title="Clear queue">
          <XCircle size={12} /> Clear queue
        </button>
      </div>
      <div className="queue-list">
        {queue.map((q, i) => (
          <div key={i} className="queue-item">
            <span className="queue-item-idx">#{i + 1}</span>
            <span className="queue-item-text">{q.length > 80 ? q.slice(0, 80) + "…" : q}</span>
          </div>
        ))}
      </div>
      {queue.length >= MAX_QUEUE && (
        <div className="queue-full-hint">Queue full (max {MAX_QUEUE}) — clear to add more</div>
      )}
    </div>
  );
}

// ─── CostEstimator ───────────────────────────────────────────────────────────

function estimatePrompt(text: string): {
  complexity: number;
  tier: "local" | "cloud";
  costEur: number;
  tokens: number;
} {
  if (!text.trim()) return { complexity: 0, tier: "local", costEur: 0, tokens: 0 };

  const lower = text.toLowerCase();
  const tokens = Math.ceil(text.length / 4);
  let complexity = 0.25;

  // Length factor
  if (text.length > 500) complexity += 0.25;
  else if (text.length > 200) complexity += 0.15;
  else if (text.length < 30) complexity -= 0.1;

  // Technical / code keywords
  const codeKw = [
    "function",
    "class",
    "algorithm",
    "debug",
    "error",
    "implement",
    "refactor",
    "architecture",
    "api",
    "database",
  ];
  if (codeKw.some((kw) => lower.includes(kw))) complexity += 0.15;

  // Expert / compliance keywords
  const expertKw = [
    "gdpr",
    "compliance",
    "legal",
    "medical",
    "regulation",
    "audit",
    "privacy",
    "liability",
  ];
  if (expertKw.some((kw) => lower.includes(kw))) complexity += 0.2;

  // Multiple questions
  const qCount = (text.match(/\?/g) || []).length;
  if (qCount >= 2) complexity += 0.1;

  complexity = Math.min(0.95, Math.max(0.05, complexity));

  const tier: "local" | "cloud" = complexity >= 0.65 ? "cloud" : "local";

  // Cost estimate: local = €0.00, cloud ≈ €0.002 per 1K tokens
  const costEur = tier === "cloud" ? (tokens / 1000) * 0.002 : 0;

  return { complexity, tier, costEur, tokens };
}

function CostEstimator({ prompt }: { prompt: string }) {
  const est = useMemo(() => estimatePrompt(prompt), [prompt]);

  if (prompt.trim().length < 5) return null;

  const pct = Math.round(est.complexity * 100);
  const barColor = est.tier === "local" ? "#4ade80" : "#fbbf24";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "5px 12px",
        fontSize: 11,
        color: "var(--text-muted)",
        borderTop: "1px solid var(--border-color)",
        background: "rgba(0,0,0,.1)",
      }}
    >
      {est.tier === "local" ? (
        <Cpu size={12} style={{ color: "#4ade80" }} />
      ) : (
        <Cloud size={12} style={{ color: "#fbbf24" }} />
      )}
      <span style={{ color: est.tier === "local" ? "#4ade80" : "#fbbf24", fontWeight: 600 }}>
        {est.tier === "local" ? "Local" : "Cloud"}
      </span>
      <div
        style={{
          flex: 1,
          height: 3,
          background: "rgba(255,255,255,.08)",
          borderRadius: 99,
          maxWidth: 80,
        }}
      >
        <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 99 }} />
      </div>
      <span>complexity {pct}%</span>
      <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
        <BarChart2 size={11} />~{est.tokens} tokens
        {est.costEur > 0 ? (
          <span style={{ color: "#fbbf24" }}> · €{(est.costEur * 100).toFixed(2)}¢</span>
        ) : (
          <span style={{ color: "#4ade80" }}> · €0.00</span>
        )}
      </span>
    </div>
  );
}

// ─── TemplatesModal ───────────────────────────────────────────────────────────

const TEMPLATE_CATEGORIES = ["All", "Coding", "Writing", "Analysis"];

function TemplatesModal({
  templates,
  onUse,
  onSave,
  onDelete,
  onClose,
  prefillContent,
}: {
  templates: PromptTemplate[];
  onUse: (tpl: PromptTemplate) => void;
  onSave: (tpl: PromptTemplate) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  prefillContent?: string | null;
}): JSX.Element {
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(() => !!prefillContent);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    template: prefillContent ?? "",
    category: "Coding",
  });

  const filtered = templates.filter((t) => {
    const matchCat = category === "All" || t.category === category;
    const matchSearch =
      !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const startEdit = (tpl: PromptTemplate) => {
    setEditingId(tpl.id);
    setForm({
      name: tpl.name,
      description: tpl.description,
      template: tpl.template,
      category: tpl.category,
    });
    setCreating(true);
  };

  const handleSave = () => {
    if (!form.name.trim() || !form.template.trim()) return;
    const tpl: PromptTemplate = {
      id: editingId ?? uid(),
      name: form.name.trim(),
      description: form.description.trim(),
      template: form.template,
      category: form.category,
    };
    onSave(tpl);
    setCreating(false);
    setEditingId(null);
    setForm({ name: "", description: "", template: "", category: "Coding" });
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box templates-modal">
        <div className="modal-header">
          <div className="modal-title">
            <BookOpen size={16} /> Prompt Templates
          </div>
          <button className="modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {!creating ? (
          <>
            <div className="templates-toolbar">
              <div className="templates-search">
                <Search size={13} />
                <input
                  placeholder="Search templates…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <button
                className="btn-save"
                onClick={() => {
                  setCreating(true);
                  setEditingId(null);
                  setForm({ name: "", description: "", template: "", category: "Coding" });
                }}
              >
                <Plus size={13} /> New
              </button>
            </div>

            <div className="templates-cats">
              {TEMPLATE_CATEGORIES.map((c) => (
                <button
                  key={c}
                  className={`tpl-cat-btn ${category === c ? "active" : ""}`}
                  onClick={() => setCategory(c)}
                >
                  {c}
                </button>
              ))}
            </div>

            <div className="templates-list">
              {filtered.length === 0 && <div className="templates-empty">No templates found.</div>}
              {filtered.map((tpl) => (
                <div key={tpl.id} className="tpl-card">
                  <div className="tpl-card-top">
                    <div>
                      <div className="tpl-name">{tpl.name}</div>
                      <div className="tpl-desc">{tpl.description}</div>
                    </div>
                    <span className="tpl-cat-badge">{tpl.category}</span>
                  </div>
                  <div className="tpl-card-bottom">
                    <button
                      className="btn-save tpl-use-btn"
                      onClick={() => {
                        onUse(tpl);
                        onClose();
                      }}
                    >
                      Use
                    </button>
                    {!tpl.isBuiltIn && (
                      <>
                        <button
                          className="btn-ghost tpl-icon-btn"
                          onClick={() => startEdit(tpl)}
                          title="Edit"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          className="btn-ghost tpl-icon-btn tpl-del-btn"
                          onClick={() => onDelete(tpl.id)}
                          title="Delete"
                        >
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                    {tpl.isBuiltIn && <span className="tpl-builtin-badge">built-in</span>}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="tpl-form">
            <div className="tpl-form-title">{editingId ? "Edit Template" : "New Template"}</div>
            <label>Name</label>
            <input
              className="settings-input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Template name"
            />
            <label>Description</label>
            <input
              className="settings-input"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Short description"
            />
            <label>Category</label>
            <select
              className="settings-input"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            >
              {["Coding", "Writing", "Analysis"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <label>
              Template{" "}
              <span className="tpl-placeholder-hint">(use {"{{variable}}"} for placeholders)</span>
            </label>
            <textarea
              className="settings-input tpl-form-textarea"
              value={form.template}
              onChange={(e) => setForm((f) => ({ ...f, template: e.target.value }))}
              placeholder="Write your prompt template here…"
              rows={6}
            />
            <div className="tpl-form-actions">
              <button
                className="btn-ghost"
                onClick={() => {
                  setCreating(false);
                  setEditingId(null);
                }}
              >
                Cancel
              </button>
              <button
                className="btn-save"
                onClick={handleSave}
                disabled={!form.name.trim() || !form.template.trim()}
              >
                Save Template
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SessionSidebar ───────────────────────────────────────────────────────────

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function SessionSidebar({
  sessions,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onRename,
  collapsed,
  onToggleCollapse,
}: {
  sessions: ChatSession[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}): JSX.Element {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const commitRename = (id: string) => {
    if (editTitle.trim()) onRename(id, editTitle.trim());
    setEditingId(null);
  };

  return (
    <aside className={`chat-session-sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="css-header">
        {!collapsed && (
          <span className="css-title">
            <MessageSquare size={13} /> Chats
          </span>
        )}
        <button
          className="css-collapse-btn"
          onClick={onToggleCollapse}
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {!collapsed && (
        <>
          <button className="css-new-btn" onClick={onNew}>
            <Plus size={14} /> New Chat
          </button>

          <div className="css-list">
            {sessions.map((s) => (
              <div
                key={s.id}
                className={`css-item ${s.id === activeId ? "active" : ""} ${pendingDelete === s.id ? "deleting" : ""}`}
                onClick={() => {
                  if (editingId !== s.id) onSelect(s.id);
                }}
              >
                {editingId === s.id ? (
                  <input
                    className="css-rename-input"
                    value={editTitle}
                    autoFocus
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename(s.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    onBlur={() => commitRename(s.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <>
                    <div className="css-item-body">
                      <div
                        className="css-item-title"
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setEditingId(s.id);
                          setEditTitle(s.title);
                        }}
                        title="Double-click to rename"
                      >
                        {s.title}
                      </div>
                      <div className="css-item-time">{relativeTime(s.updatedAt)}</div>
                    </div>
                    {pendingDelete === s.id ? (
                      <div className="css-delete-confirm" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="css-del-confirm-btn"
                          onClick={() => {
                            onDelete(s.id);
                            setPendingDelete(null);
                          }}
                        >
                          Delete
                        </button>
                        <button
                          className="css-del-cancel-btn"
                          onClick={() => setPendingDelete(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        className="css-delete-btn"
                        title="Delete session"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPendingDelete(s.id);
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </aside>
  );
}

// ─── ExportMenu ───────────────────────────────────────────────────────────────

function ExportMenu({
  session,
  onClose,
}: {
  session: ChatSession;
  onClose: () => void;
}): JSX.Element {
  const exportMarkdown = () => {
    const md = session.messages
      .map((m) => `## ${m.role === "user" ? "You" : "LokaFlow™"}\n\n${m.content}`)
      .join("\n\n---\n\n");
    downloadBlob(md, `${session.title}.md`, "text/markdown");
    onClose();
  };

  const exportJson = () => {
    downloadBlob(JSON.stringify(session, null, 2), `${session.title}.json`, "application/json");
    onClose();
  };

  const exportPdf = () => {
    window.print();
    onClose();
  };

  return (
    <div className="export-menu">
      <button className="export-menu-item" onClick={exportMarkdown}>
        <FileText size={13} /> Export as Markdown
      </button>
      <button className="export-menu-item" onClick={exportJson}>
        <FileJson size={13} /> Export as JSON
      </button>
      <button className="export-menu-item" onClick={exportPdf}>
        <Printer size={13} /> Print / Save as PDF
      </button>
    </div>
  );
}

// ─── Context Window Visualiser ───────────────────────────────────────────────

const MODEL_CTX: Record<string, number> = {
  "qwen2.5:7b": 131072,
  "qwen2.5-coder:7b": 131072,
  "qwen2.5:14b": 131072,
  "tinyllama:1.1b": 4096,
  tinyllama: 4096,
  "mistral:7b": 32768,
  mistral: 32768,
  "llama3:8b": 8192,
  llama3: 8192,
  "phi:latest": 4096,
  "gemini-2.0-flash": 1000000,
  "gemini-1.5-pro": 1000000,
  "claude-3-haiku": 200000,
  "claude-3-sonnet": 200000,
  "gpt-4o": 128000,
  "gpt-4o-mini": 128000,
};

function resolveCtxWindow(model: string): number {
  // Exact match first
  if (MODEL_CTX[model]) return MODEL_CTX[model];
  // Prefix match
  for (const key of Object.keys(MODEL_CTX)) {
    if (model.startsWith(key) || model.includes(key)) return MODEL_CTX[key];
  }
  return 32768; // sensible default
}

function ContextWindowBar({
  msgIndex,
  messages,
  model,
}: {
  msgIndex: number;
  messages: Message[];
  model: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const ctx = resolveCtxWindow(model);

  // Estimate tokens: 1 token ≈ 4 chars; 40 token system prompt overhead per prior message pair
  const systemTok = 80; // system preamble
  const historyTok = messages
    .slice(0, msgIndex)
    .reduce((acc, m) => acc + Math.ceil(m.content.length / 4) + 12, 0);
  const thisMsg = messages[msgIndex];
  const msgTok = thisMsg ? Math.ceil(thisMsg.content.length / 4) : 0;
  const total = systemTok + historyTok + msgTok;
  const pct = Math.min((total / ctx) * 100, 100);

  const barColor = pct < 60 ? "#4ade80" : pct < 85 ? "#fbbf24" : "#f87171";

  return (
    <div className="ctx-bar-wrap">
      <div className="ctx-bar-label">
        <span
          style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
          onClick={() => setExpanded((e) => !e)}
        >
          Context window
          <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 4 }}>
            {expanded ? "▲" : "▼"}
          </span>
        </span>
        <span style={{ color: barColor, fontWeight: 600 }}>
          {pct.toFixed(1)}% · {total.toLocaleString()} / {ctx.toLocaleString()} tok
        </span>
      </div>
      <div className="ctx-bar-track">
        <div className="ctx-bar-fill" style={{ width: `${pct}%`, background: barColor }} />
      </div>
      {expanded && (
        <div className="ctx-bar-detail">
          {[
            { label: "System", tok: systemTok, color: "#818cf8" },
            { label: "History", tok: historyTok, color: "#64748b" },
            { label: "This msg", tok: msgTok, color: "var(--accent)" },
          ].map(({ label, tok, color }) => (
            <span key={label} className="ctx-bar-seg">
              <span className="ctx-seg-dot" style={{ background: color }} />
              {label}: {tok.toLocaleString()} tok
            </span>
          ))}
          <span className="ctx-bar-seg" style={{ color: "var(--text-muted)", marginLeft: "auto" }}>
            {model}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── MessageBubble (with edit, copy-menu, attachments) ────────────────────────

function MessageBubble({
  msg,
  onEditResend,
  onSaveAsTemplate,
  onExplain,
}: {
  msg: Message;
  onEditResend: (newContent: string) => void;
  onSaveAsTemplate: (content: string) => void;
  onExplain?: (code: string, mode: "basic" | "detailed") => void;
}): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(msg.content);
  const [showCopyMenu, setShowCopyMenu] = useState(false);
  const copyMenuRef = useRef<HTMLDivElement>(null);

  // Close copy menu on outside click
  useEffect(() => {
    if (!showCopyMenu) return;
    const handler = (e: MouseEvent) => {
      if (copyMenuRef.current && !copyMenuRef.current.contains(e.target as Node)) {
        setShowCopyMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showCopyMenu]);

  const handleResend = () => {
    if (editValue.trim()) {
      onEditResend(editValue.trim());
      setEditing(false);
    }
  };

  return (
    <div className={`message-bubble ${msg.role === "assistant" ? "assistant" : ""}`}>
      {/* Attachments preview */}
      {msg.attachments && msg.attachments.length > 0 && (
        <div className="msg-attachments-row">
          {msg.attachments.map((a, i) => (
            <div key={i} className="msg-attach-chip">
              <Paperclip size={11} />
              <span>{a.name}</span>
              <span className="msg-attach-size">({(a.size / 1024).toFixed(1)}KB)</span>
            </div>
          ))}
        </div>
      )}

      {/* Message content or edit mode */}
      {editing ? (
        <div className="msg-edit-area">
          <textarea
            className="msg-edit-textarea"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            rows={3}
            autoFocus
          />
          <div className="msg-edit-actions">
            <button className="btn-ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button className="btn-save" onClick={handleResend}>
              Save &amp; Resend
            </button>
          </div>
        </div>
      ) : msg.role === "assistant" ? (
        <MessageContent content={msg.content} onExplain={onExplain} />
      ) : (
        <span className="user-text">{msg.content}</span>
      )}

      {/* Action toolbar — hover-visible */}
      {!editing && (
        <div className="msg-actions-toolbar">
          {/* Copy with variants */}
          <div className="msg-copy-wrap" ref={copyMenuRef}>
            <button
              className="msg-action-btn"
              onClick={() => setShowCopyMenu((v) => !v)}
              title="Copy options"
            >
              <Copy size={12} />
            </button>
            {showCopyMenu && (
              <div className="msg-copy-menu">
                <CopyButton text={msg.content} label="Copy Markdown" className="msg-copy-opt" />
                <CopyButton
                  text={stripMarkdown(msg.content)}
                  label="Copy plain text"
                  className="msg-copy-opt"
                />
                {msg.trace && (
                  <CopyButton
                    text={`${msg.content}\n\n---\nModel: ${msg.trace.model}\nTier: ${msg.trace.tier}\nTokens: ${msg.trace.inputTokens + msg.trace.outputTokens}\nCost: €${msg.trace.costEur.toFixed(5)}`}
                    label="Copy with trace"
                    className="msg-copy-opt"
                  />
                )}
              </div>
            )}
          </div>

          {/* Edit (user messages only) */}
          {msg.role === "user" && (
            <button
              className="msg-action-btn"
              onClick={() => {
                setEditing(true);
                setEditValue(msg.content);
              }}
              title="Edit message"
            >
              <Pencil size={12} />
            </button>
          )}

          {/* Save as template */}
          <button
            className="msg-action-btn"
            onClick={() => onSaveAsTemplate(msg.content)}
            title="Save as prompt template"
          >
            <LayoutTemplate size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

function tierIcon(tier?: string): JSX.Element {
  return tier === "cloud" ? (
    <Cloud size={20} />
  ) : tier === "delegated" ? (
    <Network size={20} />
  ) : (
    <Cpu size={20} />
  );
}

export function Chat(): JSX.Element {
  // ── Sessions ──────────────────────────────────────────────────────────────
  const [sessions, setSessions] = useState<ChatSession[]>(loadSessions);
  const [activeId, setActiveId] = useState<string>(() => loadActiveId(loadSessions()));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const activeSession = sessions.find((s) => s.id === activeId) ?? sessions[0];
  const messages = activeSession?.messages ?? [];

  // Persist sessions on change
  useEffect(() => {
    saveSessions(sessions);
  }, [sessions]);

  // Persist active session id
  useEffect(() => {
    localStorage.setItem(ACTIVE_KEY, activeId);
  }, [activeId]);

  // Auto-update session title from first user message
  useEffect(() => {
    const session = sessions.find((s) => s.id === activeId);
    if (!session) return;
    if (session.title !== "New Chat") return;
    const firstUser = session.messages.find((m) => m.role === "user");
    if (firstUser) {
      const newTitle = firstUser.content.slice(0, 40) + (firstUser.content.length > 40 ? "…" : "");
      setSessions((prev) => prev.map((s) => (s.id === activeId ? { ...s, title: newTitle } : s)));
    }
  }, [sessions, activeId]);

  const createNewSession = () => {
    const id = uid();
    const session: ChatSession = {
      id,
      title: "New Chat",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [WELCOME(id)],
    };
    setSessions((prev) => [session, ...prev]);
    setActiveId(id);
  };

  const deleteSession = (id: string) => {
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (next.length === 0) {
        const newId = uid();
        const fresh: ChatSession = {
          id: newId,
          title: "New Chat",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: [WELCOME(newId)],
        };
        setActiveId(newId);
        return [fresh];
      }
      if (id === activeId) setActiveId(next[0].id);
      return next;
    });
  };

  const renameSession = (id: string, title: string) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)));
  };

  // ── Templates ─────────────────────────────────────────────────────────────
  const [templates, setTemplates] = useState<PromptTemplate[]>(loadTemplates);
  const [showTemplates, setShowTemplates] = useState(false);

  const saveTemplate = (tpl: PromptTemplate) => {
    setTemplates((prev) => {
      const next = prev.some((t) => t.id === tpl.id)
        ? prev.map((t) => (t.id === tpl.id ? tpl : t))
        : [...prev, tpl];
      saveTemplates(next);
      return next;
    });
  };

  const deleteTemplate = (id: string) => {
    setTemplates((prev) => {
      const next = prev.filter((t) => t.id !== id);
      saveTemplates(next);
      return next;
    });
  };

  const [templatePrefill, setTemplatePrefill] = useState<string | null>(null);

  // Prompt template → open modal with prefilled content
  const handleSaveAsTemplate = (content: string) => {
    setTemplatePrefill(content);
    setShowTemplates(true);
  };

  // ── Explain code via local LLM ────────────────────────────────────────────
  const handleExplainCode = useCallback((code: string, mode: "basic" | "detailed") => {
    const prompt =
      mode === "basic"
        ? `Please explain the following code in **simple, plain English** that anyone can understand — no jargon, no assumed background. Use a short intro, then a numbered step-by-step walkthrough of what each part does, and finish with a one-sentence summary of the overall purpose.\n\n\`\`\`\n${code}\n\`\`\``
        : `Please provide a **detailed technical explanation** of the following code. Cover:\n1. Overall purpose and design pattern\n2. Line-by-line or block-by-block breakdown\n3. Key algorithms or data structures used\n4. Potential edge cases or limitations\n5. Suggestions to improve or extend this code\n\n\`\`\`\n${code}\n\`\`\``;
    setInput(prompt);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, []);

  // ── Input / attachments ───────────────────────────────────────────────────
  const [input, setInput] = useState("");
  const [slashSuggestions, setSlashSuggestions] = useState<PromptTemplate[]>([]);
  const [slashIndex, setSlashIndex] = useState(0);
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);
  const isLoading = loadingSessionId !== null;
  const isActiveSessionLoading = loadingSessionId === activeId;
  const [streamingContent, setStreaming] = useState("");
  const [queue, setQueue] = useState<string[]>([]);
  const [queueFull, setQueueFull] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<Message[]>(messages);
  const queueRef = useRef<string[]>([]);
  const isLoadingRef = useRef(false);
  const activeIdRef = useRef(activeId);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  // Close export menu on outside click
  useEffect(() => {
    if (!showExport) return;
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setShowExport(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showExport]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, scrollToBottom]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, [input]);

  // ── File attachment ────────────────────────────────────────────────────────
  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    const results: AttachedFile[] = await Promise.all(
      files.map(async (file): Promise<AttachedFile> => {
        const base: AttachedFile = { name: file.name, size: file.size, mimeType: file.type };
        if (file.type.startsWith("image/")) {
          const dataUrl = await new Promise<string>((res) => {
            const reader = new FileReader();
            reader.onload = () => res(reader.result as string);
            reader.readAsDataURL(file);
          });
          return { ...base, dataUrl };
        }
        if (file.size < 512_000) {
          const textContent = await file.text();
          return { ...base, textContent };
        }
        return base;
      }),
    );
    setAttachments((prev) => [...prev, ...results]);
    // Reset file input so user can re-attach same file
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  // Drag-and-drop onto input area
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const synth = {
      target: { files: e.dataTransfer.files },
    } as unknown as ChangeEvent<HTMLInputElement>;
    void handleFileChange(synth);
  };

  // ── Core fetch + stream ───────────────────────────────────────────────────
  const processMessage = useCallback(
    async (userMsg: string, userAttachments: AttachedFile[] = []) => {
      isLoadingRef.current = true;
      setLoadingSessionId(activeIdRef.current);
      setStreaming("");

      // Build content with attachments appended as text
      let fullContent = userMsg;
      const imageAttachments = userAttachments.filter((a) => a.dataUrl);
      const textAttachments = userAttachments.filter((a) => a.textContent);

      if (textAttachments.length > 0) {
        fullContent +=
          "\n\n" +
          textAttachments
            .map((a) => `---\n**Attached: ${a.name}**\n\`\`\`\n${a.textContent}\n\`\`\``)
            .join("\n\n");
      }

      const newUserMsg: Message = {
        id: uid(),
        role: "user",
        content: fullContent,
        attachments: userAttachments.length > 0 ? userAttachments : undefined,
      };

      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeIdRef.current
            ? { ...s, messages: [...s.messages, newUserMsg], updatedAt: Date.now() }
            : s,
        ),
      );
      messagesRef.current = [...messagesRef.current, newUserMsg];

      // Build API history
      const historyForApi = messagesRef.current
        .filter((m) => {
          if (m.role !== "assistant") return true;
          if (m.content.startsWith("**Error:**")) return false;
          if (m.content === "(empty response)") return false;
          return true;
        })
        .map((m) => {
          if (m.role === "user" && imageAttachments.length > 0 && m.id === newUserMsg.id) {
            return {
              role: m.role,
              content: [
                { type: "text", text: m.content },
                ...imageAttachments.map((a) => ({
                  type: "image_url",
                  image_url: { url: a.dataUrl },
                })),
              ],
            };
          }
          return { role: m.role, content: m.content };
        });

      try {
        const res = await fetch(`${API_BASE()}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: localStorage.getItem("lf_model") || "auto",
            messages: historyForApi,
            stream: true,
          }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";
        let traceData: LokaFlowTrace | undefined;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          for (const line of text.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === "data: [DONE]") continue;
            if (!trimmed.startsWith("data: ")) continue;
            try {
              const chunk = JSON.parse(trimmed.slice(6));
              if (chunk._lokaflow_trace) {
                traceData = chunk._lokaflow_trace as LokaFlowTrace;
                continue;
              }
              const delta = chunk.choices?.[0]?.delta?.content;
              if (delta) {
                accumulated += delta;
                setStreaming(accumulated);
              }
            } catch {
              /* skip malformed chunk */
            }
          }
        }

        setStreaming("");
        const assistantMsg: Message = {
          id: uid(),
          role: "assistant",
          content: accumulated || "(empty response)",
          trace: traceData,
        };
        setSessions((prev) =>
          prev.map((s) =>
            s.id === activeIdRef.current
              ? { ...s, messages: [...s.messages, assistantMsg], updatedAt: Date.now() }
              : s,
          ),
        );
        messagesRef.current = [...messagesRef.current, assistantMsg];
      } catch {
        setStreaming("");
        const errMsg: Message = {
          id: uid(),
          role: "assistant",
          content: `**Error:** Could not connect to LokaFlow API at \`${API_BASE()}\`.\n\nMake sure the server is running:\n\`\`\`\nnpx tsx packages/cli/src/index.ts serve\n\`\`\``,
        };
        setSessions((prev) =>
          prev.map((s) =>
            s.id === activeIdRef.current
              ? { ...s, messages: [...s.messages, errMsg], updatedAt: Date.now() }
              : s,
          ),
        );
        messagesRef.current = [...messagesRef.current, errMsg];
      } finally {
        isLoadingRef.current = false;
        setLoadingSessionId(null);

        const nextQueue = [...queueRef.current];
        const nextMsg = nextQueue.shift();
        queueRef.current = nextQueue;
        setQueue(nextQueue);
        if (nextMsg) setTimeout(() => processMessage(nextMsg), 80);
      }
    },
    [],
  );

  // Edit & resend: truncates messages to before the edited message and resends
  const handleEditResend = useCallback(
    (msgId: string, newContent: string) => {
      const idx = messagesRef.current.findIndex((m) => m.id === msgId);
      if (idx === -1) return;
      const truncated = messagesRef.current.slice(0, idx);
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeIdRef.current ? { ...s, messages: truncated, updatedAt: Date.now() } : s,
        ),
      );
      messagesRef.current = truncated;
      processMessage(newContent);
    },
    [processMessage],
  );

  // ── Submit / queue ─────────────────────────────────────────────────────────
  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      const msg = input.trim();
      if (!msg && attachments.length === 0) return;
      const attachsCopy = [...attachments];
      setInput("");
      setAttachments([]);
      setQueueFull(false);

      if (isLoadingRef.current) {
        if (queueRef.current.length < MAX_QUEUE) {
          const next = [...queueRef.current, msg];
          queueRef.current = next;
          setQueue(next);
        } else {
          setQueueFull(true);
          setTimeout(() => setQueueFull(false), 3000);
        }
      } else {
        processMessage(msg, attachsCopy);
      }
    },
    [input, attachments, processMessage],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    if (val.startsWith("/") && val.length > 0) {
      const query = val.slice(1).toLowerCase();
      const matches = templates.filter(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          t.category.toLowerCase().includes(query) ||
          t.template.toLowerCase().includes(query),
      );
      setSlashSuggestions(matches.slice(0, 8));
      setSlashIndex(0);
    } else {
      setSlashSuggestions([]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (slashSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashIndex((i) => Math.min(i + 1, slashSuggestions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const tpl = slashSuggestions[slashIndex];
        if (tpl) {
          setInput(tpl.template);
          setSlashSuggestions([]);
          setTimeout(() => textareaRef.current?.focus(), 50);
        }
        return;
      }
      if (e.key === "Escape") {
        setSlashSuggestions([]);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const clearHistory = () => {
    const id = activeIdRef.current;
    setSessions((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, messages: [WELCOME(id)], updatedAt: Date.now(), title: "New Chat" }
          : s,
      ),
    );
    setQueue([]);
    queueRef.current = [];
  };

  const clearQueue = () => {
    setQueue([]);
    queueRef.current = [];
    setQueueFull(false);
  };

  const useTemplate = (tpl: PromptTemplate) => {
    setInput(tpl.template);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  return (
    <div className="chat-root">
      {/* Session sidebar */}
      <SessionSidebar
        sessions={sessions}
        activeId={activeId}
        onSelect={(id) => {
          setActiveId(id);
          messagesRef.current = sessions.find((s) => s.id === id)?.messages ?? [];
        }}
        onNew={createNewSession}
        onDelete={deleteSession}
        onRename={renameSession}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
      />

      {/* Main chat panel */}
      <div className="chat-container">
        {/* Chat header */}
        <div className="chat-header">
          <div className="chat-header-left">
            <MessageSquare size={15} />
            <span className="chat-header-title">{activeSession?.title ?? "Chat"}</span>
          </div>
          <div className="chat-header-actions">
            <button
              className="chat-header-btn"
              onClick={() => setShowTemplates(true)}
              title="Prompt templates"
            >
              <LayoutTemplate size={14} /> Templates
            </button>
            <div className="export-wrap" ref={exportRef}>
              <button
                className="chat-header-btn"
                onClick={() => setShowExport((v) => !v)}
                title="Export chat"
              >
                <Download size={14} /> Export
              </button>
              {showExport && activeSession && (
                <ExportMenu session={activeSession} onClose={() => setShowExport(false)} />
              )}
            </div>
            <button className="chat-header-btn" onClick={createNewSession} title="New chat">
              <Plus size={14} /> New Chat
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="chat-messages">
          {messages.map((msg, msgIndex) => (
            <div key={msg.id} className={`message-wrapper ${msg.role}`}>
              <div className="avatar">
                {msg.role === "assistant" ? (
                  msg.trace ? (
                    tierIcon(msg.trace.tier)
                  ) : (
                    <Bot size={20} />
                  )
                ) : (
                  <User size={20} />
                )}
              </div>
              <div className="message-col">
                <MessageBubble
                  msg={msg}
                  onEditResend={(newContent) => handleEditResend(msg.id, newContent)}
                  onSaveAsTemplate={handleSaveAsTemplate}
                  onExplain={handleExplainCode}
                />
                {msg.trace && <TracePanel trace={msg.trace} />}
                {msg.role === "assistant" && (
                  <ContextWindowBar
                    msgIndex={msgIndex}
                    messages={messages}
                    model={msg.trace?.model ?? (localStorage.getItem("lf_model") || "qwen2.5:7b")}
                  />
                )}
              </div>
            </div>
          ))}

          {isActiveSessionLoading && (
            <div className="message-wrapper assistant">
              <div className="avatar">
                <Bot size={20} />
              </div>
              <div className="message-col">
                <div className="message-bubble assistant streaming">
                  {streamingContent ? (
                    <MessageContent content={streamingContent} />
                  ) : (
                    <span className="thinking-dots">
                      <Loader2 size={14} className="spin" style={{ marginRight: 6 }} />
                      Routing and thinking…
                    </span>
                  )}
                  {streamingContent && <span className="streaming-cursor" />}
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Footer */}
        <div className="chat-footer">
          <QueueBar queue={queue} onClear={clearQueue} />
          {queueFull && (
            <div className="queue-full-hint" style={{ marginBottom: 6 }}>
              Queue full ({MAX_QUEUE} max) — wait for current messages to finish.
            </div>
          )}

          {/* Attachment pills */}
          {attachments.length > 0 && (
            <div className="attach-pills">
              {attachments.map((a, i) => (
                <div key={i} className="attach-pill">
                  {a.dataUrl ? (
                    <img src={a.dataUrl} alt={a.name} className="attach-thumb" />
                  ) : (
                    <Paperclip size={11} />
                  )}
                  <span>{a.name}</span>
                  <span className="attach-size">({(a.size / 1024).toFixed(1)}KB)</span>
                  <button className="attach-remove" onClick={() => removeAttachment(i)}>
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Slash command dropdown */}
          {slashSuggestions.length > 0 && (
            <div className="slash-dropdown">
              {slashSuggestions.map((tpl, i) => (
                <div
                  key={tpl.id}
                  className={`slash-item${i === slashIndex ? " slash-item-active" : ""}`}
                  onMouseEnter={() => setSlashIndex(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setInput(tpl.template);
                    setSlashSuggestions([]);
                    setTimeout(() => textareaRef.current?.focus(), 50);
                  }}
                >
                  <span className="slash-title">{tpl.name}</span>
                  <span className="slash-category">{tpl.category}</span>
                </div>
              ))}
              <div className="slash-hint">↑↓ navigate · Enter select · Esc close</div>
            </div>
          )}

          {/* Input row */}
          <div
            className="chat-input-row"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.txt,.md,.csv,.json,.pdf,.ts,.js,.py,.sh,.yaml,.yml"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
            <button
              className="chat-attach-btn"
              onClick={() => fileInputRef.current?.click()}
              title="Attach file (or drag & drop)"
            >
              <Paperclip size={16} />
            </button>
            <textarea
              ref={textareaRef}
              className="chat-textarea"
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={
                isLoading && queue.length >= MAX_QUEUE
                  ? `Queue full (${MAX_QUEUE}/${MAX_QUEUE}) — wait for responses…`
                  : isLoading
                    ? `Processing… type to queue (${queue.length}/${MAX_QUEUE})`
                    : "Ask LokaFlow… (Enter to send, Shift+Enter for newline)"
              }
              rows={1}
            />
            <button
              className="chat-send-btn"
              onClick={() => handleSubmit()}
              disabled={
                (!input.trim() && attachments.length === 0) ||
                (isLoading && queue.length >= MAX_QUEUE)
              }
              title={isLoading ? `Add to queue (${queue.length}/${MAX_QUEUE})` : "Send"}
            >
              {isLoading ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
            </button>
          </div>

          {/* Pre-send cost estimator */}
          <CostEstimator prompt={input} />

          <div className="chat-footer-hint">
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Zap size={11} /> Routed locally by default · Cloud only when complexity &gt; 0.65
              {queue.length > 0 && (
                <span style={{ color: "#fbbf24", marginLeft: 8 }}>· {queue.length} queued</span>
              )}
            </span>
            <button
              className="chat-clear-btn"
              onClick={clearHistory}
              title="Clear conversation history"
            >
              <XCircle size={11} /> Clear history
            </button>
          </div>
        </div>
      </div>

      {/* Templates modal */}
      {showTemplates && (
        <TemplatesModal
          templates={templates}
          onUse={useTemplate}
          onSave={saveTemplate}
          onDelete={deleteTemplate}
          onClose={() => {
            setShowTemplates(false);
            setTemplatePrefill(null);
          }}
          prefillContent={templatePrefill}
        />
      )}
    </div>
  );
}
