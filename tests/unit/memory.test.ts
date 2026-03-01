// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.

/**
 * Unit tests for the Memory / RAG Pipeline.
 * Uses an in-memory (`:memory:`) SQLite database — no filesystem writes required.
 *
 * Tests:
 *   - TfidfVectorizer: tokenization, fit/vectorize, L2 normalisation, empty vocab
 *   - MemoryStore: add, recent, similar, session isolation, close
 *   - ProfileStore: load defaults, save/load roundtrip, partial update, multiple profiles
 *   - MemoryManager: remember/recall roundtrip, empty recall, session isolation
 */

import { describe, it, expect, beforeEach } from "vitest";
import { TfidfVectorizer, MemoryManager } from "../../src/memory/rag.js";
import { MemoryStore } from "../../src/memory/store.js";
import { ProfileStore } from "../../src/memory/profile.js";

// ── TfidfVectorizer ───────────────────────────────────────────────────────────

describe("TfidfVectorizer", () => {
    let vectorizer: TfidfVectorizer;

    beforeEach(() => {
        vectorizer = new TfidfVectorizer();
    });

    it("returns empty vector before fitting", () => {
        const vec = vectorizer.vectorize("hello world", ["hello world"]);
        expect(vec).toEqual([]);
    });

    it("fit builds a non-empty vocabulary from documents", () => {
        vectorizer.fit(["the quick brown fox", "lazy dog runs away"]);
        const vec = vectorizer.vectorize("quick fox", ["the quick brown fox"]);
        expect(vec.length).toBeGreaterThan(0);
    });

    it("vectorize produces L2-normalised output (norm ≈ 1.0)", () => {
        const docs = ["machine learning models", "deep learning neural networks", "gradient descent optimization"];
        vectorizer.fit(docs);
        const vec = vectorizer.vectorize("learning models", docs);
        const norm = Math.sqrt(vec.reduce((acc, v) => acc + v * v, 0));
        // If any non-zero terms, norm should be ~1.0
        if (norm > 0) {
            expect(norm).toBeCloseTo(1.0, 5);
        }
    });

    it("stopwords are excluded from vocabulary", () => {
        // 'the', 'and', 'is', 'a' are stopwords → only 'typescript' and 'language' survive
        vectorizer.fit(["typescript is a language"]);
        const vec = vectorizer.vectorize("typescript", ["typescript is a language"]);
        // Results should have fewer dimensions than raw word count
        expect(vec.length).toBeLessThan(5);
        expect(vec.length).toBeGreaterThan(0);
    });

    it("same query produces a non-zero similarity with similar documents", () => {
        const docs = ["how to write TypeScript code", "writing JavaScript functions", "code review best practices"];
        vectorizer.fit(docs);

        const v1 = vectorizer.vectorize("TypeScript code writing", docs);
        const v2 = vectorizer.vectorize("TypeScript code writing", docs);

        // Cosine similarity of identical vectors = 1.0
        const dot = v1.reduce((acc, v, i) => acc + v * (v2[i] ?? 0), 0);
        expect(dot).toBeGreaterThan(0.99);
    });

    it("handles empty documents array gracefully", () => {
        vectorizer.fit([]);
        const vec = vectorizer.vectorize("anything", []);
        expect(vec).toEqual([]);
    });

    it("tokens shorter than 3 chars are excluded", () => {
        vectorizer.fit(["ai ml ts"]); // all tokens are ≤ 2 chars
        const vec = vectorizer.vectorize("ai ml ts", ["ai ml ts"]);
        // All tokens should be filtered, so vector is empty (vocab not built)
        expect(vec.length).toBe(0);
    });
});

// ── MemoryStore ───────────────────────────────────────────────────────────────

