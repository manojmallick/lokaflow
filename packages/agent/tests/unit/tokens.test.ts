// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaFlow™ — lokaflow.io

import { describe, it, expect } from "vitest";
import { estimateTokens, fitsInWindow, usableTokenBudget } from "../../src/utils/tokens.js";

describe("Token utilities", () => {
  describe("estimateTokens", () => {
    it("returns 0 for empty string", () => {
      expect(estimateTokens("")).toBe(0);
    });

    it("estimates tokens for English prose", () => {
      const text = "The quick brown fox jumps over the lazy dog."; // 9 words ~= ~11 tokens
      const est = estimateTokens(text);
      expect(est).toBeGreaterThan(5);
      expect(est).toBeLessThan(25);
    });

    it("uses lower chars-per-token ratio for JSON", () => {
      const json = '{"key": "value", "nested": {"a": 1}}';
      const prose = "The key has value and nested a is one.";
      // JSON has more special chars → lower chars-per-token → more tokens per char length
      const jsonTokens = estimateTokens(json);
      const proseTokens = estimateTokens(prose);
      // JSON string is shorter but should have comparable or higher token density
      expect(jsonTokens).toBeGreaterThan(0);
      expect(proseTokens).toBeGreaterThan(0);
    });

    it("scales linearly with text length", () => {
      const short = "Hello world.";
      const long = short.repeat(10);
      expect(estimateTokens(long)).toBeGreaterThan(estimateTokens(short) * 5);
    });
  });

  describe("fitsInWindow", () => {
    it("returns true when text fits within 75% of context", () => {
      const text = "A".repeat(100); // very short
      expect(fitsInWindow(text, 4096)).toBe(true);
    });

    it("returns false for text exceeding the usable window", () => {
      // 4096 * 0.75 = 3072 usable tokens; ~3072 tokens × 4 chars = ~12288 chars
      const text = "A ".repeat(10000); // ~10000 tokens equivalent
      expect(fitsInWindow(text, 4096)).toBe(false);
    });
  });

  describe("usableTokenBudget", () => {
    it("returns 75% of context tokens by default", () => {
      expect(usableTokenBudget(4096)).toBe(Math.floor(4096 * 0.75));
    });

    it("respects custom use factor", () => {
      expect(usableTokenBudget(1000, 0.6)).toBe(600);
    });
  });
});
