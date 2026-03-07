/* eslint-disable @typescript-eslint/explicit-function-return-type */
import React, { useState, useRef } from "react";
import { FlaskConical, Loader2, RotateCcw, Send, Star, Trophy } from "lucide-react";

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

const DEFAULT_MODELS_A = [
  "qwen2.5:7b",
  "qwen2.5-coder:7b",
  "tinyllama:1.1b",
  "mistral:7b",
  "llama3:8b",
  "phi:latest",
];
const DEFAULT_MODELS_B = [
  "qwen2.5:7b",
  "qwen2.5-coder:7b",
  "tinyllama:1.1b",
  "mistral:7b",
  "llama3:8b",
  "phi:latest",
  "gemini-2.0-flash",
  "claude-3-haiku",
  "gpt-4o-mini",
];

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

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  const btnRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // ARIA radiogroup keyboard interaction: ArrowRight/Left move selection; only
  // the currently selected star (or star 1 if none) is in the tab order.
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.min(5, value + 1);
      onChange(next);
      btnRefs.current[next - 1]?.focus();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      const prev = Math.max(1, value - 1);
      onChange(prev);
      btnRefs.current[prev - 1]?.focus();
    }
  }

  const tabbableIdx = (value || 1) - 1; // one item in tab order at a time

  return (
    <div
      role="radiogroup"
      aria-label="Rating"
      style={{ display: "flex", gap: 2 }}
      onKeyDown={handleKeyDown}
    >
      {[1, 2, 3, 4, 5].map((s, idx) => (
        <button
          key={s}
          ref={(el) => {
            btnRefs.current[idx] = el;
          }}
          role="radio"
          aria-checked={value === s}
          aria-label={`Rate ${s} out of 5`}
          tabIndex={idx === tabbableIdx ? 0 : -1}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}
          onMouseEnter={() => setHover(s)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(s)}
        >
          <Star
            size={16}
            fill={(hover || value) >= s ? "#fbbf24" : "none"}
            stroke={(hover || value) >= s ? "#fbbf24" : "var(--text-muted)"}
          />
        </button>
      ))}
    </div>
  );
}

function mockRun(model: string, prompt: string): Promise<RunResult> {
  const isCloud = model.includes("gemini") || model.includes("claude") || model.includes("gpt");
  const baseLatency = isCloud ? 8000 + Math.random() * 15000 : 1500 + Math.random() * 5000;
  const tokens = Math.ceil(prompt.length / 3) + Math.floor(Math.random() * 300) + 100;
  const costEur = isCloud ? (tokens / 1000) * 0.002 : 0;

  return new Promise((resolve) => {
    setTimeout(
      () => {
        resolve({
          output: `[Mock output from ${model}]\n\nHere is the analysis of your prompt:\n\n${prompt.slice(0, 80)}...\n\nKey points:\n- This is a simulated response from ${model}\n- Connect to a real LokaFlow server to get live outputs\n- Compare quality by rating both responses below`,
          latencyMs: Math.round(baseLatency),
          tokens,
          costEur,
          rating: 0,
        });
      },
      Math.min(baseLatency, 2000),
    ); // Cap demo at 2s
  });
}

