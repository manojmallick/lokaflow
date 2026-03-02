/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { useState } from "react";
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Edit2,
  Folder,
  Loader2,
  Plus,
  Trash2,
  X,
  Zap,
} from "lucide-react";

interface BatchJob {
  id: string;
  name: string;
  templateTitle: string;
  schedule: string; // cron-like description
  nextRun: string;
  lastStatus: "ok" | "running" | "error" | "pending";
  lastRunDate?: string;
  lastRunDocs?: number;
  lastRunCost?: number;
  lastRunDuration?: string;
  inputSource: string;
  outputDest: string;
  enabled: boolean;
}

interface QueueItem {
  id: string;
  name: string;
  total: number;
  done: number;
  currentFile: string;
  eta: string;
  model: string;
}

const DEMO_JOBS: BatchJob[] = [
  {
    id: "j1",
    name: "Daily DORA Compliance Check",
    templateTitle: "DORA Article 11 Review",
    schedule: "Every weekday at 09:00",
    nextRun: "Mon 09:00",
    lastStatus: "ok",
    lastRunDate: "Sunday",
    lastRunDocs: 12,
    lastRunCost: 0.04,
    lastRunDuration: "4m 20s",
    inputSource: "/policies/",
    outputDest: "/reports/",
    enabled: true,
  },
  {
    id: "j2",
    name: "Weekly Code Review Summary",
    templateTitle: "Code Review — Security Focus",
    schedule: "Fridays at 17:00",
    nextRun: "Fri 17:00",
    lastStatus: "ok",
    lastRunDate: "last Friday",
    lastRunDocs: 34,
    lastRunCost: 0,
    lastRunDuration: "8m 12s",
    inputSource: "git diff HEAD~7",
    outputDest: "Slack webhook",
    enabled: true,
  },
  {
    id: "j3",
    name: "Monthly Contract Audit",
    templateTitle: "Vendor Contract Analysis",
    schedule: "1st of every month at 08:00",
    nextRun: "Apr 1 08:00",
    lastStatus: "error",
    lastRunDate: "Mar 1",
    lastRunDocs: 0,
    lastRunCost: 0,
    lastRunDuration: "—",
    inputSource: "/contracts/vendors/",
    outputDest: "/audit-reports/",
    enabled: false,
  },
];

const DEMO_QUEUE: QueueItem[] = [
  {
    id: "q1",
    name: "Contract batch — 23 remaining",
    total: 37,
    done: 14,
    currentFile: "contract_vendor_microsoft.pdf",
    eta: "8m",
    model: "qwen2.5:7b@localhost",
  },
];

const WIZARD_STEPS = ["Template", "Input", "Output", "Schedule"];

interface NewJobForm {
  name: string;
  template: string;
  inputSource: string;
  outputDest: string;
  schedule: string;
  scheduleTime: string;
}

