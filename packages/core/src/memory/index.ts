// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.

/**
 * Memory / RAG module public API.
 * Set `memory.enabled: true` in lokaflow.yaml to activate.
 */

export { MemoryStore } from "./store.js";
export type { MemoryEntry, SimilarEntry } from "./store.js";

export { ProfileStore } from "./profile.js";
export type { UserProfile } from "./profile.js";

export { TfidfVectorizer, RagRetriever, MemoryManager } from "./rag.js";
export type { RagContext, MemoryManagerOptions } from "./rag.js";

export const MEMORY_STATUS = "implemented" as const;
