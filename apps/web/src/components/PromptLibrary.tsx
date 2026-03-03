/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { useState, useMemo, useEffect } from "react";
import { BookOpen, Pin, PinOff, Plus, Search, Send, Trash2, X } from "lucide-react";

interface PromptTemplate {
  id: string;
  title: string;
  body: string;
  tags: string[];
  pinned: boolean;
  source: "mine" | "community";
  usageCount: number;
}

const COMMUNITY_PACKS: PromptTemplate[] = [
  {
    id: "c1",
    title: "Summarise legal document",
    body: "Summarise the following legal document in plain English. Highlight key obligations, deadlines, and any clauses that require attention:\n\n{{document}}",
    tags: ["legal", "summarisation"],
    pinned: false,
    source: "community",
    usageCount: 1240,
  },
  {
    id: "c2",
    title: "Code review — security",
    body: "Review the following code for security vulnerabilities. List each issue with severity (critical/high/medium/low), affected line range, and recommended fix:\n\n```\n{{code}}\n```",
    tags: ["coding", "security"],
    pinned: false,
    source: "community",
    usageCount: 876,
  },
  {
    id: "c3",
    title: "GDPR compliance check",
    body: "Analyse the following data processing description for GDPR compliance gaps. Cite relevant articles and suggest remediation:\n\n{{description}}",
    tags: ["compliance", "privacy"],
    pinned: false,
    source: "community",
    usageCount: 541,
  },
  {
    id: "c4",
    title: "Meeting notes → action items",
    body: "Extract all action items from the meeting notes below. Format as a Markdown table with columns: Owner | Task | Deadline | Priority.\n\n{{notes}}",
    tags: ["productivity", "meetings"],
    pinned: false,
    source: "community",
    usageCount: 2089,
  },
  {
    id: "c5",
    title: "API documentation writer",
    body: "Write a clear OpenAPI-style description for the following endpoint, including description, parameters, request body, responses, and a cURL example:\n\n{{endpoint_spec}}",
    tags: ["coding", "documentation"],
    pinned: false,
    source: "community",
    usageCount: 713,
  },
  {
    id: "c6",
    title: "Translate and localise",
    body: "Translate the following text into {{target_language}}. Adapt idioms and cultural references for the target audience rather than translating literally:\n\n{{text}}",
    tags: ["translation"],
    pinned: false,
    source: "community",
    usageCount: 1587,
  },
];

const LS_KEY = "lf_prompt_templates";

function loadTemplates(): PromptTemplate[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as PromptTemplate[]) : [];
  } catch {
    return [];
  }
}

function saveTemplates(tpls: PromptTemplate[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(tpls));
}

interface NewPromptForm {
  title: string;
  body: string;
  tags: string;
}

