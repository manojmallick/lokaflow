import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Modal,
  Switch,
  Alert,
  TextInput,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ── constants ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = "@lokaflow:batch_jobs";
const PROXY_BASE = "http://localhost:4041";
const QUEUE_POLL_MS = 5_000;

// ── types ──────────────────────────────────────────────────────────────────────

interface BatchJob {
  id: string;
  name: string;
  templateTitle: string;
  schedule: string;
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

// ── persistence helpers ────────────────────────────────────────────────────────

async function loadJobs(): Promise<BatchJob[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as BatchJob[];
  } catch {
    return [];
  }
}

async function saveJobs(jobs: BatchJob[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
  } catch {
    /* non-critical */
  }
}

// ── API helpers ────────────────────────────────────────────────────────────────

async function fetchQueue(): Promise<QueueItem[]> {
  try {
    const res = await fetch(`${PROXY_BASE}/api/batch/queue`, {
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) return [];
    return (await res.json()) as QueueItem[];
  } catch {
    return [];
  }
}

async function triggerRunNow(jobId: string): Promise<boolean> {
  try {
    const res = await fetch(`${PROXY_BASE}/api/batch/jobs/${jobId}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ immediate: true }),
      signal: AbortSignal.timeout(5_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function createRemoteJob(job: Omit<BatchJob, "id" | "lastStatus">): Promise<string | null> {
  try {
    const res = await fetch(`${PROXY_BASE}/api/batch/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(job),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { id: string };
    return data.id;
  } catch {
    return null;
  }
}

// ── helpers ────────────────────────────────────────────────────────────────────

function fmtEur(v: number): string {
  if (v === 0) return "€0.00";
  if (v < 0.01) return `€${(v * 100).toFixed(2)}¢`;
  return `€${v.toFixed(3)}`;
}

function statusEmoji(s: string): string {
  return s === "ok" ? "✅" : s === "error" ? "❌" : s === "running" ? "⏳" : "🕐";
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ── component ──────────────────────────────────────────────────────────────────

export default function BatchScreen() {
  const [jobs, setJobs] = useState<BatchJob[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [newJobModal, setNewJobModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── new-job form state
  const [newName, setNewName] = useState("");
  const [newTemplate, setNewTemplate] = useState("");
  const [newSchedule, setNewSchedule] = useState("Every weekday at 09:00");
  const [newInput, setNewInput] = useState("");
  const [newOutput, setNewOutput] = useState("");

  // ── load jobs from AsyncStorage on mount ─────────────────────────────────

  useEffect(() => {
    loadJobs().then((stored) => {
      setJobs(stored);
      setLoading(false);
    });
  }, []);

  // ── persist jobs whenever they change ────────────────────────────────────

  useEffect(() => {
    if (!loading) {
      void saveJobs(jobs);
    }
  }, [jobs, loading]);

  // ── poll queue every QUEUE_POLL_MS ───────────────────────────────────────

  useEffect(() => {
    void fetchQueue().then(setQueue);
    pollRef.current = setInterval(() => {
      void fetchQueue().then(setQueue);
    }, QUEUE_POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ── handlers ─────────────────────────────────────────────────────────────

  const toggleJob = useCallback((id: string) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, enabled: !j.enabled } : j)));
  }, []);

  const deleteJob = useCallback((id: string) => {
    Alert.alert("Delete job", "Remove this batch job?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => setJobs((prev) => prev.filter((j) => j.id !== id)),
      },
    ]);
  }, []);

  const runNow = useCallback((job: BatchJob) => {
    Alert.alert("Run Now", `Start "${job.name}" immediately?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Run",
        onPress: async () => {
          const ok = await triggerRunNow(job.id);
          if (ok) {
            Alert.alert("Queued", `"${job.name}" added to the queue.`);
            // Update local status optimistically
            setJobs((prev) =>
              prev.map((j) => (j.id === job.id ? { ...j, lastStatus: "running" } : j)),
            );
            // Refresh queue immediately
            const updated = await fetchQueue();
            setQueue(updated);
          } else {
            Alert.alert(
              "Offline Mode",
              `Cannot reach the LokaFlow proxy at ${PROXY_BASE}.\n\nJob queued locally — will run when proxy reconnects.`,
            );
            // Still mark as pending locally
            setJobs((prev) =>
              prev.map((j) => (j.id === job.id ? { ...j, lastStatus: "pending" } : j)),
            );
          }
        },
      },
    ]);
  }, []);

  const handleCreateJob = useCallback(async () => {
    if (!newName.trim() || !newInput.trim()) {
      Alert.alert("Required", "Name and Input Source are required.");
      return;
    }
    setSaving(true);

    const draft: Omit<BatchJob, "id" | "lastStatus"> = {
      name: newName.trim(),
      templateTitle: newTemplate.trim() || "Custom Job",
      schedule: newSchedule.trim(),
      nextRun: "TBD",
      inputSource: newInput.trim(),
      outputDest: newOutput.trim() || "/output/",
      enabled: true,
    };

    // Try remote first, fall back to local ID
    const remoteId = await createRemoteJob(draft);
    const id = remoteId ?? randomId();

    const newJob: BatchJob = { ...draft, id, lastStatus: "pending" };
    setJobs((prev) => [newJob, ...prev]);

    // Reset form
    setNewName(""); setNewTemplate(""); setNewSchedule("Every weekday at 09:00");
    setNewInput(""); setNewOutput("");
    setNewJobModal(false);
    setSaving(false);
  }, [newName, newTemplate, newSchedule, newInput, newOutput]);

  // ── render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.centered}>
          <ActivityIndicator color="#10b981" size="large" />
          <Text style={s.loadingText}>Loading batch jobs…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={s.content}>
        {/* Active queue */}
        {queue.length > 0 && (
          <>
            <Text style={s.sectionTitle}>⏳ Running Now</Text>
            {queue.map((q) => (
              <View key={q.id} style={s.queueCard}>
                <Text style={s.queueName}>{q.name}</Text>
                <Text style={s.queueModel}>Model: {q.model}</Text>
                <View style={s.progressRow}>
                  <View style={s.progressBg}>
                    <View style={[s.progressFill, { width: `${(q.done / q.total) * 100}%` as any }]} />
                  </View>
                  <Text style={s.progressText}>
                    {q.done}/{q.total}
                  </Text>
                </View>
                <Text style={s.queueFile} numberOfLines={1}>
                  Processing: {q.currentFile}
                </Text>
                <Text style={s.queueEta}>ETA: {q.eta}</Text>
              </View>
            ))}
          </>
        )}

        {/* Jobs */}
        <View style={s.sectionHeaderRow}>
          <Text style={s.sectionTitle}>Scheduled Jobs</Text>
          <TouchableOpacity style={s.addBtn} onPress={() => setNewJobModal(true)}>
            <Text style={s.addBtnText}>＋ New</Text>
          </TouchableOpacity>
        </View>

        {jobs.length === 0 && (
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>📋</Text>
            <Text style={s.emptyTitle}>No batch jobs yet</Text>
            <Text style={s.emptySubtitle}>Tap ＋ New to create your first scheduled job.</Text>
          </View>
        )}

        {jobs.map((job) => (
          <View key={job.id} style={[s.jobCard, !job.enabled && s.jobCardDisabled]}>
            <TouchableOpacity
              style={s.jobHeader}
              onPress={() => setExpanded(expanded === job.id ? null : job.id)}
            >
              <View style={{ flex: 1 }}>
                <View style={s.jobTitleRow}>
                  <Text style={s.statusEmoji}>{statusEmoji(job.lastStatus)}</Text>
                  <Text style={[s.jobName, !job.enabled && s.jobNameDisabled]} numberOfLines={1}>
                    {job.name}
                  </Text>
                </View>
                <Text style={s.jobSchedule}>{job.schedule}</Text>
                <Text style={s.jobNext}>Next: {job.nextRun}</Text>
              </View>
              <View style={s.jobRight}>
                <Switch
                  value={job.enabled}
                  onValueChange={() => toggleJob(job.id)}
                  trackColor={{ false: "#27272a", true: "#064e3b" }}
                  thumbColor={job.enabled ? "#10b981" : "#71717a"}
                />
                <Text style={s.chevron}>{expanded === job.id ? "▲" : "▼"}</Text>
              </View>
            </TouchableOpacity>

            {expanded === job.id && (
              <View style={s.jobDetails}>
                <DetailRow label="Template" value={job.templateTitle} />
                <DetailRow label="Input" value={job.inputSource} />
                <DetailRow label="Output" value={job.outputDest} />
                {job.lastRunDate && (
                  <>
                    <DetailRow label="Last run" value={job.lastRunDate} />
                    <DetailRow label="Documents" value={String(job.lastRunDocs ?? 0)} />
                    <DetailRow label="Cost" value={fmtEur(job.lastRunCost ?? 0)} />
                    <DetailRow label="Duration" value={job.lastRunDuration ?? "—"} />
                  </>
                )}
                <View style={s.jobActionRow}>
                  <TouchableOpacity style={s.runBtn} onPress={() => runNow(job)}>
                    <Text style={s.runBtnText}>▶ Run Now</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.deleteBtn} onPress={() => deleteJob(job.id)}>
                    <Text style={s.deleteBtnText}>🗑 Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      {/* New job modal with real form */}
      <Modal visible={newJobModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>New Batch Job</Text>
              <TouchableOpacity onPress={() => setNewJobModal(false)}>
                <Text style={s.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={s.modalBody} keyboardShouldPersistTaps="handled">
              <FormField label="Job Name *" placeholder="Daily DORA Check" value={newName} onChange={setNewName} />
              <FormField label="Template Title" placeholder="DORA Article 11 Review" value={newTemplate} onChange={setNewTemplate} />
              <FormField label="Input Source *" placeholder="/policies/  or  git diff HEAD~7" value={newInput} onChange={setNewInput} />
              <FormField label="Output Destination" placeholder="/reports/  or  Slack webhook" value={newOutput} onChange={setNewOutput} />
              <FormField label="Schedule" placeholder="Every weekday at 09:00" value={newSchedule} onChange={setNewSchedule} />
            </ScrollView>
            <View style={s.modalFooter}>
              <TouchableOpacity
                style={[s.createBtn, saving && s.createBtnDisabled]}
                onPress={handleCreateJob}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={s.createBtnText}>Create Job</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── sub-components ─────────────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.detailRow}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function FormField({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={s.fieldGroup}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        style={s.fieldInput}
        placeholder={placeholder}
        placeholderTextColor="#52525b"
        value={value}
        onChangeText={onChange}
        autoCorrect={false}
      />
    </View>
  );
}

// ── styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#09090b" },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { color: "#71717a", fontSize: 13 },
  sectionTitle: {
    color: "#71717a",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 10,
    marginTop: 16,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    marginBottom: 10,
  },
  addBtn: {
    backgroundColor: "#10b981",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  addBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  emptyState: { alignItems: "center", padding: 40, gap: 8 },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { color: "#fafafa", fontSize: 16, fontWeight: "600" },
  emptySubtitle: { color: "#71717a", fontSize: 13, textAlign: "center" },
  // Queue
  queueCard: {
    backgroundColor: "#1e1b4b",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#3730a3",
    marginBottom: 4,
  },
  queueName: { color: "#fafafa", fontSize: 15, fontWeight: "600", marginBottom: 4 },
  queueModel: { color: "#818cf8", fontSize: 12, marginBottom: 10 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  progressBg: { flex: 1, height: 8, backgroundColor: "#312e81", borderRadius: 99 },
  progressFill: { height: 8, backgroundColor: "#6366f1", borderRadius: 99 },
  progressText: { color: "#818cf8", fontSize: 12, fontWeight: "600", minWidth: 36 },
  queueFile: { color: "#a5b4fc", fontSize: 12, marginBottom: 2 },
  queueEta: { color: "#71717a", fontSize: 11 },
  // Jobs
  jobCard: {
    backgroundColor: "#18181b",
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#27272a",
    overflow: "hidden",
  },
  jobCardDisabled: { opacity: 0.6 },
  jobHeader: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  jobTitleRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  statusEmoji: { fontSize: 14 },
  jobName: { color: "#fafafa", fontSize: 14, fontWeight: "600", flex: 1 },
  jobNameDisabled: { color: "#71717a" },
  jobSchedule: { color: "#71717a", fontSize: 12, marginBottom: 1 },
  jobNext: { color: "#52525b", fontSize: 11 },
  jobRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  chevron: { color: "#52525b", fontSize: 12 },
  jobDetails: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: "#27272a",
  },
  detailRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  detailLabel: { color: "#71717a", fontSize: 12, flex: 1 },
  detailValue: { color: "#a1a1aa", fontSize: 12, flex: 2, textAlign: "right" },
  jobActionRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  runBtn: {
    flex: 1,
    backgroundColor: "#064e3b",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  runBtnText: { color: "#10b981", fontSize: 13, fontWeight: "700" },
  deleteBtn: {
    flex: 1,
    backgroundColor: "#450a0a",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  deleteBtnText: { color: "#ef4444", fontSize: 13, fontWeight: "700" },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,.75)", justifyContent: "flex-end" },
  modalBox: {
    backgroundColor: "#18181b",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "90%",
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
  modalBody: { padding: 16 },
  modalFooter: { padding: 16, borderTopWidth: 1, borderTopColor: "#27272a" },
  fieldGroup: { marginBottom: 16 },
  fieldLabel: { color: "#a1a1aa", fontSize: 12, fontWeight: "600", marginBottom: 6 },
  fieldInput: {
    backgroundColor: "#27272a",
    borderRadius: 8,
    padding: 12,
    color: "#fafafa",
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#3f3f46",
  },
  createBtn: {
    backgroundColor: "#10b981",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  createBtnDisabled: { opacity: 0.6 },
  createBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  closeBtn: {
    margin: 16,
    backgroundColor: "#27272a",
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  closeBtnText: { color: "#fafafa", fontWeight: "700", fontSize: 15 },
});


// ── types ──────────────────────────────────────────────────────────────────────

interface BatchJob {
  id: string;
  name: string;
  templateTitle: string;
  schedule: string;
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

// ── demo data (mirrors web) ────────────────────────────────────────────────────

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
    name: "DORA Compliance Check",
    total: 12,
    done: 7,
    currentFile: "policy_v3.pdf",
    eta: "2m 10s",
    model: "qwen2.5:7b",
  },
];

// ── helpers ────────────────────────────────────────────────────────────────────

function fmtEur(v: number): string {
  if (v === 0) return "€0.00";
  if (v < 0.01) return `€${(v * 100).toFixed(2)}¢`;
  return `€${v.toFixed(3)}`;
}

function statusColor(s: string): string {
  return s === "ok"
    ? "#10b981"
    : s === "error"
      ? "#ef4444"
      : s === "running"
        ? "#6366f1"
        : "#f59e0b";
}

function statusEmoji(s: string): string {
  return s === "ok" ? "✅" : s === "error" ? "❌" : s === "running" ? "⏳" : "🕐";
}

// ── component ──────────────────────────────────────────────────────────────────

export default function BatchScreen() {
  const [jobs, setJobs] = useState<BatchJob[]>(DEMO_JOBS);
  const [queue] = useState<QueueItem[]>(DEMO_QUEUE);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [newJobModal, setNewJobModal] = useState(false);

  function toggleJob(id: string) {
    setJobs(jobs.map((j) => (j.id === id ? { ...j, enabled: !j.enabled } : j)));
  }

  function deleteJob(id: string) {
    Alert.alert("Delete job", "Remove this batch job?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => setJobs(jobs.filter((j) => j.id !== id)),
      },
    ]);
  }

  function runNow(job: BatchJob) {
    Alert.alert("Run Now", `Start "${job.name}" immediately?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Run",
        onPress: () => Alert.alert("Queued", `"${job.name}" has been added to the queue.`),
      },
    ]);
  }

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={s.content}>
        {/* Active queue */}
        {queue.length > 0 && (
          <>
            <Text style={s.sectionTitle}>⏳ Running Now</Text>
            {queue.map((q) => (
              <View key={q.id} style={s.queueCard}>
                <Text style={s.queueName}>{q.name}</Text>
                <Text style={s.queueModel}>Model: {q.model}</Text>
                <View style={s.progressRow}>
                  <View style={s.progressBg}>
                    <View style={[s.progressFill, { width: `${(q.done / q.total) * 100}%` }]} />
                  </View>
                  <Text style={s.progressText}>
                    {q.done}/{q.total}
                  </Text>
                </View>
                <Text style={s.queueFile} numberOfLines={1}>
                  Processing: {q.currentFile}
                </Text>
                <Text style={s.queueEta}>ETA: {q.eta}</Text>
              </View>
            ))}
          </>
        )}

        {/* Jobs */}
        <View style={s.sectionHeaderRow}>
          <Text style={s.sectionTitle}>Scheduled Jobs</Text>
          <TouchableOpacity style={s.addBtn} onPress={() => setNewJobModal(true)}>
            <Text style={s.addBtnText}>＋ New</Text>
          </TouchableOpacity>
        </View>

        {jobs.map((job) => (
          <View key={job.id} style={[s.jobCard, !job.enabled && s.jobCardDisabled]}>
            <TouchableOpacity
              style={s.jobHeader}
              onPress={() => setExpanded(expanded === job.id ? null : job.id)}
            >
              <View style={{ flex: 1 }}>
                <View style={s.jobTitleRow}>
                  <Text style={s.statusEmoji}>{statusEmoji(job.lastStatus)}</Text>
                  <Text style={[s.jobName, !job.enabled && s.jobNameDisabled]} numberOfLines={1}>
                    {job.name}
                  </Text>
                </View>
                <Text style={s.jobSchedule}>{job.schedule}</Text>
                <Text style={s.jobNext}>Next: {job.nextRun}</Text>
              </View>
              <View style={s.jobRight}>
                <Switch
                  value={job.enabled}
                  onValueChange={() => toggleJob(job.id)}
                  trackColor={{ false: "#27272a", true: "#064e3b" }}
                  thumbColor={job.enabled ? "#10b981" : "#71717a"}
                />
                <Text style={s.chevron}>{expanded === job.id ? "▲" : "▼"}</Text>
              </View>
            </TouchableOpacity>

            {expanded === job.id && (
              <View style={s.jobDetails}>
                <DetailRow label="Template" value={job.templateTitle} />
                <DetailRow label="Input" value={job.inputSource} />
                <DetailRow label="Output" value={job.outputDest} />
                {job.lastRunDate && (
                  <>
                    <DetailRow label="Last run" value={job.lastRunDate} />
                    <DetailRow label="Documents" value={String(job.lastRunDocs ?? 0)} />
                    <DetailRow label="Cost" value={fmtEur(job.lastRunCost ?? 0)} />
                    <DetailRow label="Duration" value={job.lastRunDuration ?? "—"} />
                  </>
                )}
                <View style={s.jobActionRow}>
                  <TouchableOpacity style={s.runBtn} onPress={() => runNow(job)}>
                    <Text style={s.runBtnText}>▶ Run Now</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.deleteBtn} onPress={() => deleteJob(job.id)}>
                    <Text style={s.deleteBtnText}>🗑 Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      {/* New job modal (placeholder) */}
      <Modal visible={newJobModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>New Batch Job</Text>
              <TouchableOpacity onPress={() => setNewJobModal(false)}>
                <Text style={s.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={s.modalBody}>
              <Text style={s.placeholderText}>
                Batch job creation wizard coming soon.{"\n\n"}
                Connect to a LokaFlow server and use the web dashboard to configure batch jobs. They
                will automatically appear here.
              </Text>
            </View>
            <TouchableOpacity style={s.closeBtn} onPress={() => setNewJobModal(false)}>
              <Text style={s.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── sub-components ─────────────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.detailRow}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

// ── styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#09090b" },
  content: { padding: 16, paddingBottom: 40 },
  sectionTitle: {
    color: "#71717a",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 10,
    marginTop: 16,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    marginBottom: 10,
  },
  addBtn: {
    backgroundColor: "#10b981",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  addBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  // Queue
  queueCard: {
    backgroundColor: "#1e1b4b",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#3730a3",
    marginBottom: 4,
  },
  queueName: { color: "#fafafa", fontSize: 15, fontWeight: "600", marginBottom: 4 },
  queueModel: { color: "#818cf8", fontSize: 12, marginBottom: 10 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  progressBg: { flex: 1, height: 8, backgroundColor: "#312e81", borderRadius: 99 },
  progressFill: { height: 8, backgroundColor: "#6366f1", borderRadius: 99 },
  progressText: { color: "#818cf8", fontSize: 12, fontWeight: "600", minWidth: 36 },
  queueFile: { color: "#a5b4fc", fontSize: 12, marginBottom: 2 },
  queueEta: { color: "#71717a", fontSize: 11 },
  // Jobs
  jobCard: {
    backgroundColor: "#18181b",
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#27272a",
    overflow: "hidden",
  },
  jobCardDisabled: { opacity: 0.6 },
  jobHeader: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  jobTitleRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  statusEmoji: { fontSize: 14 },
  jobName: { color: "#fafafa", fontSize: 14, fontWeight: "600", flex: 1 },
  jobNameDisabled: { color: "#71717a" },
  jobSchedule: { color: "#71717a", fontSize: 12, marginBottom: 1 },
  jobNext: { color: "#52525b", fontSize: 11 },
  jobRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  chevron: { color: "#52525b", fontSize: 12 },
  jobDetails: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: "#27272a",
  },
  detailRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  detailLabel: { color: "#71717a", fontSize: 12, flex: 1 },
  detailValue: { color: "#a1a1aa", fontSize: 12, flex: 2, textAlign: "right" },
  jobActionRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  runBtn: {
    flex: 1,
    backgroundColor: "#064e3b",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  runBtnText: { color: "#10b981", fontSize: 13, fontWeight: "700" },
  deleteBtn: {
    flex: 1,
    backgroundColor: "#450a0a",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  deleteBtnText: { color: "#ef4444", fontSize: 13, fontWeight: "700" },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,.75)", justifyContent: "flex-end" },
  modalBox: { backgroundColor: "#18181b", borderTopLeftRadius: 20, borderTopRightRadius: 20 },
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
  modalBody: { padding: 20 },
  placeholderText: { color: "#71717a", fontSize: 14, lineHeight: 22, textAlign: "center" },
  closeBtn: {
    margin: 16,
    backgroundColor: "#27272a",
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  closeBtnText: { color: "#fafafa", fontWeight: "700", fontSize: 15 },
});
