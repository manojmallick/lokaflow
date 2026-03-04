/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { useMemo, useState } from "react";
import { Clock, Download, Filter, Hash, MessageSquare, Search, X } from "lucide-react";

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

function loadSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem("lf_chat_sessions");
    return raw ? (JSON.parse(raw) as ChatSession[]) : [];
  } catch {
    return [];
  }
}

interface SearchResult {
  session: ChatSession;
  message: Message;
  score: number;
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text.length > 120 ? text.slice(0, 120) + "…" : text;
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + query.length + 60);
  const pre = start > 0 ? "…" : "";
  const post = end < text.length ? "…" : "";
  return (
    <>
      {pre}
      {text.slice(start, idx)}
      <mark
        style={{ background: "rgba(251,191,36,.3)", color: "var(--text-main)", borderRadius: 2 }}
      >
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length, end)}
      {post}
    </>
  );
}

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
  if (v < 0.01) return `€${v.toFixed(4)}`;
  return `€${v.toFixed(3)}`;
}

export function History() {
  const [query, setQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<"all" | "local" | "cloud">("all");
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [selectedMsg, setSelectedMsg] = useState<string | null>(null);

  const sessions = useMemo(() => loadSessions(), []);

  const results = useMemo((): SearchResult[] => {
    const q = query.trim().toLowerCase();
    const out: SearchResult[] = [];

    for (const session of sessions) {
      for (const msg of session.messages) {
        if (msg.role !== "user" && !q) continue;

        const tierOk =
          tierFilter === "all" ||
          (msg.role === "assistant" && msg.trace?.tier === tierFilter) ||
          (tierFilter === "local" && msg.role === "user");

        if (!tierOk) continue;

        const text = msg.content.toLowerCase();
        let score = 0;

        if (!q) {
          // No query → show all user messages ordered by date
          if (msg.role !== "user") continue;
          score = 1;
        } else {
          if (!text.includes(q)) continue;
          score = 1 + (text.indexOf(q) === 0 ? 2 : 0);
        }

        out.push({ session, message: msg, score });
      }
    }

    // Sort by session updatedAt descending
    out.sort((a, b) => b.session.updatedAt - a.session.updatedAt);
    return out.slice(0, 100);
  }, [query, tierFilter, sessions]);

  const totalTokens = useMemo(() => {
    return sessions
      .flatMap((s) => s.messages)
      .reduce((a, m) => {
        const t = m.trace;
        return a + (t ? t.inputTokens + t.outputTokens : 0);
      }, 0);
  }, [sessions]);

  const totalCost = useMemo(() => {
    return sessions.flatMap((s) => s.messages).reduce((a, m) => a + (m.trace?.costEur ?? 0), 0);
  }, [sessions]);

  function exportHistory() {
    const blob = new Blob([JSON.stringify(sessions, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lokaflow-history-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="history-root">
      {/* Header */}
      <div className="history-header">
        <h1>
          <Search size={20} style={{ marginRight: 8, verticalAlign: "middle" }} />
          History Search
        </h1>
        <div className="history-meta">
          <span>
            <MessageSquare size={12} style={{ verticalAlign: "middle", marginRight: 3 }} />
            {sessions.length} sessions
          </span>
          <span>
            <Hash size={12} style={{ verticalAlign: "middle", marginRight: 3 }} />
            {totalTokens.toLocaleString()} tokens
          </span>
          <span style={{ color: "#fbbf24" }}>{fmtEur(totalCost)} cloud spend</span>
          <button
            className="btn-secondary"
            style={{
              fontSize: 11,
              padding: "4px 10px",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
            onClick={exportHistory}
          >
            <Download size={13} /> Export
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div className="history-search-bar">
        <div style={{ position: "relative", flex: 1, maxWidth: 520 }}>
          <Search
            size={15}
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-muted)",
            }}
          />
          <input
            className="history-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search across all sessions, prompts, responses…"
            autoFocus
          />
          {query && (
            <button
              style={{
                position: "absolute",
                right: 10,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
              }}
              onClick={() => setQuery("")}
            >
              <X size={14} />
            </button>
          )}
        </div>
        <div className="history-filters">
          <Filter size={13} style={{ color: "var(--text-muted)" }} />
          {(["all", "local", "cloud"] as const).map((t) => (
            <button
              key={t}
              className={`history-filter-btn ${tierFilter === t ? "active" : ""}`}
              onClick={() => setTierFilter(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      <div className="history-results">
        {results.length === 0 ? (
          <div className="empty-state">
            <Search size={32} />
            <strong>{query ? `No results for "${query}"` : "No history found"}</strong>
            <span>{query ? "Try different keywords" : "Start chatting to build history"}</span>
          </div>
        ) : (
          <>
            <div className="history-results-count">
              {query
                ? `${results.length} result${results.length !== 1 ? "s" : ""} for "${query}"`
                : `Showing ${results.length} recent queries`}
            </div>
            <div className="history-list">
              {results.map((r, i) => {
                const isSelected = selectedMsg === r.message.id && selectedSession === r.session.id;
                // Find the assistant reply after this user message
                const msgIdx = r.session.messages.indexOf(r.message);
                const reply = r.session.messages[msgIdx + 1];

                return (
                  <div
                    key={`${r.session.id}-${r.message.id}-${i}`}
                    className={`history-item ${isSelected ? "selected" : ""}`}
                    onClick={() => {
                      setSelectedSession(r.session.id);
                      setSelectedMsg(r.message.id);
                    }}
                  >
                    <div className="history-item-header">
                      <span className="history-session-name">{r.session.title}</span>
                      <span className="history-item-time">
                        <Clock size={11} /> {fmtDate(r.session.updatedAt)}
                      </span>
                    </div>

                    <div className="history-item-prompt">{highlight(r.message.content, query)}</div>

                    {isSelected && reply && (
                      <div className="history-item-reply">
                        <div className="history-reply-label">Response:</div>
                        <div className="history-reply-content">
                          {reply.content.length > 300
                            ? reply.content.slice(0, 300) + "…"
                            : reply.content}
                        </div>
                      </div>
                    )}

                    <div className="history-item-meta">
                      {reply?.trace && (
                        <>
                          <span
                            className={`history-tier-badge ${reply.trace.tier === "local" ? "local" : "cloud"}`}
                          >
                            {reply.trace.tier === "local" ? "🖥 Local" : "☁ Cloud"}
                          </span>
                          <span>{reply.trace.model}</span>
                          <span>{reply.trace.latencyMs}ms</span>
                          <span>{fmtEur(reply.trace.costEur)}</span>
                          <span>
                            {(reply.trace.inputTokens + reply.trace.outputTokens).toLocaleString()}{" "}
                            tok
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
