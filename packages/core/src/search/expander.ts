// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.

/**
 * QueryExpander — uses a local Ollama model to produce 2–3 focused sub-queries
 * from the user's original query.
 *
 * Falls back to the original query string as a single-element array on any error.
 */

import type { BaseProvider } from "../providers/base.js";
import type { Message } from "../types.js";

const SYSTEM_PROMPT =
    'You are a search query expert. Given a user question, output ONLY valid JSON with key "queries" — an array of 2-3 concise, distinct search queries that together cover the topic. No markdown, no explanations.';

interface ExpandedQueries {
    queries: string[];
}

export class QueryExpander {
    constructor(private readonly localProvider: BaseProvider) { }

    async expand(query: string): Promise<string[]> {
        try {
            const messages: Message[] = [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: query },
            ];

            const response = await this.localProvider.complete(messages, {
                maxTokens: 256,
                temperature: 0.3,
            });

            const cleaned = response.content
                .replace(/^```[a-z]*\n?/, "")
                .replace(/\n?```$/, "")
                .trim();

            const parsed = JSON.parse(cleaned) as ExpandedQueries;

            if (Array.isArray(parsed.queries) && parsed.queries.length > 0) {
                return parsed.queries.slice(0, 3).map((q) => String(q).trim());
            }
        } catch {
            // Parse failure or provider error — continue with fallback
        }

        return [query];
    }
}