export function Playground() {
  const [modelA, setModelA] = useState("qwen2.5:7b");
  const [modelB, setModelB] = useState("qwen2.5-coder:7b");
  const [prompt, setPrompt] = useState("");
  const [resultA, setResultA] = useState<RunResult | null>(null);
  const [resultB, setResultB] = useState<RunResult | null>(null);
  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);
  const [benchmark, setBenchmark] = useState<BenchmarkEntry[]>(DEMO_BENCHMARK);

  async function runComparison() {
    if (!prompt.trim()) return;
    setResultA(null);
    setResultB(null);
    setLoadingA(true);
    setLoadingB(true);

    const [rA, rB] = await Promise.all([
      mockRun(modelA, prompt).finally(() => setLoadingA(false)),
      mockRun(modelB, prompt).finally(() => setLoadingB(false)),
    ]);

    setResultA(rA);
    setResultB(rB);
  }

  function rateA(rating: number) {
    setResultA((r) => (r ? { ...r, rating } : null));
  }

  function rateB(rating: number) {
    setResultB((r) => (r ? { ...r, rating } : null));
  }

  function saveToHistory() {
    if (!resultA || !resultB || !prompt) return;
    const winnerModel = resultA.rating >= resultB.rating ? modelA : modelB;
    // Derive category from prompt
    const lower = prompt.toLowerCase();
    let category = "General";
    if (lower.includes("code") || lower.includes("function") || lower.includes("debug"))
      category = "Code generation";
    else if (lower.includes("dora") || lower.includes("compliance") || lower.includes("gdpr"))
      category = "Compliance analysis";
    else if (lower.includes("summar")) category = "Summarisation";
    else if (lower.includes("creat") || lower.includes("writ") || lower.includes("story"))
      category = "Creative writing";

    setBenchmark((prev) => {
      const existing = prev.find((b) => b.category === category);
      if (existing) {
        return prev.map((b) =>
          b.category === category
            ? {
                ...b,
                queryCount: b.queryCount + 1,
                winner: winnerModel,
                avgRating:
                  (b.avgRating * b.queryCount + Math.max(resultA.rating, resultB.rating)) /
                  (b.queryCount + 1),
                avgLatencyMs: Math.round(
                  (b.avgLatencyMs * b.queryCount + (resultA.latencyMs + resultB.latencyMs) / 2) /
                    (b.queryCount + 1),
                ),
              }
            : b,
        );
      }
      return [
        ...prev,
        {
          category,
          winner: winnerModel,
          avgRating: Math.max(resultA.rating, resultB.rating),
          queryCount: 1,
          avgLatencyMs: (resultA.latencyMs + resultB.latencyMs) / 2,
        },
      ];
    });
  }

  const winner =
    resultA && resultB && resultA.rating > 0 && resultB.rating > 0
      ? resultA.rating > resultB.rating
        ? modelA
        : resultB.rating > resultA.rating
          ? modelB
          : "Tie"
      : null;

  return (
    <div className="playground-root">
      {/* Header */}
      <div className="batch-header">
        <div>
          <h1>
            <FlaskConical size={20} style={{ marginRight: 8, verticalAlign: "middle" }} />
            Model Playground
          </h1>
          <p className="subtitle">Test any two models side-by-side on your own prompts.</p>
        </div>
        <button
          className="btn-secondary"
          style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}
          onClick={() => {
            setResultA(null);
            setResultB(null);
            setPrompt("");
          }}
        >
          <RotateCcw size={13} /> Reset
        </button>
      </div>

      {/* Model selector */}
      <div className="playground-selectors">
        <div className="playground-model-col">
          <label style={{ fontSize: 11, color: "var(--text-muted)" }}>Model A</label>
          <select
            className="playground-model-select"
            value={modelA}
            onChange={(e) => setModelA(e.target.value)}
          >
            {DEFAULT_MODELS_A.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </div>
        <div
          style={{
            fontSize: 18,
            color: "var(--text-muted)",
            alignSelf: "flex-end",
            paddingBottom: 6,
          }}
        >
          vs
        </div>
        <div className="playground-model-col">
          <label style={{ fontSize: 11, color: "var(--text-muted)" }}>Model B</label>
          <select
            className="playground-model-select"
            value={modelB}
            onChange={(e) => setModelB(e.target.value)}
          >
            {DEFAULT_MODELS_B.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Prompt input */}
      <div className="playground-prompt-area">
        <textarea
          className="playground-textarea"
          placeholder="Enter your prompt here… Try: 'Explain the difference between DORA Article 11 and Article 12' or 'Write a Python function that validates an IBAN'"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
        />
        <button
          className="btn-primary"
          style={{ display: "flex", alignItems: "center", gap: 6, alignSelf: "flex-end" }}
          onClick={runComparison}
          disabled={!prompt.trim() || loadingA || loadingB}
        >
          {loadingA || loadingB ? <Loader2 size={15} className="spin" /> : <Send size={15} />}
          Run Side-by-Side
        </button>
      </div>

      {/* Results */}
      {(resultA || resultB || loadingA || loadingB) && (
        <div className="playground-results">
          {[
            { model: modelA, result: resultA, loading: loadingA, onRate: rateA },
            { model: modelB, result: resultB, loading: loadingB, onRate: rateB },
          ].map(({ model, result, loading, onRate }) => (
            <div
              key={model}
              className={`playground-result-col ${winner === model ? "playground-winner" : ""}`}
            >
              <div className="playground-result-header">
                <strong style={{ fontSize: 13 }}>{model}</strong>
                {winner === model && (
                  <span className="playground-winner-badge">
                    <Trophy size={12} /> Winner
                  </span>
                )}
              </div>

              {loading ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "40px 0",
                    justifyContent: "center",
                    color: "var(--text-muted)",
                    fontSize: 13,
                  }}
                >
                  <Loader2 size={16} className="spin" /> Running on {model}…
                </div>
              ) : result ? (
                <>
                  <div className="playground-output">{result.output}</div>
                  <div className="playground-stats">
                    <span>
                      {result.latencyMs < 1000
                        ? `${result.latencyMs}ms`
                        : `${(result.latencyMs / 1000).toFixed(1)}s`}
                    </span>
                    <span>{result.tokens.toLocaleString()} tok</span>
                    <span style={{ color: result.costEur === 0 ? "#4ade80" : "#fbbf24" }}>
                      {result.costEur === 0 ? "€0.00" : `€${result.costEur.toFixed(4)}`}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 4 }}>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Rate:</span>
                    <StarRating value={result.rating} onChange={onRate} />
                    {result.rating > 0 && (
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {result.rating}/5
                      </span>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {winner && winner !== "Tie" && resultA && resultB && (
        <div
          style={{
            background: "rgba(59,130,246,.07)",
            border: "1px solid rgba(59,130,246,.2)",
            borderRadius: 8,
            padding: "12px 16px",
            fontSize: 13,
          }}
        >
          <strong style={{ color: "#93c5fd" }}>Result: </strong>
          <span style={{ color: "var(--text-main)" }}>{winner} wins — better quality</span>
          {winner !== modelB && resultA.latencyMs > resultB.latencyMs
            ? `, ${((resultB.latencyMs / resultA.latencyMs) * 100).toFixed(0)}% faster on ${modelB}`
            : ""}
          <button
            className="btn-secondary"
            style={{ float: "right", fontSize: 11, padding: "3px 10px" }}
            onClick={saveToHistory}
          >
            Save to benchmark history
          </button>
        </div>
      )}
      {winner === "Tie" && (
        <div
          style={{
            fontSize: 13,
            color: "var(--text-muted)",
            textAlign: "center",
            padding: "8px 0",
          }}
        >
          Tie — both models rated equally
        </div>
      )}

      {/* Benchmark history */}
      <div className="playground-benchmark">
        <div className="batch-section-title">Your Benchmark History</div>
        <table className="playground-bench-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Best Model</th>
              <th>Avg Rating</th>
              <th>Queries</th>
              <th>Avg Latency</th>
            </tr>
          </thead>
          <tbody>
            {benchmark.map((b) => (
              <tr key={b.category}>
                <td>{b.category}</td>
                <td style={{ color: "var(--accent)" }}>{b.winner}</td>
                <td style={{ color: "#fbbf24" }}>★ {b.avgRating.toFixed(1)}/5</td>
                <td>{b.queryCount}</td>
                <td style={{ color: "var(--text-muted)" }}>
                  {b.avgLatencyMs < 1000
                    ? `${b.avgLatencyMs}ms`
                    : `${(b.avgLatencyMs / 1000).toFixed(1)}s`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
