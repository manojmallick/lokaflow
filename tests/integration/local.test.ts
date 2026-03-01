// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.

/**
 * Integration tests for OllamaProvider.
 * Requires a running Ollama instance with at least one model pulled.
 *
 * Run:  pnpm test:integration
 * Skip: tests are automatically skipped if Ollama is not reachable.
 *
 * Environment variables:
 *   OLLAMA_URL         — Ollama base URL (default: http://localhost:11434)
 *   OLLAMA_TEST_MODEL  — model to use for tests (default: mistral:7b)
 */

import { beforeAll, describe, expect, it } from "vitest";
import { OllamaProvider } from "../../src/providers/local.js";

const OLLAMA_URL = process.env["OLLAMA_URL"] ?? "http://localhost:11434";
const TEST_MODEL = process.env["OLLAMA_TEST_MODEL"] ?? "mistral:7b";

let ollamaAvailable = false;
let provider: OllamaProvider;

beforeAll(async () => {
  provider = new OllamaProvider(OLLAMA_URL, TEST_MODEL, 10_000);
  ollamaAvailable = await provider.healthCheck();
  if (!ollamaAvailable) {
    console.warn(
      `[integration] Ollama not reachable at ${OLLAMA_URL} — skipping all integration tests.\n` +
        `  Start Ollama with: ollama serve\n` +
        `  Pull model with:   ollama pull ${TEST_MODEL}`,
    );
  }
});

describe("OllamaProvider — live", () => {
  describe("healthCheck()", () => {
    it("returns true when Ollama is running", async () => {
      if (!ollamaAvailable) return;
      expect(await provider.healthCheck()).toBe(true);
    });

    it("returns false for an unreachable endpoint", async () => {
      if (!ollamaAvailable) return;
      const dead = new OllamaProvider("http://localhost:19999", TEST_MODEL, 3_000);
      expect(await dead.healthCheck()).toBe(false);
    });
  });

  describe("complete()", () => {
    it("returns a non-empty response", async () => {
      if (!ollamaAvailable) return;

      const response = await provider.complete([
        { role: "user", content: "Reply with exactly the word: PONG" },
      ]);

      expect(response.content.length).toBeGreaterThan(0);
      expect(response.model).toBe(TEST_MODEL);
      expect(response.costEur).toBe(0.0);
      expect(response.latencyMs).toBeGreaterThan(0);
    });

    it("returns zero cost regardless of token count", async () => {
      if (!ollamaAvailable) return;

      const response = await provider.complete([
        { role: "user", content: "What is 1 + 1?" },
      ]);

      expect(response.costEur).toBe(0.0);
      expect(response.inputTokens).toBeGreaterThanOrEqual(0);
      expect(response.outputTokens).toBeGreaterThanOrEqual(0);
    });

    it("respects custom model via CompletionOptions", async () => {
      if (!ollamaAvailable) return;

      const response = await provider.complete(
        [{ role: "user", content: "Say hi" }],
        { model: TEST_MODEL },
      );

      expect(response.model).toBe(TEST_MODEL);
    });

    it("streams tokens via onStream callback", async () => {
      if (!ollamaAvailable) return;

      const chunks: string[] = [];
      await provider.complete(
        [{ role: "user", content: "Count to 3" }],
        { onStream: (chunk) => chunks.push(chunk) },
      );

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.join("").length).toBeGreaterThan(0);
    });
  });

  describe("stream()", () => {
    it("yields string chunks via AsyncGenerator", async () => {
      if (!ollamaAvailable) return;

      const chunks: string[] = [];
      for await (const chunk of provider.stream([
        { role: "user", content: "Say hello" },
      ])) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.every((c) => typeof c === "string")).toBe(true);
    });
  });

  describe("provider identity", () => {
    it("name includes the hostname", () => {
      expect(provider.name).toContain("ollama");
      expect(provider.name).toContain("localhost");
    });

    it("cost per 1k tokens is 0.0 for local models", () => {
      expect(provider.costPer1kInputTokens).toBe(0.0);
      expect(provider.costPer1kOutputTokens).toBe(0.0);
    });
  });
});
