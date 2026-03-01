// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.

/**
 * RAG helpers — Retrieval-Augmented Generation for LokaFlow.
 *
 * Pipeline:
 *   1. TfidfVectorizer    — converts text → sparse TF-IDF vector (number[])
 *   2. MemoryStore.add()  — stores each message with its vector
 *   3. RagRetriever       — at query time: vectorize → similar() → format context
 *   4. MemoryManager      — high-level facade wiring store + vectorizer
 *
 * Design:
 *   - No external API calls or server dependencies.
 *   - TF-IDF is computed over a local vocabulary built from stored entries.
 *   - Vocabulary is rebuilt on each retrieval (acceptable for <10k entries).
 *   - For larger corpora, upgrade to a persistent vocab or swap to a true
 *     vector DB by replacing MemoryStore.similar() at the interface level.
 */

import type { Message } from "../types.js";
import { MemoryStore } from "./store.js";
import type { MemoryEntry, SimilarEntry } from "./store.js";

// ── TF-IDF vectorizer ────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "is", "it", "its", "be", "was", "are", "were",
    "as", "that", "this", "have", "had", "do", "does", "did", "not", "no",
    "will", "would", "can", "could", "should", "may", "might", "shall",
    "i", "you", "he", "she", "we", "they", "my", "your", "his", "her", "our",
]);

function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

export class TfidfVectorizer {
    private vocabulary: Map<string, number> = new Map();

    /**
     * Build vocabulary from a corpus of documents.
     * Call this before vectorizing individual texts.
     */
    fit(documents: string[]): void {
        const vocab = new Map<string, number>();
        let idx = 0;

        for (const doc of documents) {
            for (const token of new Set(tokenize(doc))) {
                if (!vocab.has(token)) {
                    vocab.set(token, idx++);
                }
            }
        }

        this.vocabulary = vocab;
    }

    /**
     * Vectorize a single text against the current vocabulary.
     * Returns a sparse TF-IDF vector (length = vocab size).
     */
    vectorize(text: string, allDocuments: string[]): number[] {
        if (this.vocabulary.size === 0) return [];

        const tokens = tokenize(text);
        const tf = new Map<string, number>();
        for (const t of tokens) {
            tf.set(t, (tf.get(t) ?? 0) + 1);
        }

        const N = allDocuments.length;
        const vector = new Array<number>(this.vocabulary.size).fill(0);

        for (const [term, idx] of this.vocabulary) {
            const termTf = (tf.get(term) ?? 0) / (tokens.length || 1);
            const dfCount = allDocuments.filter((d) => d.toLowerCase().includes(term)).length;
            const idf = Math.log((N + 1) / (dfCount + 1)) + 1;
            vector[idx] = termTf * idf;
        }

        // L2-normalize
        const norm = Math.sqrt(vector.reduce((acc, v) => acc + v * v, 0));
        if (norm > 0) {
            for (let i = 0; i < vector.length; i++) {
                vector[i] = vector[i]! / norm;
            }
        }

        return vector;
    }
}

// ── RAG retriever ─────────────────────────────────────────────────────────────

export interface RagContext {
    /** Messages to prepend as context (sorted oldest-first). */
    messages: Message[];
    /** Number of retrieved entries. */
    retrievedCount: number;
}

export class RagRetriever {
    private readonly vectorizer: TfidfVectorizer;

    constructor(private readonly store: MemoryStore) {
        this.vectorizer = new TfidfVectorizer();
    }

    /**
     * Retrieve the most relevant past entries for a query.
     * Builds vocabulary from all stored content in the session, then
     * returns the top-k entries as formatted Messages.
     */
    async retrieve(
        query: string,
        sessionId: string,
        topK: number = 4,
    ): Promise<RagContext> {
        // Pull all entries for vocabulary building
        const all = this.store.recent(sessionId, 200);
        if (all.length === 0) {
            return { messages: [], retrievedCount: 0 };
        }

        const docs = all.map((e) => e.content);
        this.vectorizer.fit(docs);

        const queryVec = this.vectorizer.vectorize(query, docs);
        if (queryVec.length === 0) {
            // Fall back to N most recent
            const recent = all.slice(-topK);
            return { messages: entryMessagesToContext(recent), retrievedCount: recent.length };
        }

        // Vectorize all stored entries and find similar ones
        const withVectors = all.map((e) => ({
            entry: e,
            vector: this.vectorizer.vectorize(e.content, docs),
        }));

        // Update vectors in store (background — non-blocking)
        for (const { entry, vector } of withVectors) {
            if (!entry.vector || entry.vector.length !== vector.length) {
                this.store.add(sessionId, entry.role, entry.content, { vector });

            }
        }

        const similar = this.store.similar(queryVec, topK, sessionId);
        if (similar.length === 0) {
            const recent = all.slice(-topK);
            return { messages: entryMessagesToContext(recent), retrievedCount: recent.length };
        }

        return {
            messages: entryMessagesToContext(similar.map((s) => s.entry)),
            retrievedCount: similar.length,
        };
    }
}

function entryMessagesToContext(entries: MemoryEntry[]): Message[] {
    if (entries.length === 0) return [];

    const formatted = entries
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((e) => `[${e.role}]: ${e.content}`)
        .join("\n");

    return [
        {
            role: "system",
            content:
                "## Relevant conversation history\n\n" +
                "The following past exchanges are relevant to the current query. " +
                "Use them where appropriate, but do not repeat them verbatim.\n\n" +
                formatted,
        },
    ];
}

// ── MemoryManager (high-level facade) ────────────────────────────────────────

export interface MemoryManagerOptions {
    /** Max entries to retrieve for context. Default: 4 */
    topK?: number;
    /** Max recent messages to load for vocabulary. Default: 200 */
    historyLimit?: number;
}

export class MemoryManager {
    private readonly store: MemoryStore;
    private readonly retriever: RagRetriever;

    constructor(store?: MemoryStore) {
        this.store = store ?? new MemoryStore();
        this.retriever = new RagRetriever(this.store);
    }

    /**
     * Store a user/assistant exchange.
     * Vectors are computed lazily during retrieval.
     */
    remember(
        sessionId: string,
        role: "user" | "assistant",
        content: string,
    ): void {
        this.store.add(sessionId, role, content);
    }

    /**
     * Retrieve relevant context for a query.
     * Returns Message[] ready to prepend to the conversation.
     */
    async recall(
        query: string,
        sessionId: string,
        options: MemoryManagerOptions = {},
    ): Promise<Message[]> {
        const { topK = 4 } = options;
        const ctx = await this.retriever.retrieve(query, sessionId, topK);
        return ctx.messages;
    }

    /** Close the underlying database connection. */
    close(): void {
        this.store.close();
    }
}
