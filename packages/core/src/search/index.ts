// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.

/**
 * Search pipeline public API.
 * Set `search.enabled: true` in lokaflow.yaml to activate.
 */

export { SearchEngine } from "./engine.js";
export { QueryExpander } from "./expander.js";
export { LocalFilter } from "./filter.js";
export { ParallelRetriever } from "./retriever.js";
export type { SearchSource } from "./retriever.js";
export { BraveSource } from "./sources/brave.js";
export { ArxivSource } from "./sources/arxiv.js";

export const SEARCH_STATUS = "implemented" as const;
