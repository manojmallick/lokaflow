// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
//
// apps/web/src/components/LogViewer.tsx
// Live log viewer — streams lokaflow-routing.log via SSE, with filtering and
// colour-coded line classification matching the TracePanel in Chat.tsx.
/* eslint-disable @typescript-eslint/explicit-function-return-type */

import "./LogViewer.css";
import { useState, useEffect, useRef, useCallback, type JSX } from "react";
import {
  Terminal,
  Wifi,
  WifiOff,
  RotateCcw,
  ArrowDown,
  Copy,
  Check,
  Search,
  X,
  Hash,
  FileText,
} from "lucide-react";

const API_BASE = (): string => {
  const raw = localStorage.getItem("lf_api_url") || "http://127.0.0.1:4141";
  return raw.trim().replace(/\/+$/, "");
};

const MAX_BUFFER = 2000;

// ── Line colour classifier ────────────────────────────────────────────────────

function lineClass(line: string): string {
  const l = line.trim();
  if (!l) return "lv-blank";
  if (l.includes("─── NEW ROUTING REQUEST ───")) return "lv-header";
  // LokaAgent pipeline lines
  if (l.startsWith("[AGENT]") && l.includes("Pipeline complete")) return "lv-ok";
  if (l.startsWith("[AGENT]") && l.includes("escalated")) return "lv-warn";
  if (l.startsWith("[AGENT]") && l.includes("QualityGate")) {
    // "0 nodes passed" means all failed
    return /\b0\//.test(l) ? "lv-warn" : "lv-agent";
  }
  if (l.startsWith("[AGENT]")) return "lv-agent";
  // Old delegation lines (kept for backward compat with older logs)
  if (l.startsWith("[DELEGATION]") && l.includes("failed")) return "lv-error";
  if (l.startsWith("[DELEGATION]")) return "lv-agent";
  // Subtask execution
  if (l.includes("↪") && l.includes("completed")) return "lv-ok";
  if (l.includes("ESCALATED")) return "lv-warn";
  if (l.includes("↪") && l.includes("failed")) return "lv-error";
  if (l.includes("[Depth")) return "lv-subtask";
  // Router pipeline steps
  if (l.startsWith("error:") || l.includes("FAILED")) return "lv-error";
  if (l.startsWith("fallback:") || l.includes("BUDGET EXCEEDED")) return "lv-warn";
  if (l.startsWith("result:")) return "lv-ok";
  if (l.startsWith("decision:")) return "lv-decision";
  if (l.startsWith("step 3:")) return "lv-classify";
  if (l.startsWith("step 4(b)") && l.includes("EXCEEDED")) return "lv-error";
  if (l.startsWith("step ")) return "lv-step";
  if (l.startsWith("config:")) return "lv-config";
  // Indented sub-lines
  if (line.startsWith("  ") || line.startsWith("\t")) return "lv-indent";
  return "lv-default";
}

// ── Component ─────────────────────────────────────────────────────────────────

