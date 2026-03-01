import { useState, useRef, useEffect, useCallback } from 'react';
import {
    Send, Bot, User, Loader2, Copy, Check, Cpu, Cloud, Zap,
    ChevronDown, ChevronUp, Shield, Coins, GitBranch, Terminal,
    CheckCircle2, XCircle, AlertCircle, Clock, Hash, ArrowRight, Network
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';

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
    role: 'user' | 'assistant';
    content: string;
    trace?: LokaFlowTrace;
}

// ─── CopyButton ──────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button className="copy-btn" onClick={() => {
            navigator.clipboard.writeText(text).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            });
        }}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'Copied' : 'Copy'}
        </button>
    );
}

// ─── MessageContent ───────────────────────────────────────────────────────────

function MessageContent({ content }: { content: string }) {
    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
            components={{
                pre({ children, ...props }) {
                    const codeEl = (children as React.ReactElement)?.props;
                    const codeText = codeEl?.children ?? '';
                    const lang = (codeEl?.className ?? '').replace('language-', '');
                    return (
                        <div className="code-block-wrapper">
                            <div className="code-block-header">
                                <span className="code-lang">{lang || 'code'}</span>
                                <CopyButton text={String(codeText).trimEnd()} />
                            </div>
                            <pre {...props}>{children}</pre>
                        </div>
                    );
                },
                code({ children, className, ...props }) {
                    if (className?.startsWith('language-'))
                        return <code className={className} {...props}>{children}</code>;
                    return <code className="inline-code" {...props}>{children}</code>;
                },
                a({ href, children }) {
                    return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
                },
                table({ children }) {
                    return <div className="md-table-wrapper"><table>{children}</table></div>;
                },
            }}
        >
            {content}
        </ReactMarkdown>
    );
}

// ─── TraceLine parser ─────────────────────────────────────────────────────────

type TraceStepKind =
    | 'header' | 'config' | 'memory' | 'pii' | 'tokens' | 'search'
    | 'classify' | 'provider' | 'budget' | 'dispatch'
    | 'delegation' | 'subtask' | 'subtask_done' | 'subtask_fail'
    | 'error' | 'fallback' | 'result' | 'decision' | 'info';

interface TraceStep {
    kind: TraceStepKind;
    raw: string;
    status: 'ok' | 'warn' | 'error' | 'info';
}

function classifyLine(line: string): TraceStep {
    const raw = line;
    const l = line.trim();

    if (l.includes('─── NEW ROUTING REQUEST ───'))    return { kind: 'header',        raw, status: 'info' };
    if (l.startsWith('config:'))                      return { kind: 'config',        raw, status: 'info' };
    if (l.startsWith('step 0:'))                      return { kind: 'memory',        raw, status: 'ok' };
    if (l.startsWith('step 1:') && l.includes('PII detected')) return { kind: 'pii', raw, status: 'warn' };
    if (l.startsWith('step 1:'))                      return { kind: 'pii',           raw, status: 'ok' };
    if (l.startsWith('step 2b:'))                     return { kind: 'search',        raw, status: 'ok' };
    if (l.startsWith('step 2:'))                      return { kind: 'tokens',        raw, status: 'ok' };
    if (l.startsWith('step 3:'))                      return { kind: 'classify',      raw, status: 'ok' };
    if (l.startsWith('step 4(b)') && l.includes('EXCEEDED')) return { kind: 'budget', raw, status: 'error' };
    if (l.startsWith('step 4(b)'))                    return { kind: 'budget',        raw, status: 'ok' };
    if (l.startsWith('step 4:'))                      return { kind: 'provider',      raw, status: 'ok' };
    if (l.startsWith('step 5:'))                      return { kind: 'dispatch',      raw, status: 'ok' };
    if (l.startsWith('[DELEGATION]') && l.includes('failed')) return { kind: 'delegation', raw, status: 'error' };
    if (l.startsWith('[DELEGATION]'))                 return { kind: 'delegation',    raw, status: 'ok' };
    if (l.includes('↪') && l.includes('completed'))  return { kind: 'subtask_done',  raw, status: 'ok' };
    if (l.includes('↪') || l.includes('failed'))     return { kind: 'subtask_fail',  raw, status: 'error' };
    if (l.includes('[Depth') || l.includes('Subtask'))return { kind: 'subtask',       raw, status: 'info' };
    if (l.startsWith('error:'))                       return { kind: 'error',         raw, status: 'error' };
    if (l.startsWith('fallback:'))                    return { kind: 'fallback',       raw, status: 'warn' };
    if (l.startsWith('result:'))                      return { kind: 'result',        raw, status: 'ok' };
    if (l.startsWith('decision:'))                    return { kind: 'decision',      raw, status: 'ok' };
    return { kind: 'info', raw, status: 'info' };
}

