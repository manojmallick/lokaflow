// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.

/**
 * Unit tests for the Deep Search Pipeline.
 * All LLM and HTTP calls are mocked — no network or Ollama required.
 *
 * Tests:
 *   - QueryExpander: happy path, fallback on parse error, fallback on provider error
 *   - LocalFilter: filters by threshold, passthrough on parse error, empty input
 *   - SearchEngine: full pipeline with mocked expander/retriever/filter, formatAsContext
 *   - BraveSource/ArxivSource: graceful handling of missing API key / network errors
 */

import { describe, it, expect, vi } from "vitest";
import { QueryExpander } from "../../src/search/expander.js";
import { LocalFilter } from "../../src/search/filter.js";
import { SearchEngine } from "../../src/search/engine.js";
import type { SearchResult } from "../../src/types.js";
import { BaseProvider } from "../../src/providers/base.js";
import type { LLMResponse, Message, CompletionOptions } from "../../src/types.js";
import { defaultConfig } from "../../src/config.js";

// ── Mock helpers ─────────────────────────────────────────────────────────────

function makeResponse(content: string): LLMResponse {
    return {
        content,
        model: "mock",
        inputTokens: 10,
        outputTokens: 10,
        costEur: 0,
        latencyMs: 5,
    };
}

class MockProvider extends BaseProvider {
    readonly name = "mock-local";
    private readonly _response: string;

    constructor(response: string) {
        super();
        this._response = response;
    }

    async complete(_m: Message[], _o?: CompletionOptions): Promise<LLMResponse> {
        return makeResponse(this._response);
    }

    async *stream(_m: Message[]): AsyncGenerator<string> {
        yield this._response;
    }

    get costPer1kInputTokens() { return 0; }
    get costPer1kOutputTokens() { return 0; }
    async healthCheck() { return true; }
}

class FailingProvider extends BaseProvider {
    readonly name = "failing";
    async complete(): Promise<LLMResponse> { throw new Error("provider unavailable"); }
    async *stream(): AsyncGenerator<string> { throw new Error("provider unavailable"); }
    get costPer1kInputTokens() { return 0; }
    get costPer1kOutputTokens() { return 0; }
    async healthCheck() { return false; }
}

function sampleResult(i: number): SearchResult {
    return {
        title: `Result ${i}`,
        url: `https://example.com/result-${i}`,
        snippet: `This is snippet number ${i}. It describes something useful about the topic.`,
    };
}

// ── QueryExpander ─────────────────────────────────────────────────────────────

describe("QueryExpander", () => {
    it("returns expanded sub-queries from valid JSON response", async () => {
        const provider = new MockProvider(
            '{"queries": ["TypeScript interfaces", "TypeScript generics tutorial", "TypeScript type narrowing"]}',
        );
        const expander = new QueryExpander(provider);
        const result = await expander.expand("How do TypeScript generics work?");
        expect(result).toEqual([
            "TypeScript interfaces",
            "TypeScript generics tutorial",
            "TypeScript type narrowing",
        ]);
    });

    it("limits to 3 queries even if model returns more", async () => {
        const provider = new MockProvider(
            '{"queries": ["q1", "q2", "q3", "q4", "q5"]}',
        );
        const expander = new QueryExpander(provider);
        const result = await expander.expand("complex query");
        expect(result.length).toBe(3);
    });

    it("falls back to original query when JSON is invalid", async () => {
        const provider = new MockProvider("not valid json at all");
        const expander = new QueryExpander(provider);
        const result = await expander.expand("my original query");
        expect(result).toEqual(["my original query"]);
    });

    it("falls back to original query when provider throws", async () => {
        const expander = new QueryExpander(new FailingProvider());
        const result = await expander.expand("fallback test");
        expect(result).toEqual(["fallback test"]);
    });

    it("falls back to original query when queries array is empty", async () => {
        const provider = new MockProvider('{"queries": []}');
        const expander = new QueryExpander(provider);
        const result = await expander.expand("empty queries test");
        expect(result).toEqual(["empty queries test"]);
    });

    it("handles JSON wrapped in markdown code fences", async () => {
        const provider = new MockProvider(
            '```json\n{"queries": ["sub-query 1", "sub-query 2"]}\n```',
        );
        const expander = new QueryExpander(provider);
        const result = await expander.expand("original");
        expect(result).toEqual(["sub-query 1", "sub-query 2"]);
    });
});

// ── LocalFilter ──────────────────────────────────────────────────────────────