export function LogViewer(): JSX.Element {
  // Each entry carries a monotonically increasing seq so React can use it as a
  // stable key even when displayLines is sliced or re-filtered.
  const seqRef = useRef(0);
  const [lines, setLines] = useState<{ seq: number; text: string; cls: string }[]>([]);
  const [filter, setFilter] = useState("");
  const [live, setLive] = useState(true);
  const [connected, setConnected] = useState(false);
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [lineLimit, setLineLimit] = useState<200 | 500 | 1000 | 2000>(200);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    esRef.current?.close();
    setLines([]);
    setConnected(false);

    const es = new EventSource(`${API_BASE()}/v1/logs/stream`);
    esRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (evt) => {
      try {
        const { line } = JSON.parse(evt.data) as { line: string };
        setLines((prev) => {
          const next = [...prev, { seq: ++seqRef.current, text: line, cls: lineClass(line) }];
          return next.length > MAX_BUFFER ? next.slice(-MAX_BUFFER) : next;
        });
      } catch {
        // ignore malformed SSE frames
      }
    };
  }, []);

  // Manage live SSE connection — only re-run when live/connect changes.
  // Keeping lineLimit out of this effect prevents a reconnect (and data loss)
  // when the user changes the line-limit selector while streaming.
  useEffect(() => {
    if (live) {
      connect();
    }
    return () => {
      esRef.current?.close();
    };
  }, [live, connect]);

  // Fetch snapshot via REST when not live, or when lineLimit changes while paused.
  useEffect(() => {
    if (live) return; // SSE effect above handles the live case
    esRef.current?.close();
    esRef.current = null;
    setConnected(false);
    fetch(`${API_BASE()}/v1/logs/raw?lines=${lineLimit}`)
      .then((r) => r.json())
      .then((d: { lines?: string[] }) =>
        setLines(
          (Array.isArray(d.lines) ? d.lines : []).map((text) => ({
            seq: ++seqRef.current,
            text,
            cls: lineClass(text),
          })),
        ),
      )
      .catch(() => setLines([]));
  }, [live, lineLimit]);

  // Auto-scroll to bottom when new lines arrive
  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: "auto" });
    }
  }, [lines, autoScroll]);

  // Detect manual scroll up → disable auto-scroll
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setAutoScroll(nearBottom);
  }, []);

  const safeLines = Array.isArray(lines) ? lines : [];
  const filteredLines = filter.trim()
    ? safeLines.filter((e) => e.text.toLowerCase().includes(filter.toLowerCase()))
    : safeLines;

  const displayLines = filteredLines.slice(-lineLimit);

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(displayLines.map((l) => l.text).join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      // clipboard API can reject in non-secure contexts or when permission is denied.
      if (import.meta.env.DEV) {
        console.error("Failed to copy logs to clipboard:", err);
      }
    }
  }

  return (
    <div className="lv-wrap">
      {/* ── Toolbar ── */}
      <div className="lv-toolbar">
        <div className="lv-title">
          <Terminal size={16} />
          Routing Log
        </div>
        <div className={`lv-badge${connected ? "" : " disconnected"}`}>
          {connected ? (
            <>
              <Wifi size={10} /> live
            </>
          ) : (
            <>
              <WifiOff size={10} /> offline
            </>
          )}
        </div>

        <div className="lv-search">
          <Search size={12} style={{ color: "#666", flexShrink: 0 }} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter lines…"
          />
          {filter && (
            <button
              type="button"
              onClick={() => setFilter("")}
              aria-label="Clear filter"
              title="Clear filter"
              style={{
                background: "none",
                border: "none",
                padding: 0,
                margin: 0,
                cursor: "pointer",
                display: "flex",
              }}
            >
              <X size={12} style={{ color: "#666" }} />
            </button>
          )}
        </div>

        <select
          className="lv-select"
          value={lineLimit}
          onChange={(e) => setLineLimit(Number(e.target.value) as typeof lineLimit)}
        >
          <option value={200}>200 lines</option>
          <option value={500}>500 lines</option>
          <option value={1000}>1 000 lines</option>
          <option value={2000}>2 000 lines</option>
        </select>

        <button className={`lv-btn${live ? " active" : ""}`} onClick={() => setLive((v) => !v)}>
          {live ? (
            <>
              <Wifi size={12} /> Live
            </>
          ) : (
            <>
              <WifiOff size={12} /> Paused
            </>
          )}
        </button>

        <button className="lv-btn" onClick={connect} title="Reconnect">
          <RotateCcw size={12} /> Reconnect
        </button>

        <button className="lv-btn" onClick={copyAll}>
          {copied ? (
            <>
              <Check size={12} /> Copied
            </>
          ) : (
            <>
              <Copy size={12} /> Copy
            </>
          )}
        </button>

        <button
          className={`lv-btn${autoScroll ? " active" : ""}`}
          onClick={() => {
            setAutoScroll(true);
            bottomRef.current?.scrollIntoView({ behavior: "auto" });
          }}
          title="Jump to bottom"
        >
          <ArrowDown size={12} />
        </button>
      </div>

      {/* ── Log body ── */}
      <div className="lv-body" ref={containerRef} onScroll={handleScroll}>
        {displayLines.length === 0 ? (
          <div className="lv-empty">
            <FileText size={32} />
            <span>
              {filter ? "No lines match filter" : "No log entries yet — send a chat message"}
            </span>
          </div>
        ) : (
          displayLines.map(({ seq, text, cls }, i) => (
            <div key={seq} className={`lv-line ${cls}`}>
              <span className="lv-lnum">{i + 1}</span>
              <span className="lv-text">{text}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Footer ── */}
      <div className="lv-footer">
        <span>
          <Hash size={10} style={{ display: "inline", marginRight: 3 }} />
          {safeLines.length.toLocaleString()} lines
          {filter && ` (filtered from ${lines.length.toLocaleString()})`}
        </span>
        <span>lokaflow-routing.log</span>
      </div>
    </div>
  );
}
