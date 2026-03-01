// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.

/**
 * LocalFilter — scores search results for relevance using a local LLM.
 * Asks the model to rate each snippet 0–10 and drops those below threshold.
 * Falls back to returning all results unmodified on any parse error.
 */

import type { BaseProvider } from "../providers/base.js";
import type { Message, SearchResult } from "../types.js";

interface ScoredResult {
    index: number;
    score: number;
}

interface FilterResponse {
    scores: ScoredResult[];
}

export class LocalFilter {
    constructor(
        private readonly localProvider: BaseProvider,
        private readonly threshold: number,
    ) { }

    async filter(query: string, results: SearchResult[]): Promise<SearchResult[]> {
        if (results.length === 0) return results;

        const snippets = results
            .map(
                (r, i) =>
                    `[${i}] Title: ${r.title}\nSnippet: ${r.snippet.slice(0, 300)}`,
            )
            .join("\n\n");

        const systemPrompt =
            'You are a relevance judge. Given a user query and numbered search result snippets, rate each result\'s relevance on a scale of 0-10. Output ONLY valid JSON: {"scores": [{"index": 0, "score": 7}, ...]}. No markdown.';

        const userContent = `User query: "${query}"\n\nSearch results:\n${snippets}`;

        try {
            const messages: Message[] = [
                { role: "system", content: systemPrompt },
                { role: "user", content: userContent },
            ];

            const response = await this.localProvider.complete(messages, {
                maxTokens: 512,
                temperature: 0.1,
            });

            const cleaned = response.content
                .replace(/^```[a-z]*\n?/, "")
                .replace(/\n?```$/, "")
                .trim();

            const parsed = JSON.parse(cleaned) as FilterResponse;

            if (!Array.isArray(parsed.scores)) return results;

            // Build a score map
            const scoreMap = new Map<number, number>(
                parsed.scores.map((s) => [s.index, s.score]),
            );

            // Attach scores and filter
            const scored = results
                .map((r, i) => ({ ...r, score: scoreMap.get(i) ?? 0 }))
                .filter((r) => r.score >= this.threshold);

            // Return filtered results sorted by score descending; fallback if all filtered out
            if (scored.length === 0) return results;
            return scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
        } catch {
            // Model failure or JSON parse error — return all results unmodified
            return results;
        }
    }
}