export function BatchScheduler() {
  const [jobs, setJobs] = useState<BatchJob[]>(DEMO_JOBS);
  const [queue] = useState<QueueItem[]>(DEMO_QUEUE);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [form, setForm] = useState<NewJobForm>({
    name: "",
    template: "",
    inputSource: "",
    outputDest: "",
    schedule: "daily",
    scheduleTime: "09:00",
  });

  function deleteJob(id: string) {
    setJobs((prev) => prev.filter((j) => j.id !== id));
  }

  function toggleJob(id: string) {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, enabled: !j.enabled } : j)));
  }

  function createJob() {
    const job: BatchJob = {
      id: `j_${Date.now()}`,
      name: form.name || "New Batch Job",
      templateTitle: form.template || "Custom",
      schedule: `${form.schedule} at ${form.scheduleTime}`,
      nextRun: "Scheduled",
      lastStatus: "pending",
      inputSource: form.inputSource || "/",
      outputDest: form.outputDest || "/output/",
      enabled: true,
    };
    setJobs((prev) => [job, ...prev]);
    setShowWizard(false);
    setWizardStep(0);
    setForm({
      name: "",
      template: "",
      inputSource: "",
      outputDest: "",
      schedule: "daily",
      scheduleTime: "09:00",
    });
  }

  function statusBadge(s: BatchJob["lastStatus"]) {
    if (s === "ok") return <span style={{ color: "#4ade80", fontSize: 11 }}>✅ Success</span>;
    if (s === "running")
      return (
        <span style={{ color: "#60a5fa", fontSize: 11 }}>
          <Loader2 size={11} className="spin" style={{ verticalAlign: "middle" }} /> Running
        </span>
      );
    if (s === "error") return <span style={{ color: "#f87171", fontSize: 11 }}>❌ Error</span>;
    return <span style={{ color: "var(--text-muted)", fontSize: 11 }}>Pending</span>;
  }

  return (
    <div className="batch-root">
      {/* Header */}
      <div className="batch-header">
        <div>
          <h1>
            <Calendar size={20} style={{ marginRight: 8, verticalAlign: "middle" }} />
            Batch &amp; Scheduler
          </h1>
          <p className="subtitle">
            Automate recurring AI tasks — all processed locally when possible.
          </p>
        </div>
        <button
          className="btn-primary"
          style={{ display: "flex", alignItems: "center", gap: 6 }}
          onClick={() => setShowWizard(true)}
        >
          <Plus size={15} /> New Batch Job
        </button>
      </div>

      {/* Running queue */}
      {queue.length > 0 && (
        <div className="batch-queue-card">
          <div className="batch-section-title">
            <Loader2 size={14} className="spin" /> Queue ({queue.length} running)
          </div>
          {queue.map((q) => {
            const pct = Math.round((q.done / q.total) * 100);
            return (
              <div key={q.id} className="batch-queue-item">
                <div className="batch-queue-header">
                  <strong style={{ fontSize: 13 }}>{q.name}</strong>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>ETA {q.eta}</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
                  Processing: <em>{q.currentFile}</em> → {q.model}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    style={{
                      flex: 1,
                      height: 6,
                      background: "rgba(255,255,255,.08)",
                      borderRadius: 99,
                    }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: "100%",
                        background: "#3b82f6",
                        borderRadius: 99,
                        transition: "width .4s",
                      }}
                    />
                  </div>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", minWidth: 60 }}>
                    {q.done}/{q.total} ({pct}%)
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Scheduled jobs */}
      <div>
        <div className="batch-section-title" style={{ marginBottom: 8 }}>
          Scheduled Jobs ({jobs.length})
        </div>
        <div className="batch-job-list">
          {jobs.map((job) => {
            const isExpanded = expandedJob === job.id;
            return (
              <div key={job.id} className={`batch-job-card ${!job.enabled ? "disabled" : ""}`}>
                <div
                  className="batch-job-header"
                  onClick={() => setExpandedJob(isExpanded ? null : job.id)}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}
                  >
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: job.enabled ? "var(--text-main)" : "var(--text-muted)",
                        }}
                      >
                        {job.name}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        <Clock size={10} style={{ verticalAlign: "middle", marginRight: 3 }} />
                        {job.schedule} · Next: {job.nextRun}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {statusBadge(job.lastStatus)}
                    <label
                      style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={job.enabled}
                        onChange={() => toggleJob(job.id)}
                        style={{ accentColor: "var(--accent)" }}
                      />
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Enabled</span>
                    </label>
                    <button
                      className="prompt-icon-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteJob(job.id);
                      }}
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="batch-job-detail">
                    <div className="batch-detail-grid">
                      <div className="batch-detail-row">
                        <span className="bd-lbl">Template</span>
                        <span className="bd-val">{job.templateTitle}</span>
                      </div>
                      <div className="batch-detail-row">
                        <span className="bd-lbl">Input source</span>
                        <span className="bd-val" style={{ fontFamily: "monospace" }}>
                          {job.inputSource}
                        </span>
                      </div>
                      <div className="batch-detail-row">
                        <span className="bd-lbl">Output destination</span>
                        <span className="bd-val" style={{ fontFamily: "monospace" }}>
                          {job.outputDest}
                        </span>
                      </div>
                      {job.lastRunDate && (
                        <>
                          <div className="batch-detail-row">
                            <span className="bd-lbl">Last run</span>
                            <span className="bd-val">
                              {job.lastRunDate} — {job.lastRunDuration} · {job.lastRunDocs} docs
                            </span>
                          </div>
                          <div className="batch-detail-row">
                            <span className="bd-lbl">Last run cost</span>
                            <span
                              className="bd-val"
                              style={{
                                color: job.lastRunCost === 0 ? "#4ade80" : "var(--text-main)",
                              }}
                            >
                              {job.lastRunCost === 0
                                ? "€0.00 (100% local)"
                                : `€${job.lastRunCost?.toFixed(3)}`}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <button
                        className="btn-primary"
                        style={{
                          fontSize: 12,
                          padding: "5px 12px",
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                        }}
                      >
                        <Zap size={13} /> Run Now
                      </button>
                      <button
                        className="btn-secondary"
                        style={{
                          fontSize: 12,
                          padding: "5px 12px",
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                        }}
                      >
                        <Edit2 size={13} /> Edit
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* New Job Wizard */}
      {showWizard && (
        <div className="prompt-modal-backdrop" onClick={() => setShowWizard(false)}>
          <div className="prompt-modal" style={{ width: 520 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2>New Batch Job</h2>
              <button className="prompt-icon-btn" onClick={() => setShowWizard(false)}>
                <X size={18} />
              </button>
            </div>

            {/* Step indicator */}
            <div style={{ display: "flex", gap: 4 }}>
              {WIZARD_STEPS.map((s, i) => (
                <div
                  key={s}
                  style={{
                    flex: 1,
                    height: 3,
                    background: i <= wizardStep ? "var(--accent)" : "rgba(255,255,255,.1)",
                    borderRadius: 99,
                    transition: "background .2s",
                  }}
                />
              ))}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
              Step {wizardStep + 1} of {WIZARD_STEPS.length}:{" "}
              <strong style={{ color: "var(--text-main)" }}>{WIZARD_STEPS[wizardStep]}</strong>
            </div>

            {/* Step content */}
            {wizardStep === 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <label style={{ fontSize: 11, color: "var(--text-muted)" }}>Job name</label>
                <input
                  style={{
                    background: "var(--bg-dark)",
                    border: "1px solid var(--border-color)",
                    borderRadius: 6,
                    color: "var(--text-main)",
                    fontSize: 13,
                    padding: "7px 10px",
                  }}
                  placeholder="e.g. Daily DORA Check"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
                <label style={{ fontSize: 11, color: "var(--text-muted)" }}>Prompt template</label>
                <select
                  style={{
                    background: "var(--bg-dark)",
                    border: "1px solid var(--border-color)",
                    borderRadius: 6,
                    color: "var(--text-main)",
                    fontSize: 13,
                    padding: "7px 10px",
                  }}
                  value={form.template}
                  onChange={(e) => setForm((f) => ({ ...f, template: e.target.value }))}
                >
                  <option value="">Select template…</option>
                  <option>DORA Article 11 Review</option>
                  <option>Code Review — Security Focus</option>
                  <option>Vendor Contract Analysis</option>
                  <option>Meeting Notes Summary</option>
                  <option>Summarise Document</option>
                </select>
              </div>
            )}

            {wizardStep === 1 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <label style={{ fontSize: 11, color: "var(--text-muted)" }}>Input source</label>
                <input
                  style={{
                    background: "var(--bg-dark)",
                    border: "1px solid var(--border-color)",
                    borderRadius: 6,
                    color: "var(--text-main)",
                    fontSize: 13,
                    padding: "7px 10px",
                    fontFamily: "monospace",
                  }}
                  placeholder="/path/to/folder/ or git diff HEAD~7"
                  value={form.inputSource}
                  onChange={(e) => setForm((f) => ({ ...f, inputSource: e.target.value }))}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn-secondary"
                    style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}
                  >
                    <Folder size={13} /> Browse folder
                  </button>
                </div>
              </div>
            )}

            {wizardStep === 2 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <label style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  Output destination
                </label>
                <select
                  style={{
                    background: "var(--bg-dark)",
                    border: "1px solid var(--border-color)",
                    borderRadius: 6,
                    color: "var(--text-main)",
                    fontSize: 13,
                    padding: "7px 10px",
                  }}
                  onChange={(e) => setForm((f) => ({ ...f, outputDest: e.target.value }))}
                >
                  <option value="">Select destination…</option>
                  <option value="/output/">Local folder /output/</option>
                  <option value="slack">Slack webhook</option>
                  <option value="email">Email digest</option>
                  <option value="json">JSON file</option>
                </select>
                {form.outputDest === "/output/" || !form.outputDest ? (
                  <input
                    style={{
                      background: "var(--bg-dark)",
                      border: "1px solid var(--border-color)",
                      borderRadius: 6,
                      color: "var(--text-main)",
                      fontSize: 13,
                      padding: "7px 10px",
                      fontFamily: "monospace",
                    }}
                    placeholder="/reports/"
                    value={form.outputDest}
                    onChange={(e) => setForm((f) => ({ ...f, outputDest: e.target.value }))}
                  />
                ) : null}
              </div>
            )}

            {wizardStep === 3 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <label style={{ fontSize: 11, color: "var(--text-muted)" }}>Recurrence</label>
                <select
                  style={{
                    background: "var(--bg-dark)",
                    border: "1px solid var(--border-color)",
                    borderRadius: 6,
                    color: "var(--text-main)",
                    fontSize: 13,
                    padding: "7px 10px",
                  }}
                  value={form.schedule}
                  onChange={(e) => setForm((f) => ({ ...f, schedule: e.target.value }))}
                >
                  <option value="daily">Daily</option>
                  <option value="weekdays">Weekdays only</option>
                  <option value="weekly">Weekly (Monday)</option>
                  <option value="monthly">Monthly (1st)</option>
                </select>
                <label style={{ fontSize: 11, color: "var(--text-muted)" }}>Time</label>
                <input
                  type="time"
                  style={{
                    background: "var(--bg-dark)",
                    border: "1px solid var(--border-color)",
                    borderRadius: 6,
                    color: "var(--text-main)",
                    fontSize: 13,
                    padding: "7px 10px",
                  }}
                  value={form.scheduleTime}
                  onChange={(e) => setForm((f) => ({ ...f, scheduleTime: e.target.value }))}
                />
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-muted)",
                    padding: 8,
                    background: "rgba(59,130,246,.08)",
                    borderRadius: 6,
                    border: "1px solid rgba(59,130,246,.2)",
                  }}
                >
                  <CheckCircle2
                    size={12}
                    style={{ color: "#4ade80", verticalAlign: "middle", marginRight: 4 }}
                  />
                  Will run {form.schedule} at {form.scheduleTime} · Uses routing rules to prefer
                  local models
                </div>
              </div>
            )}

            <div className="prompt-modal-footer">
              {wizardStep > 0 && (
                <button className="btn-secondary" onClick={() => setWizardStep((s) => s - 1)}>
                  Back
                </button>
              )}
              {wizardStep < WIZARD_STEPS.length - 1 ? (
                <button className="btn-primary" onClick={() => setWizardStep((s) => s + 1)}>
                  Next →
                </button>
              ) : (
                <button className="btn-primary" onClick={createJob}>
                  Create Job
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