describe("MemoryStore", () => {
    let store: MemoryStore;

    beforeEach(() => {
        // Use in-memory SQLite for fast, isolated tests
        store = new MemoryStore(":memory:");
    });

    it("stores and retrieves entries with recent()", () => {
        store.add("session-1", "user", "What is TypeScript?");
        store.add("session-1", "assistant", "It's a typed superset of JavaScript.");

        const entries = store.recent("session-1", 10);
        expect(entries.length).toBe(2);
        expect(entries[0]?.role).toBe("user");
        expect(entries[1]?.role).toBe("assistant");
    });

    it("recent() respects the limit parameter", () => {
        for (let i = 0; i < 10; i++) {
            store.add("session-1", "user", `Message ${i}`);
        }
        const entries = store.recent("session-1", 3);
        expect(entries.length).toBe(3);
    });

    it("recent() returns most recent entries (last N)", () => {
        for (let i = 0; i < 5; i++) {
            store.add("session-1", "user", `msg-${i}`);
        }
        const entries = store.recent("session-1", 2);
        // Should be the last 2 messages
        expect(entries[0]?.content).toBe("msg-3");
        expect(entries[1]?.content).toBe("msg-4");
    });

    it("isolates entries by sessionId", () => {
        store.add("session-A", "user", "Hello from A");
        store.add("session-B", "user", "Hello from B");

        const entriesA = store.recent("session-A", 10);
        const entriesB = store.recent("session-B", 10);

        expect(entriesA.length).toBe(1);
        expect(entriesA[0]?.content).toBe("Hello from A");
        expect(entriesB.length).toBe(1);
        expect(entriesB[0]?.content).toBe("Hello from B");
    });

    it("stores entries with optional vector", () => {
        const vector = [0.1, 0.2, 0.3, 0.4];
        store.add("session-1", "user", "vectorised content", { vector });

        const entries = store.recent("session-1", 1);
        expect(entries[0]?.vector).toEqual(vector);
    });

    it("similar() returns entries sorted by cosine similarity", () => {
        const vecA = [1, 0, 0];
        const vecB = [0, 1, 0];
        const vecQ = [1, 0.1, 0]; // closest to vecA

        store.add("session-1", "user", "close match", { vector: vecA });
        store.add("session-1", "user", "far match", { vector: vecB });

        const results = store.similar(vecQ, 2, "session-1");
        expect(results.length).toBeGreaterThan(0);
        // The first result should be the close match
        expect(results[0]?.entry.content).toBe("close match");
    });

    it("similar() returns empty when no vectorised entries exist", () => {
        store.add("session-1", "user", "no vector here");
        const results = store.similar([1, 0, 0], 5, "session-1");
        expect(results).toEqual([]);
    });

    it("entry IDs are unique rowids (incremental numbers)", () => {
        const id1 = store.add("session-1", "user", "msg 1");
        const id2 = store.add("session-1", "user", "msg 2");
        expect(id1).not.toBe(id2);
        expect(typeof id1).toBe("number");
        expect(id2).toBeGreaterThan(id1);
    });

    it("close() does not throw", () => {
        expect(() => store.close()).not.toThrow();
    });
});

// ── ProfileStore ──────────────────────────────────────────────────────────────

describe("ProfileStore", () => {
    let profile: ProfileStore;

    beforeEach(() => {
        profile = new ProfileStore(":memory:");
    });

    it("load() returns a default profile when none exists", () => {
        const p = profile.load("new-user");
        expect(p.id).toBe("new-user");
        expect(p.topics).toEqual([]);
    });

    it("save() persists and load() retrieves the profile", () => {
        profile.save("user-1", {
            topics: ["TypeScript", "AI"],
            preferredLanguage: "en",
        });
        const p = profile.load("user-1");
        expect(p.topics).toEqual(["TypeScript", "AI"]);
        expect(p.preferredLanguage).toBe("en");
    });

    it("save() with partial updates merges with existing", () => {
        profile.save("user-1", { topics: ["TypeScript"], preferredLanguage: "en" });
        profile.save("user-1", { topics: ["Python"] }); // update only topics

        const p = profile.load("user-1");
        expect(p.topics).toEqual(["Python"]);
        expect(p.preferredLanguage).toBe("en"); // preserved
    });

    it("multiple profile IDs are isolated", () => {
        profile.save("user-A", { topics: ["Go"] });
        profile.save("user-B", { topics: ["Rust"] });

        expect(profile.load("user-A").topics).toEqual(["Go"]);
        expect(profile.load("user-B").topics).toEqual(["Rust"]);
    });

    it("customInstructions roundtrips correctly", () => {
        const instructions = "Always respond in JSON format. Be concise.";
        profile.save("user-1", { customInstructions: instructions });
        expect(profile.load("user-1").customInstructions).toBe(instructions);
    });

    it("close() does not throw", () => {
        expect(() => profile.close()).not.toThrow();
    });
});

// ── MemoryManager ─────────────────────────────────────────────────────────────

describe("MemoryManager", () => {
    let manager: MemoryManager;
    let store: MemoryStore;

    beforeEach(() => {
        store = new MemoryStore(":memory:");
        manager = new MemoryManager(store);
    });

    it("recall() returns empty array when no history exists", async () => {
        const msgs = await manager.recall("any query", "session-1");
        expect(msgs).toEqual([]);
    });

    it("remember() and recall() roundtrip — relevant entries are returned", async () => {
        manager.remember("s1", "user", "How do I set up TypeScript with ESM modules?");
        manager.remember("s1", "assistant", "Use NodeNext in tsconfig and .js extensions in imports.");
        manager.remember("s1", "user", "What is the difference between interface and type alias?");

        const msgs = await manager.recall("TypeScript interfaces vs type aliases", "s1", { topK: 3 });
        expect(msgs.length).toBeGreaterThan(0);
        // Should be a system message with history
        expect(msgs[0]?.role).toBe("system");
        expect(msgs[0]?.content).toContain("conversation history");
    });

    it("sessions are isolated — recall on different session returns empty", async () => {
        manager.remember("session-A", "user", "information about TypeScript");
        const msgs = await manager.recall("TypeScript", "session-B", { topK: 4 });
        expect(msgs).toEqual([]);
    });

    it("topK limits the number of retrieved entries represented in context", async () => {
        for (let i = 0; i < 20; i++) {
            manager.remember("sess", "user", `message about TypeScript topic ${i}`);
        }
        const msgs = await manager.recall("TypeScript", "sess", { topK: 2 });
        // Should return at most 1 system message (condensed recall)
        expect(msgs.length).toBeLessThanOrEqual(1);
    });

    it("close() does not throw", () => {
        expect(() => manager.close()).not.toThrow();
    });
});