const STEP_ICONS: Record<TraceStepKind, React.ReactNode> = {
    header:       <Network size={13} />,
    config:       <Terminal size={13} />,
    memory:       <Hash size={13} />,
    pii:          <Shield size={13} />,
    tokens:       <Hash size={13} />,
    search:       <Zap size={13} />,
    classify:     <GitBranch size={13} />,
    provider:     <ArrowRight size={13} />,
    budget:       <Coins size={13} />,
    dispatch:     <Zap size={13} />,
    delegation:   <Network size={13} />,
    subtask:      <ArrowRight size={13} />,
    subtask_done: <CheckCircle2 size={13} />,
    subtask_fail: <XCircle size={13} />,
    error:        <XCircle size={13} />,
    fallback:     <AlertCircle size={13} />,
    result:       <CheckCircle2 size={13} />,
    decision:     <CheckCircle2 size={13} />,
    info:         <ArrowRight size={13} />,
};

// ─── TracePanel ───────────────────────────────────────────────────────────────

function TracePanel({ trace }: { trace: LokaFlowTrace }) {
    const [open, setOpen] = useState(false);
    const steps = trace.trace.map(classifyLine).filter(s => s.kind !== 'header');

    const tierColor = trace.tier === 'local' ? '#10b981'
        : trace.tier === 'cloud' ? '#eab308'
        : trace.tier === 'delegated' ? '#8b5cf6'
        : '#3b82f6';

    // Parse subtask timing info for visual agent tree
    const subtasksDone = steps.filter(s => s.kind === 'subtask_done');
    const isDelegated  = trace.tier === 'delegated';

    // Extract the provider node/IP from "step 5: dispatching request to X"
    const step5 = trace.trace.find(l => /step 5:/i.test(l));
    const nodeAddrRaw = step5?.match(/dispatching request to\s+(\S+)/i)?.[1] ?? '';
    const nodeAddr = nodeAddrRaw.replace(/^ollama\[/, '').replace(/\]$/, '');

    function fmtMs(ms: number) {
        if (ms >= 60000) return `${(ms / 60000).toFixed(1)}m`;
        if (ms >= 1000)  return `${(ms / 1000).toFixed(1)}s`;
        return `${ms}ms`;
    }

    return (
        <div className="trace-panel">
            {/* Summary bar — always visible */}
            <button className="trace-toggle" onClick={() => setOpen(o => !o)}>
                <div className="trace-summary">
                    <span className="trace-tier-pip" style={{ background: tierColor }} />
                    <span className="trace-tier-lbl" style={{ color: tierColor }}>{trace.tier}</span>
                    <span className="trace-divider">·</span>
                    <span className="trace-model-lbl">{shortModel(trace.model)}</span>
                    {nodeAddr && <>
                        <span className="trace-divider">·</span>
                        <Network size={11} />
                        <span className="trace-node-label">{nodeAddr}</span>
                    </>}
                    <span className="trace-divider">·</span>
                    <Clock size={11} />
                    <span>{fmtMs(trace.latencyMs)}</span>
                    <span className="trace-divider">·</span>
                    <Hash size={11} />
                    <span>{(trace.inputTokens + trace.outputTokens).toLocaleString()} tok</span>
                    {trace.costEur > 0 && <>
                        <span className="trace-divider">·</span>
                        <Coins size={11} />
                        <span className="trace-cost">€{trace.costEur.toFixed(5)}</span>
                    </>}
                    <span className="trace-score">(score {trace.complexityScore.toFixed(2)})</span>
                </div>
                <div className="trace-expand-btn">
                    {open ? <><ChevronUp size={13} /> Hide trace</> : <><ChevronDown size={13} /> View trace</>}
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
                            <div className="ttc-val">{(trace.inputTokens + trace.outputTokens).toLocaleString()}</div>
                        </div>
                        <div className="trace-token-card">
                            <div className="ttc-label">Latency</div>
                            <div className="ttc-val">{fmtMs(trace.latencyMs)}</div>
                        </div>
                        <div className="trace-token-card">
                            <div className="ttc-label">Cost</div>
                            <div className="ttc-val" style={{ color: trace.costEur > 0 ? '#eab308' : '#10b981' }}>
                                {trace.costEur > 0 ? `€${trace.costEur.toFixed(5)}` : '€0 (free)'}
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
                            <div className="trace-section-title"><Network size={12} /> Agent Execution Tree</div>
                            <div className="agent-tree-grid">
                                {subtasksDone.map((s, i) => {
                                    // Parse: ↪ [Depth 0] Subtask 1 completed by ollama[@192.168.2.65] [model=qwen2.5-coder:7b] in 88.7s (In: 990, Out: 1036).
                                    const nodeM  = s.raw.match(/completed by ([^\s[]+)/);
                                    const modelM = s.raw.match(/\[model=([^\]]+)\]/);
                                    const inM    = s.raw.match(/In:\s*(\d+)/);
                                    const outM   = s.raw.match(/Out:\s*(\d+)/);
                                    const timeM  = s.raw.match(/in\s+([\d.]+)s/);
                                    const idxM   = s.raw.match(/Subtask\s+(\d+)/);
                                    const depthM = s.raw.match(/\[Depth\s+(\d+)\]/);
                                    const retryM = s.raw.match(/Retrying/);
                                    return (
                                        <div key={i} className={`agent-node ${retryM ? 'retried' : 'ok'}`}>
                                            <div className="an-header">
                                                <span className="an-idx">#{(idxM?.[1] ?? i)}</span>
                                                <span className="an-status">{retryM ? <AlertCircle size={11}/> : <CheckCircle2 size={11}/>}</span>
                                                {depthM && <span className="an-depth">depth {depthM[1]}</span>}
                                            </div>
                                            <div className="an-node">{nodeM?.[1] ?? '-'}</div>
                                            <div className="an-model">{modelM?.[1] ?? '-'}</div>
                                            <div className="an-stats">
                                                <span>{inM?.[1] ?? '?'} in</span>
                                                <span>{outM?.[1] ?? '?'} out</span>
                                                {timeM && <span>{timeM[1]}s</span>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Full pipeline log */}
                    <div className="trace-section-title"><Terminal size={12} /> Pipeline Steps</div>
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function shortModel(m: string) {
    const exec = m.match(/executed-by:([^,]+)/);
    const plan = m.match(/planned-by:([^,]+)/);
    if (exec && plan) return `${exec[1]} ← ${plan[1]}`;
    return m;
}

// Use 127.0.0.1 explicitly to avoid macOS IPv6-first resolution of 'localhost'
const API_BASE = () => localStorage.getItem('lf_api_url') || 'http://127.0.0.1:4141';
const STORAGE_KEY = 'lf_chat_history';
const MAX_QUEUE    = 5;

// ─── QueueBar ────────────────────────────────────────────────────────────────

function QueueBar({ queue, onClear }: { queue: string[]; onClear: () => void }) {
    if (queue.length === 0) return null;
    return (
        <div className="queue-bar">
            <div className="queue-bar-header">
                <span>
                    <Loader2 size={12} className="spin" />
                    {queue.length} message{queue.length > 1 ? 's' : ''} queued
                </span>
                <button className="queue-clear-btn" onClick={onClear} title="Clear queue">
                    <XCircle size={12} /> Clear queue
                </button>
            </div>
            <div className="queue-list">
                {queue.map((q, i) => (
                    <div key={i} className="queue-item">
                        <span className="queue-item-idx">#{i + 1}</span>
                        <span className="queue-item-text">{q.length > 80 ? q.slice(0, 80) + '…' : q}</span>
                    </div>
                ))}
            </div>
            {queue.length >= MAX_QUEUE && (
                <div className="queue-full-hint">Queue full (max {MAX_QUEUE}) — clear to add more</div>
            )}
        </div>
    );
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

const WELCOME: Message = {
    role: 'assistant',
    content: 'Hello! I am **LokaFlow™**. I route your queries intelligently between local and cloud models.\n\nTry asking me anything — I\'ll show you which model handled it and how much it cost.'
};

function loadHistory(): Message[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as Message[];
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
    } catch { /* ignore */ }
    return [WELCOME];
}

export function Chat() {
    const [messages, setMessages]           = useState<Message[]>(loadHistory);
    const [input, setInput]                 = useState('');
    const [isLoading, setIsLoading]         = useState(false);
    const [streamingContent, setStreaming]  = useState('');
    const [queue, setQueue]                 = useState<string[]>([]);
    const [queueFull, setQueueFull]         = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef    = useRef<HTMLTextAreaElement>(null);
    // Refs for safe access inside async callbacks
    const messagesRef    = useRef<Message[]>(messages);
    const queueRef       = useRef<string[]>([]);
    const isLoadingRef   = useRef(false);

    // Keep refs in sync with state
    useEffect(() => { messagesRef.current   = messages; }, [messages]);
    useEffect(() => { queueRef.current      = queue;    }, [queue]);

    // Persist messages to localStorage whenever they change
    useEffect(() => {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages)); } catch { /* quota */ }
    }, [messages]);

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    useEffect(() => { scrollToBottom(); }, [messages, streamingContent, scrollToBottom]);

    useEffect(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        ta.style.height = 'auto';
        ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
    }, [input]);

    // ── Core fetch + stream ───────────────────────────────────────────────────
    const processMessage = useCallback(async (userMsg: string) => {
        isLoadingRef.current = true;
        setIsLoading(true);
        setStreaming('');

        // Add user message immediately (optimistic)
        setMessages(prev => {
            const next = [...prev, { role: 'user' as const, content: userMsg }];
            messagesRef.current = next;
            return next;
        });

        const historyForApi = messagesRef.current.map(m => ({ role: m.role, content: m.content }));

        try {
            const res = await fetch(`${API_BASE()}/v1/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: localStorage.getItem('lf_model') || 'auto',
                    messages: historyForApi,
                    stream: true,
                })
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const reader = res.body!.getReader();
            const decoder = new TextDecoder();
            let accumulated = '';
            let traceData: LokaFlowTrace | undefined;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const text = decoder.decode(value, { stream: true });
                for (const line of text.split('\n')) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed === 'data: [DONE]') continue;
                    if (!trimmed.startsWith('data: ')) continue;
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
                    } catch { /* skip malformed chunk */ }
                }
            }

            setStreaming('');
            setMessages(prev => {
                const next = [...prev, {
                    role: 'assistant' as const,
                    content: accumulated || '(empty response)',
                    trace: traceData,
                }];
                messagesRef.current = next;
                return next;
            });

        } catch {
            setStreaming('');
            setMessages(prev => {
                const next = [...prev, {
                    role: 'assistant' as const,
                    content: `**Error:** Could not connect to LokaFlow API at \`${API_BASE()}\`.\n\nMake sure the server is running:\n\`\`\`\nnpx tsx packages/cli/src/index.ts serve\n\`\`\``
                }];
                messagesRef.current = next;
                return next;
            });
        } finally {
            isLoadingRef.current = false;
            setIsLoading(false);

            // Drain queue: pop next item and process it
            const nextQueue = [...queueRef.current];
            const nextMsg   = nextQueue.shift();
            queueRef.current = nextQueue;
            setQueue(nextQueue);

            if (nextMsg) {
                // Small delay so React can flush state before next async call
                setTimeout(() => processMessage(nextMsg), 80);
            }
        }
    }, []); // stable — reads everything via refs

    // ── Submit / queue ────────────────────────────────────────────────────────
    const handleSubmit = useCallback((e?: React.FormEvent) => {
        e?.preventDefault();
        const msg = input.trim();
        if (!msg) return;
        setInput('');
        setQueueFull(false);

        if (isLoadingRef.current) {
            // Add to queue if there's space
            if (queueRef.current.length < MAX_QUEUE) {
                const next = [...queueRef.current, msg];
                queueRef.current = next;
                setQueue(next);
            } else {
                setQueueFull(true);
                setTimeout(() => setQueueFull(false), 3000);
            }
        } else {
            processMessage(msg);
        }
    }, [input, processMessage]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
    };

    const clearHistory = () => {
        setMessages([WELCOME]);
        setQueue([]);
        queueRef.current = [];
        try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    };

    const clearQueue = () => {
        setQueue([]);
        queueRef.current = [];
        setQueueFull(false);
    };

    const tierIcon = (tier?: string) =>
        tier === 'cloud'     ? <Cloud size={20} />
        : tier === 'delegated' ? <Network size={20} />
        : <Cpu size={20} />;

    return (
        <div className="chat-container">
            <div className="chat-messages">
                {messages.map((msg, i) => (
                    <div key={i} className={`message-wrapper ${msg.role}`}>
                        <div className="avatar">
                            {msg.role === 'assistant'
                                ? (msg.trace ? tierIcon(msg.trace.tier) : <Bot size={20} />)
                                : <User size={20} />}
                        </div>
                        <div className="message-col">
                            <div className={`message-bubble ${msg.role === 'assistant' ? 'assistant' : ''}`}>
                                {msg.role === 'assistant'
                                    ? <MessageContent content={msg.content} />
                                    : <span className="user-text">{msg.content}</span>
                                }
                            </div>
                            {msg.trace && <TracePanel trace={msg.trace} />}
                        </div>
                    </div>
                ))}

                {isLoading && (
                    <div className="message-wrapper assistant">
                        <div className="avatar"><Bot size={20} /></div>
                        <div className="message-col">
                            <div className="message-bubble assistant streaming">
                                {streamingContent
                                    ? <MessageContent content={streamingContent} />
                                    : <span className="thinking-dots">
                                        <Loader2 size={14} className="spin" style={{ marginRight: 6 }} />
                                        Routing and thinking…
                                    </span>
                                }
                                {streamingContent && <span className="streaming-cursor" />}
                            </div>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            <div className="chat-footer">
                {/* Queue bar — shown while requests are pending */}
                <QueueBar queue={queue} onClear={clearQueue} />

                {queueFull && (
                    <div className="queue-full-hint" style={{ marginBottom: 6 }}>
                        Queue full ({MAX_QUEUE} max) — wait for current messages to finish.
                    </div>
                )}

                <div className="chat-input-row">
                    <textarea
                        ref={textareaRef}
                        className="chat-textarea"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={
                            isLoading && queue.length >= MAX_QUEUE
                                ? `Queue full (${MAX_QUEUE}/${MAX_QUEUE}) — wait for responses…`
                                : isLoading
                                ? `Processing… type to queue (${queue.length}/${MAX_QUEUE})`
                                : 'Ask LokaFlow… (Enter to send, Shift+Enter for newline)'
                        }
                        rows={1}
                    />
                    <button
                        className="chat-send-btn"
                        onClick={() => handleSubmit()}
                        disabled={!input.trim() || (isLoading && queue.length >= MAX_QUEUE)}
                        title={isLoading ? `Add to queue (${queue.length}/${MAX_QUEUE})` : 'Send'}
                    >
                        {isLoading ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
                    </button>
                </div>
                <div className="chat-footer-hint">
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Zap size={11} /> Routed locally by default · Cloud only when complexity &gt; 0.65
                        {queue.length > 0 && (
                            <span style={{ color: '#fbbf24', marginLeft: 8 }}>
                                · {queue.length} queued
                            </span>
                        )}
                    </span>
                    <button className="chat-clear-btn" onClick={clearHistory} title="Clear conversation history">
                        <XCircle size={11} /> Clear history
                    </button>
                </div>
            </div>
        </div>
    );
}