export function PromptLibrary() {
  const [myTemplates, setMyTemplates] = useState<PromptTemplate[]>(loadTemplates);
  const [communityPacks, setCommunityPacks] = useState<PromptTemplate[]>(COMMUNITY_PACKS);
  const [query, setQuery] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<NewPromptForm>({ title: "", body: "", tags: "" });
  const [testInput, setTestInput] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    saveTemplates(myTemplates);
  }, [myTemplates]);

  const allPinned = useMemo(
    () => [...myTemplates, ...communityPacks].filter((t) => t.pinned),
    [myTemplates, communityPacks],
  );

  const filteredMine = useMemo(() => {
    const q = query.toLowerCase();
    return myTemplates.filter(
      (t) =>
        !t.pinned &&
        (t.title.toLowerCase().includes(q) ||
          t.body.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.includes(q))),
    );
  }, [myTemplates, query]);

  const filteredCommunity = useMemo(() => {
    const q = query.toLowerCase();
    return communityPacks.filter(
      (t) =>
        !t.pinned &&
        (t.title.toLowerCase().includes(q) ||
          t.body.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.includes(q))),
    );
  }, [communityPacks, query]);

  function togglePin(id: string) {
    setMyTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t)));
    setCommunityPacks((prev) => prev.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t)));
  }

  function deleteTemplate(id: string) {
    setMyTemplates((prev) => prev.filter((t) => t.id !== id));
  }

  function createTemplate() {
    if (!form.title.trim() || !form.body.trim()) return;
    const tpl: PromptTemplate = {
      id: `mine_${Date.now()}`,
      title: form.title.trim(),
      body: form.body.trim(),
      tags: form.tags
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      pinned: false,
      source: "mine",
      usageCount: 0,
    };
    setMyTemplates((prev) => [tpl, ...prev]);
    setForm({ title: "", body: "", tags: "" });
    setShowModal(false);
  }

  function resolveTemplate(body: string, vars: Record<string, string>): string {
    return body.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
  }

  function extractVars(body: string): string[] {
    const matches = body.matchAll(/\{\{(\w+)\}\}/g);
    return [...new Set([...matches].map((m) => m[1]))];
  }

  function copyResolved(tpl: PromptTemplate) {
    const resolved = resolveTemplate(tpl.body, testInput);
    navigator.clipboard.writeText(resolved).catch(() => {});
    setCopied(tpl.id);
    setTimeout(() => setCopied(null), 1500);
  }

  function sendToChat(tpl: PromptTemplate) {
    const resolved = resolveTemplate(tpl.body, testInput);
    // Stash prompt for the Chat component to pick up
    sessionStorage.setItem("lf_pending_prompt", resolved);
    // Dispatch a custom event so Chat can listen
    window.dispatchEvent(new CustomEvent("lf:send-prompt", { detail: { text: resolved } }));
  }

  function renderCard(tpl: PromptTemplate) {
    const vars = extractVars(tpl.body);
    const isExpanded = expandedId === tpl.id;

    return (
      <div
        key={tpl.id}
        className="prompt-card"
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onClick={() => setExpandedId(isExpanded ? null : tpl.id)}
        onKeyDown={(e) => {
          if (e.currentTarget !== e.target) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpandedId(isExpanded ? null : tpl.id);
          }
        }}
      >
        <div className="prompt-card-title">
          {tpl.pinned && <span className="prompt-card-pin">📌</span>}
          {tpl.title}
        </div>
        <div className="prompt-card-body">{tpl.body}</div>
        <div className="prompt-card-footer">
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
            {tpl.tags.map((tag) => (
              <span key={tag} className="prompt-tag">
                {tag}
              </span>
            ))}
          </div>
          <div className="prompt-card-actions" onClick={(e) => e.stopPropagation()}>
            <button
              className="prompt-icon-btn"
              title={tpl.pinned ? "Unpin" : "Pin"}
              onClick={() => togglePin(tpl.id)}
            >
              {tpl.pinned ? <PinOff size={14} /> : <Pin size={14} />}
            </button>
            {tpl.source === "mine" && (
              <button
                className="prompt-icon-btn"
                title="Delete"
                onClick={() => deleteTemplate(tpl.id)}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>

        {isExpanded && vars.length > 0 && (
          <div
            style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="prompts-section-title" style={{ marginBottom: 2 }}>
              Fill variables
            </div>
            {vars.map((v) => (
              <div key={v} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <label
                  style={{ fontSize: 11, color: "var(--text-muted)", width: 80 }}
                >{`{{${v}}}`}</label>
                <input
                  style={{
                    flex: 1,
                    background: "var(--bg-dark)",
                    border: "1px solid var(--border-color)",
                    borderRadius: 5,
                    color: "var(--text-main)",
                    fontSize: 11,
                    padding: "4px 8px",
                  }}
                  placeholder={v}
                  value={testInput[v] ?? ""}
                  onChange={(e) => setTestInput((prev) => ({ ...prev, [v]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        )}

        {isExpanded && (
          <div
            style={{ display: "flex", gap: 6, marginTop: 8 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="btn-secondary"
              style={{ fontSize: 11, padding: "4px 10px" }}
              onClick={() => copyResolved(tpl)}
            >
              {copied === tpl.id ? "Copied!" : "Copy"}
            </button>
            <button
              className="btn-primary"
              style={{
                fontSize: 11,
                padding: "4px 10px",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
              onClick={() => sendToChat(tpl)}
            >
              <Send size={12} /> Send to Chat
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="prompts-root">
      <div className="prompts-header">
        <h1>
          <BookOpen size={20} style={{ marginRight: 8, verticalAlign: "middle" }} />
          Prompt Library
        </h1>
        <div className="prompts-search-row">
          <div style={{ position: "relative", flex: 1, maxWidth: 360 }}>
            <Search
              size={14}
              style={{
                position: "absolute",
                left: 10,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
              }}
            />
            <input
              className="prompts-search"
              style={{ paddingLeft: 30 }}
              placeholder="Search prompts…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button
            className="btn-primary"
            style={{ display: "flex", alignItems: "center", gap: 6 }}
            onClick={() => setShowModal(true)}
          >
            <Plus size={15} /> New Prompt
          </button>
        </div>
      </div>

      <div className="prompts-body">
        {allPinned.length > 0 && (
          <section>
            <div className="prompts-section-title">Pinned</div>
            <div className="prompts-grid">{allPinned.map(renderCard)}</div>
          </section>
        )}

        <section>
          <div className="prompts-section-title">
            My Templates
            {myTemplates.filter((t) => !t.pinned).length === 0 && " — none yet"}
          </div>
          {filteredMine.length > 0 ? (
            <div className="prompts-grid">{filteredMine.map(renderCard)}</div>
          ) : (
            <div className="empty-state" style={{ padding: "20px 0" }}>
              <BookOpen size={28} />
              <span>
                No templates yet. Click <strong>New Prompt</strong> to create one.
              </span>
            </div>
          )}
        </section>

        <section>
          <div className="prompts-section-title">Community Packs</div>
          <div className="prompts-grid">{filteredCommunity.map(renderCard)}</div>
        </section>
      </div>

      {showModal && (
        <div className="prompt-modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="prompt-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2>New Prompt Template</h2>
              <button className="prompt-icon-btn" onClick={() => setShowModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div>
              <label>Title</label>
              <input
                placeholder="e.g. Summarise legal clause"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div>
              <label>
                Body{" "}
                <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
                  Use {"{{variable}}"} for placeholders
                </span>
              </label>
              <textarea
                placeholder="Write your prompt here…"
                value={form.body}
                rows={5}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              />
            </div>
            <div>
              <label>Tags (comma-separated)</label>
              <input
                placeholder="e.g. legal, summarisation"
                value={form.tags}
                onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
              />
            </div>
            <div className="prompt-modal-footer">
              <button className="btn-secondary" onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={createTemplate}
                disabled={!form.title.trim() || !form.body.trim()}
              >
                Save Template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
