import React, { useState, useEffect, useMemo } from "react";
import * as Clipboard from "expo-clipboard";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  SafeAreaView,
  Alert,
  FlatList,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ── types ──────────────────────────────────────────────────────────────────────

interface PromptTemplate {
  id: string;
  title: string;
  body: string;
  tags: string[];
  pinned: boolean;
  source: "mine" | "community";
  usageCount: number;
}

// ── community packs (mirror web) ───────────────────────────────────────────────

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

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ── component ──────────────────────────────────────────────────────────────────

export default function PromptLibraryScreen() {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("all");
  const [editModal, setEditModal] = useState(false);
  const [detailModal, setDetailModal] = useState<PromptTemplate | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editId, setEditId] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(LS_KEY).then((raw: string | null) => {
      let mine: PromptTemplate[] = [];
      if (raw) {
        try {
          mine = JSON.parse(raw) as PromptTemplate[];
        } catch {
          console.warn("[PromptLibrary] Failed to parse stored templates, resetting to empty.");
        }
      }
      setTemplates([...mine, ...COMMUNITY_PACKS]);
    });
  }, []);

  async function saveMyTemplates(mine: PromptTemplate[]) {
    await AsyncStorage.setItem(LS_KEY, JSON.stringify(mine));
    setTemplates([...mine, ...COMMUNITY_PACKS]);
  }

  function myTemplates() {
    return templates.filter((t) => t.source === "mine");
  }

  async function togglePin(id: string) {
    const mine = myTemplates().map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t));
    await saveMyTemplates(mine);
  }

  async function deleteTemplate(id: string) {
    const mine = myTemplates().filter((t) => t.id !== id);
    await saveMyTemplates(mine);
  }

  async function saveEdit() {
    if (!editTitle.trim() || !editBody.trim()) {
      Alert.alert("Required", "Title and body are required.");
      return;
    }
    const tags = editTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const mine = myTemplates();
    if (editId) {
      const updated = mine.map((t) =>
        t.id === editId ? { ...t, title: editTitle, body: editBody, tags } : t,
      );
      await saveMyTemplates(updated);
    } else {
      const newT: PromptTemplate = {
        id: uid(),
        title: editTitle,
        body: editBody,
        tags,
        pinned: false,
        source: "mine",
        usageCount: 0,
      };
      await saveMyTemplates([newT, ...mine]);
    }
    setEditModal(false);
  }

  function openCreate() {
    setEditId(null);
    setEditTitle("");
    setEditBody("");
    setEditTags("");
    setEditModal(true);
  }

  function openEdit(t: PromptTemplate) {
    setEditId(t.id);
    setEditTitle(t.title);
    setEditBody(t.body);
    setEditTags(t.tags.join(", "));
    setEditModal(true);
  }

  const allTags = useMemo(() => {
    const set = new Set<string>();
    templates.forEach((t) => t.tags.forEach((tag) => set.add(tag)));
    return ["all", ...Array.from(set).sort()];
  }, [templates]);

  const filtered = useMemo(() => {
    return templates
      .filter((t) => {
        const q = query.toLowerCase();
        const matchesQ =
          !q || t.title.toLowerCase().includes(q) || t.body.toLowerCase().includes(q);
        const matchesTag = tagFilter === "all" || t.tags.includes(tagFilter);
        return matchesQ && matchesTag;
      })
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.usageCount - a.usageCount;
      });
  }, [templates, query, tagFilter]);

  return (
    <SafeAreaView style={s.container}>
      {/* Search */}
      <View style={s.searchRow}>
        <TextInput
          style={s.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search prompts…"
          placeholderTextColor="#52525b"
        />
        <TouchableOpacity style={s.addBtn} onPress={openCreate}>
          <Text style={s.addBtnText}>＋</Text>
        </TouchableOpacity>
      </View>

      {/* Tag filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.tagBar}
        contentContainerStyle={s.tagBarContent}
      >
        {allTags.map((tag) => (
          <TouchableOpacity
            key={tag}
            style={[s.tag, tagFilter === tag && s.tagActive]}
            onPress={() => setTagFilter(tag)}
          >
            <Text style={[s.tagText, tagFilter === tag && s.tagTextActive]}>{tag}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.list}
        renderItem={({ item }) => (
          <TouchableOpacity style={s.card} onPress={() => setDetailModal(item)}>
            <View style={s.cardHeader}>
              <View style={{ flex: 1 }}>
                <View style={s.cardTitleRow}>
                  {item.pinned && <Text style={s.pin}>📌 </Text>}
                  <Text style={s.cardTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                </View>
                <View style={s.cardTags}>
                  {item.tags.map((tag) => (
                    <View key={tag} style={s.cardTag}>
                      <Text style={s.cardTagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <View style={s.cardActions}>
                {item.source === "mine" && (
                  <>
                    <TouchableOpacity onPress={() => togglePin(item.id)} style={s.iconBtn}>
                      <Text>{item.pinned ? "📌" : "📍"}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => openEdit(item)} style={s.iconBtn}>
                      <Text>✏️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() =>
                        Alert.alert("Delete", `Delete "${item.title}"?`, [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Delete",
                            style: "destructive",
                            onPress: () => deleteTemplate(item.id),
                          },
                        ])
                      }
                      style={s.iconBtn}
                    >
                      <Text>🗑</Text>
                    </TouchableOpacity>
                  </>
                )}
                {item.source === "community" && (
                  <View style={s.communityBadge}>
                    <Text style={s.communityText}>community</Text>
                  </View>
                )}
              </View>
            </View>
            <Text style={s.previewText} numberOfLines={2}>
              {item.body}
            </Text>
            <Text style={s.usageCount}>Used {item.usageCount.toLocaleString()} times</Text>
          </TouchableOpacity>
        )}
      />

      {/* Detail modal */}
      <Modal visible={!!detailModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle} numberOfLines={2}>
                {detailModal?.title}
              </Text>
              <TouchableOpacity onPress={() => setDetailModal(null)}>
                <Text style={s.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={s.modalBody}>
              <Text style={s.bodyText}>{detailModal?.body}</Text>
            </ScrollView>
            <View style={s.modalFooter}>
              <TouchableOpacity
                style={s.copyBtn}
                onPress={async () => {
                  if (detailModal?.body) {
                    await Clipboard.setStringAsync(detailModal.body);
                  }
                  Alert.alert("Copied", "Prompt copied to clipboard");
                  setDetailModal(null);
                }}
              >
                <Text style={s.copyBtnText}>📋 Copy prompt</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit modal */}
      <Modal visible={editModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { maxHeight: "90%" }]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{editId ? "Edit Prompt" : "New Prompt"}</Text>
              <TouchableOpacity onPress={() => setEditModal(false)}>
                <Text style={s.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={s.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={s.fieldLabel}>Title</Text>
              <TextInput
                style={s.fieldInput}
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder="Prompt title"
                placeholderTextColor="#52525b"
              />
              <Text style={s.fieldLabel}>Body</Text>
              <TextInput
                style={[s.fieldInput, { minHeight: 120, textAlignVertical: "top" }]}
                value={editBody}
                onChangeText={setEditBody}
                placeholder="Prompt body (use {{variable}} for placeholders)"
                placeholderTextColor="#52525b"
                multiline
              />
              <Text style={s.fieldLabel}>Tags (comma-separated)</Text>
              <TextInput
                style={s.fieldInput}
                value={editTags}
                onChangeText={setEditTags}
                placeholder="coding, legal, …"
                placeholderTextColor="#52525b"
              />
            </ScrollView>
            <View style={s.modalFooter}>
              <TouchableOpacity style={s.copyBtn} onPress={saveEdit}>
                <Text style={s.copyBtnText}>💾 Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#09090b" },
  searchRow: {
    flexDirection: "row",
    padding: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#27272a",
  },
  searchInput: {
    flex: 1,
    backgroundColor: "#18181b",
    color: "#fafafa",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#27272a",
  },
  addBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: "#10b981",
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnText: { color: "#fff", fontSize: 22, lineHeight: 28 },
  tagBar: { maxHeight: 44, borderBottomWidth: 1, borderBottomColor: "#27272a" },
  tagBarContent: { paddingHorizontal: 12, alignItems: "center", gap: 6 },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#18181b",
    borderWidth: 1,
    borderColor: "#27272a",
  },
  tagActive: { backgroundColor: "#064e3b", borderColor: "#10b981" },
  tagText: { color: "#71717a", fontSize: 12 },
  tagTextActive: { color: "#10b981", fontWeight: "600" },
  list: { padding: 12, gap: 10, paddingBottom: 32 },
  card: {
    backgroundColor: "#18181b",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#27272a",
  },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", marginBottom: 8 },
  cardTitleRow: { flexDirection: "row", alignItems: "center" },
  pin: { fontSize: 14 },
  cardTitle: { color: "#fafafa", fontSize: 15, fontWeight: "600", flex: 1 },
  cardTags: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 },
  cardTag: {
    backgroundColor: "#27272a",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  cardTagText: { color: "#71717a", fontSize: 11 },
  cardActions: { flexDirection: "row", alignItems: "center", gap: 4, marginLeft: 8 },
  iconBtn: { padding: 4 },
  communityBadge: {
    backgroundColor: "#1e1b4b",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  communityText: { color: "#818cf8", fontSize: 10, fontWeight: "700" },
  previewText: { color: "#71717a", fontSize: 12, lineHeight: 18, marginBottom: 6 },
  usageCount: { color: "#52525b", fontSize: 11 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,.75)", justifyContent: "flex-end" },
  modalBox: { backgroundColor: "#18181b", borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#27272a",
  },
  modalTitle: { color: "#fafafa", fontSize: 16, fontWeight: "700", flex: 1, marginRight: 8 },
  modalClose: { color: "#71717a", fontSize: 18 },
  modalBody: { padding: 16, maxHeight: 300 },
  bodyText: {
    color: "#d4d4d8",
    fontSize: 14,
    lineHeight: 22,
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
  },
  modalFooter: { padding: 16, borderTopWidth: 1, borderTopColor: "#27272a" },
  copyBtn: {
    backgroundColor: "#10b981",
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  copyBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  fieldLabel: {
    color: "#71717a",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  fieldInput: {
    backgroundColor: "#27272a",
    color: "#fafafa",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#3f3f46",
  },
});
