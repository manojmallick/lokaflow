// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.

/**
 * BraveSource — queries the Brave Search API.
 * Free tier: 2,000 requests / month.
 * Requires BRAVE_API_KEY in environment.
 * Returns [] gracefully if key is absent or the request fails.
 */

import { envVar } from "../@lokaflow/core/utils/security.js";
import type { SearchResult } from "../../types.js";

interface BraveWebResult {
    title: string;
    url: string;
    description?: string;
}

interface BraveSearchResponse {
    web?: {
        results?: BraveWebResult[];
    };
}

export class BraveSource {
    readonly name = "brave";
    private readonly apiKey: string | undefined;
    private static readonly BASE_URL = "https://api.search.brave.com/res/v1/web/search";

    constructor() {
        this.apiKey = envVar("BRAVE_API_KEY");
    }

    get isAvailable(): boolean {
        return !!this.apiKey;
    }

    async search(query: string, maxResults: number): Promise<SearchResult[]> {
        if (!this.apiKey) return [];

        try {
            const url = new URL(BraveSource.BASE_URL);
            url.searchParams.set("q", query);
            url.searchParams.set("count", String(Math.min(maxResults, 20)));
            url.searchParams.set("safesearch", "moderate");

            const resp = await fetch(url.toString(), {
                headers: {
                    Accept: "application/json",
                    "Accept-Encoding": "gzip",
                    "X-Subscription-Token": this.apiKey,
                },
                signal: AbortSignal.timeout(8000),
            });

            if (!resp.ok) {
                return [];
            }

            const data = (await resp.json()) as BraveSearchResponse;
            const results = data.web?.results ?? [];

            return results.slice(0, maxResults).map((r) => ({
                title: r.title,
                url: r.url,
                snippet: r.description ?? "",
            }));
        } catch {
            // Network failure, timeout, or JSON parse error — fail silently
            return [];
        }
    }
}
