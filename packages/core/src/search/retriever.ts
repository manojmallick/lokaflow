// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.

/**
 * ParallelRetriever — queries all registered SearchSource implementations
 * concurrently using Promise.allSettled. Deduplicates results by URL.
 */

import type { SearchResult } from "../types.js";

export interface SearchSource {
    readonly name: string;
    readonly isAvailable: boolean;
    search(query: string, maxResults: number): Promise<SearchResult[]>;
}

export class ParallelRetriever {
    private readonly sources: SearchSource[];

    constructor(sources: SearchSource[]) {
        this.sources = sources.filter((s) => s.isAvailable);
    }

    get activeSources(): string[] {
        return this.sources.map((s) => s.name);
    }

    async retrieve(queries: string[], maxPerSource: number): Promise<SearchResult[]> {
        if (this.sources.length === 0 || queries.length === 0) return [];

        // Fire all source × query combinations concurrently
        const promises = this.sources.flatMap((source) =>
            queries.map((q) => source.search(q, maxPerSource)),
        );

        const settled = await Promise.allSettled(promises);

        const all: SearchResult[] = [];
        const seen = new Set<string>();

        for (const result of settled) {
            if (result.status === "fulfilled") {
                for (const r of result.value) {
                    const key = r.url.toLowerCase().replace(/\/$/, "");
                    if (!seen.has(key)) {
                        seen.add(key);
                        all.push(r);
                    }
                }
            }
            // Rejected promises are silently ignored (graceful degradation)
        }

        return all;
    }
}
