// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.

/**
 * Integration tests for the full routing pipeline with a live Ollama instance.
 * Validates the complete path: PII scan → classifier → budget → Ollama execute.
 *
 * Run:  pnpm test:integration
 * Skip: tests are automatically skipped if Ollama is not reachable.
 *
 * Environment variables:
 *   OLLAMA_URL         — Ollama base URL (default: http://localhost:11434)
 *   OLLAMA_TEST_MODEL  — model to use (default: mistral:7b)
 */

import { beforeAll, describe, expect, it } from "vitest";
import { Router } from "../../src/router/router.js";
import { OllamaProvider } from "../../src/providers/local.js";
import { defaultConfig } from "../../src/config.js";
import type { Message } from "../../src/types.js";

const OLLAMA_URL = process.env["OLLAMA_URL"] ?? "http://localhost:11434";
const TEST_MODEL = process.env["OLLAMA_TEST_MODEL"] ?? "mistral:7b";

let ollamaAvailable = false;
let localProvider: OllamaProvider;
let router: Router;

const msg = (content: string): Message[] => [{ role: "user", content }];

beforeAll(async () => {
  localProvider = new OllamaProvider(OLLAMA_URL, TEST_MODEL, 30_000);
  ollamaAvailable = await localProvider.healthCheck();

  if (!ollamaAvailable) {
    console.warn(
      `[integration] Ollama not reachable at ${OLLAMA_URL} — skipping pipeline tests.\n` +
        `  Start Ollama with: ollama serve && ollama pull ${TEST_MODEL}`,
    );
    return;
  }

  router = new Router(
    {
      local: [localProvider],
      cloud: localProvider, // use local as cloud stub — avoids needing API keys in integration CI
    },
    {
      ...defaultConfig,
      router: {
        ...defaultConfig.router,
        // Force all non-PII/non-token-limit queries to local for integration tests
        complexityCloudThreshold: 1.1,
      },
    },
  );
});

describe("Router pipeline — live (Ollama)", () => {
  describe("PII blocking", () => {
    it("forces local and returns pii_detected reason for email", async () => {
      if (!ollamaAvailable) return;

      const decision = await router.route(msg("Please email john.doe@company.com about the invoice"));

      expect(decision.tier).toBe("local");
      expect(decision.reason).toBe("pii_detected");
      expect(decision.response.content.length).toBeGreaterThan(0);
      expect(decision.response.costEur).toBe(0.0);
    });

    it("forces local for Dutch IBAN", async () => {
      if (!ollamaAvailable) return;

      const decision = await router.route(msg("Wire €200 to NL91ABNA0417164300 by Friday"));

      expect(decision.tier).toBe("local");
      expect(decision.reason).toBe("pii_detected");
    });

    it("forces local for BSN number", async () => {
      if (!ollamaAvailable) return;

      const decision = await router.route(msg("My BSN is 111222333, help me fill in this form"));

      expect(decision.tier).toBe("local");
      expect(decision.reason).toBe("pii_detected");
    });
  });

  describe("token limit", () => {
    it("forces local when query exceeds maxLocalTokens", async () => {
      if (!ollamaAvailable) return;

      // ~9000 words → ~11700 estimated tokens, above 8000 limit
      const longQuery = "Summarise this document: " + "word ".repeat(9000);
      const decision = await router.route(msg(longQuery));

      expect(decision.tier).toBe("local");
      expect(decision.reason).toBe("token_limit");
    });
  });

  describe("complexity routing", () => {
    it("routes a simple query to local tier with a real response", async () => {
      if (!ollamaAvailable) return;

      const decision = await router.route(msg("What is the capital of France?"));

      expect(decision.tier).toBe("local");
      expect(decision.complexityScore).toBeLessThan(0.35);
      expect(decision.response.content.length).toBeGreaterThan(0);
      expect(decision.response.model).toBe(TEST_MODEL);
      expect(decision.response.costEur).toBe(0.0);
      expect(decision.response.latencyMs).toBeGreaterThan(0);
    });
  });

  describe("RoutingDecision shape", () => {
    it("always returns all required fields", async () => {
      if (!ollamaAvailable) return;

      const decision = await router.route(msg("Say the word: OK"));

      expect(decision).toHaveProperty("tier");
      expect(decision).toHaveProperty("model");
      expect(decision).toHaveProperty("reason");
      expect(decision).toHaveProperty("complexityScore");
      expect(decision).toHaveProperty("response");
      expect(decision.response).toHaveProperty("content");
      expect(decision.response).toHaveProperty("inputTokens");
      expect(decision.response).toHaveProperty("outputTokens");
      expect(decision.response).toHaveProperty("costEur");
      expect(decision.response).toHaveProperty("latencyMs");
    });
  });

  describe("budget enforcement", () => {
    it("local queries are always free and never trigger budget exceeded", async () => {
      if (!ollamaAvailable) return;

      // Create a router with an extremely tight budget — local should still work
      const tightBudgetRouter = new Router(
        { local: [localProvider], cloud: localProvider },
        {
          ...defaultConfig,
          budget: { dailyEur: 0.0, monthlyEur: 0.0, warnAtPercent: 80 },
          router: { ...defaultConfig.router, complexityCloudThreshold: 1.1 },
        },
      );

      const decision = await tightBudgetRouter.route(msg("What is 2 + 2?"));

      expect(decision.tier).toBe("local");
      expect(decision.response.costEur).toBe(0.0);
    });
  });
});
