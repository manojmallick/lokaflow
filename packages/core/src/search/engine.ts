// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.

/**
 * SearchEngine — orchestrates the full deep search pipeline:
 *   1. QueryExpander  — local model produces 2–3 sub-queries
 *   2. ParallelRetriever — concurrent Brave + arXiv fetches, deduplicates by URL
 *   3. LocalFilter    — local model scores results; drops low-relevance ones
 *   4. Returns top-N SearchResult[] ready for prompt injection
 */

import type { LokaFlowConfig, SearchResult } from "../types.js";
import type { BaseProvider } from "../providers/base.js";
import { QueryExpander } from "./expander.js";
import { LocalFilter } from "./filter.js";
import { ParallelRetriever } from "./retriever.js";
import { BraveSource } from "./sources/brave.js";
import { ArxivSource } from "./sources/arxiv.js";

export class SearchEngine {
    private readonly expander: QueryExpander;
    private readonly retriever: ParallelRetriever;
    private readonly filter: LocalFilter;
    private readonly maxResults: number;

    constructor(localProvider: BaseProvider, config: LokaFlowConfig["search"]) {
        this.maxResults = config.maxResults;
        this.expander = new QueryExpander(localProvider);

        const sources = [];
        if (config.braveEnabled) sources.push(new BraveSource());
        if (config.arxivEnabled) sources.push(new ArxivSource());

        this.retriever = new ParallelRetriever(sources);
        this.filter = new LocalFilter(localProvider, config.filterThreshold);
    }

    get activeSources(): string[] {
        return this.retriever.activeSources;
    }

    async search(query: string): Promise<SearchResult[]> {
        // 1. Expand the query into sub-queries
        const subQueries = await this.expander.expand(query);

        // 2. Retrieve from all sources in parallel
        const maxPerSource = Math.max(2, Math.ceil(this.maxResults / Math.max(subQueries.length, 1)));
        const raw = await this.retriever.retrieve(subQueries, maxPerSource);

        if (raw.length === 0) return [];

        // 3. Filter and re-rank
        const filtered = await this.filter.filter(query, raw);

        // 4. Return top N
        return filtered.slice(0, this.maxResults);
    }

    /** Format search results as a system message for prompt injection. */
    static formatAsContext(results: SearchResult[]): string {
        if (results.length === 0) return "";
        const lines = results.map(
            (r, i) =>
                `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}`,
        );
        return (
            "## Web Search Context\n\n" +
            "The following search results were retrieved to help answer the question. " +
            "Use them to inform your answer where relevant, and cite the source URL when referencing them.\n\n" +
            lines.join("\n\n")
        );
    }
}
