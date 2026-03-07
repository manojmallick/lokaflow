// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Router } from "../../src/router/router.js";
import { defaultConfig } from "../../src/config.js";
import { BudgetExceededError } from "../../src/exceptions.js";
import type { LLMResponse, Message } from "../../src/types.js";
import { BaseProvider } from "../../src/providers/base.js";

// ── Mock provider factory ────────────────────────────────────────────────────

function mockResponse(overrides: Partial<LLMResponse> = {}): LLMResponse {
  return {
    content: "test response",
    model: "mock",
    inputTokens: 50,
    outputTokens: 30,
    costEur: 0.001,
    latencyMs: 100,
    ...overrides,
  };
}

class MockProvider extends BaseProvider {
  readonly name: string;
  readonly _costInput: number;
  readonly _costOutput: number;
  private readonly _response: LLMResponse;

  constructor(name: string, costInput = 0, costOutput = 0, response?: Partial<LLMResponse>) {
    super();
    this.name = name;
    this._costInput = costInput;
    this._costOutput = costOutput;
    this._response = mockResponse({ model: name, ...response });
  }

  async complete(_messages: Message[]): Promise<LLMResponse> {
    return this._response;
  }

  async *stream(_messages: Message[]): AsyncGenerator<string> {
    yield this._response.content;
  }

  get costPer1kInputTokens(): number {
    return this._costInput;
  }
  get costPer1kOutputTokens(): number {
    return this._costOutput;
  }
  async healthCheck(): Promise<boolean> {
    return true;
  }
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const makeRouter = (overrides = {}) =>
  new Router(
    {
      local: [new MockProvider("local", 0, 0, { costEur: 0.0 })],
      cloud: new MockProvider("cloud", 0.003, 0.015, { costEur: 0.01 }),
    },
    { ...defaultConfig, ...overrides },
  );

const msg = (content: string): Message[] => [{ role: "user", content }];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Router", () => {
  describe("PII detection → force local", () => {
    it("routes to local when PII detected (email)", async () => {
      const router = makeRouter();
      const decision = await router.route(msg("Send invoice to customer@example.com"));
      expect(decision.tier).toBe("local");
      expect(decision.reason).toBe("pii_detected");
    });

    it("routes to local when IBAN detected", async () => {
      const router = makeRouter();
      const decision = await router.route(msg("Transfer to NL91ABNA0417164300 please"));
      expect(decision.tier).toBe("local");
      expect(decision.reason).toBe("pii_detected");
    });
  });

  describe("token limit → force local", () => {
    it("routes to local when text exceeds maxLocalTokens", async () => {
      const router = makeRouter();
      // Generate ~9000 word text (> 8000 token limit)
      const longText = "word ".repeat(7000);
      const decision = await router.route(msg(longText));
      expect(decision.tier).toBe("local");
      expect(decision.reason).toBe("token_limit");
    });
  });

  describe("complexity routing", () => {
    it("simple query → local tier", async () => {
      const router = makeRouter();
      const decision = await router.route(msg("What is 2 + 2?"));
      expect(decision.tier).toBe("local");
      expect(decision.complexityScore).toBeLessThan(0.35);
    });

    it("response includes model and latency", async () => {
      const router = makeRouter();
      const decision = await router.route(msg("Hello"));
      expect(decision.model).toBe("local");
      expect(decision.response.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("provider fallback", () => {
    it("falls back to local if cloud provider is unavailable", async () => {
      const failingCloud = new MockProvider("failing-cloud");
      vi.spyOn(failingCloud, "complete").mockRejectedValue(new Error("Network error"));

      const router = new Router(
        { local: [new MockProvider("local", 0, 0)], cloud: failingCloud },
        {
          ...defaultConfig,
          router: {
            ...defaultConfig.router,
            // Force high complexity to trigger cloud routing
            complexityCloudThreshold: 0.0,
            fallbackToLocal: true,
          },
        },
      );

      const decision = await router.route(msg("Simple question"));
      expect(decision.tier).toBe("local");
    });
  });

  describe("RoutingDecision shape", () => {
    it("returns all required fields", async () => {
      const router = makeRouter();
      const decision = await router.route(msg("Test query"));
      expect(decision).toHaveProperty("tier");
      expect(decision).toHaveProperty("model");
      expect(decision).toHaveProperty("reason");
      expect(decision).toHaveProperty("complexityScore");
      expect(decision).toHaveProperty("response");
      expect(decision.response).toHaveProperty("content");
      expect(decision.response).toHaveProperty("costEur");
    });
  });
});
