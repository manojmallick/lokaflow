// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.

/**
 * ArxivSource — queries the arXiv Atom API (no API key required).
 * Only activates when the query contains research/technical keywords.
 * Returns up to maxResults paper title + abstract snippets.
 */

import type { SearchResult } from "../../types.js";

// Keywords that signal the query may benefit from academic papers
const RESEARCH_KEYWORDS =
    /\b(research|paper|arxiv|study|algorithm|neural|transformer|attention|model|dataset|benchmark|sota|state-of-the-art|diffusion|embedding|fine.?tun|pretrain|llm|language model)\b/i;

export class ArxivSource {
    readonly name = "arxiv";
    private static readonly BASE_URL = "https://export.arxiv.org/api/query";

    get isAvailable(): boolean {
        return true; // No API key needed
    }

    isRelevant(query: string): boolean {
        return RESEARCH_KEYWORDS.test(query);
    }

    async search(query: string, maxResults: number): Promise<SearchResult[]> {
        if (!this.isRelevant(query)) return [];

        try {
            const url = new URL(ArxivSource.BASE_URL);
            url.searchParams.set("search_query", `all:${query}`);
            url.searchParams.set("start", "0");
            url.searchParams.set("max_results", String(Math.min(maxResults, 10)));
            url.searchParams.set("sortBy", "relevance");
            url.searchParams.set("sortOrder", "descending");

            const resp = await fetch(url.toString(), {
                headers: { Accept: "application/atom+xml" },
                signal: AbortSignal.timeout(10_000),
            });

            if (!resp.ok) return [];

            const xml = await resp.text();
            return this.parseAtom(xml, maxResults);
        } catch {
            return [];
        }
    }

    private parseAtom(xml: string, maxResults: number): SearchResult[] {
        const results: SearchResult[] = [];
        // Simple regex-based Atom parser — avoids a DOM/XML dependency
        const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
        let match: RegExpExecArray | null;

        while ((match = entryRegex.exec(xml)) !== null && results.length < maxResults) {
            const entry = match[1]!;

            const titleMatch = /<title>([\s\S]*?)<\/title>/.exec(entry);
            const summaryMatch = /<summary>([\s\S]*?)<\/summary>/.exec(entry);
            const idMatch = /<id>(https?:\/\/[^<]+)<\/id>/.exec(entry);

            const title = titleMatch ? titleMatch[1]!.trim().replace(/\s+/g, " ") : "(Untitled)";
            const snippet = summaryMatch
                ? summaryMatch[1]!.trim().replace(/\s+/g, " ").slice(0, 400)
                : "";
            const url = idMatch ? idMatch[1]!.trim() : "https://arxiv.org";

            if (snippet) {
                results.push({ title, url, snippet });
            }
        }

        return results;
    }
}