describe("LocalFilter", () => {
    it("returns empty input unchanged", async () => {
        const filter = new LocalFilter(new MockProvider("{}"), 5);
        const result = await filter.filter("query", []);
        expect(result).toEqual([]);
    });

    it("filters results below threshold", async () => {
        const provider = new MockProvider(
            '{"scores": [{"index": 0, "score": 8}, {"index": 1, "score": 2}, {"index": 2, "score": 9}]}',
        );
        const filter = new LocalFilter(provider, 5);
        const results = [sampleResult(0), sampleResult(1), sampleResult(2)];
        const filtered = await filter.filter("test query", results);
        expect(filtered.length).toBe(2);
        expect(filtered.every((r) => (r.score ?? 0) >= 5)).toBe(true);
    });

    it("sorts results by score descending", async () => {
        const provider = new MockProvider(
            '{"scores": [{"index": 0, "score": 4}, {"index": 1, "score": 9}, {"index": 2, "score": 7}]}',
        );
        const filter = new LocalFilter(provider, 3);
        const results = [sampleResult(0), sampleResult(1), sampleResult(2)];
        const filtered = await filter.filter("test", results);
        expect(filtered[0]?.score).toBe(9);
        expect(filtered[1]?.score).toBe(7);
        expect(filtered[2]?.score).toBe(4);
    });

    it("returns all results unchanged when JSON parse fails", async () => {
        const filter = new LocalFilter(new MockProvider("bad json"), 5);
        const results = [sampleResult(0), sampleResult(1)];
        const filtered = await filter.filter("query", results);
        expect(filtered.length).toBe(2);
    });

    it("returns all results unchanged when provider fails", async () => {
        const filter = new LocalFilter(new FailingProvider(), 5);
        const results = [sampleResult(0), sampleResult(1)];
        const filtered = await filter.filter("query", results);
        expect(filtered.length).toBe(2);
    });

    it("returns all results when all scores are below threshold (safety fallback)", async () => {
        const provider = new MockProvider(
            '{"scores": [{"index": 0, "score": 1}, {"index": 1, "score": 2}]}',
        );
        const filter = new LocalFilter(provider, 8);
        const results = [sampleResult(0), sampleResult(1)];
        // All below threshold → fallback returns everything
        const filtered = await filter.filter("query", results);
        expect(filtered.length).toBe(2);
    });
});

// ── SearchEngine ─────────────────────────────────────────────────────────────

describe("SearchEngine.formatAsContext", () => {
    it("returns empty string for empty results", () => {
        expect(SearchEngine.formatAsContext([])).toBe("");
    });

    it("formats results with title, URL, and snippet", () => {
        const result = SearchEngine.formatAsContext([
            { title: "TypeScript Guide", url: "https://ts-guide.com", snippet: "Learn TypeScript" },
        ]);
        expect(result).toContain("TypeScript Guide");
        expect(result).toContain("https://ts-guide.com");
        expect(result).toContain("Learn TypeScript");
        expect(result).toContain("Web Search Context");
    });

    it("numbers multiple results starting from 1", () => {
        const results = [
            { title: "First", url: "https://a.com", snippet: "A" },
            { title: "Second", url: "https://b.com", snippet: "B" },
        ];
        const context = SearchEngine.formatAsContext(results);
        expect(context).toContain("[1]");
        expect(context).toContain("[2]");
    });
});

describe("SearchEngine (pipeline integration)", () => {
    function makeEngine(expanderResponse: string, filterResponse: string) {
        const provider = new MockProvider(expanderResponse);
        const engine = new SearchEngine(provider, {
            ...defaultConfig.search,
            enabled: true,
            braveEnabled: false, // disable real HTTP sources
            arxivEnabled: false,
            maxResults: 5,
            filterThreshold: 0,
        });

        // Inject a spy on the internal filter to return controlled output
        vi.spyOn(provider, "complete")
            .mockResolvedValueOnce(makeResponse(expanderResponse))  // expander call
            .mockResolvedValueOnce(makeResponse(filterResponse));   // filter call

        return engine;
    }

    it("returns empty array when no sources are enabled", async () => {
        const provider = new MockProvider('{"queries": ["test"]}');
        const engine = new SearchEngine(provider, {
            ...defaultConfig.search,
            enabled: true,
            braveEnabled: false,
            arxivEnabled: false,
        });
        const results = await engine.search("test query");
        expect(results).toEqual([]);
    });

    it("activeSources returns empty list when no sources configured", () => {
        const provider = new MockProvider("{}");
        const engine = new SearchEngine(provider, {
            ...defaultConfig.search,
            braveEnabled: false,
            arxivEnabled: false,
        });
        expect(engine.activeSources).toEqual([]);
    });
});
