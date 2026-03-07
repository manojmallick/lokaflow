// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BudgetTracker } from "../../src/router/budget.js";
import { BudgetExceededError } from "../../src/exceptions.js";

function tmpDb(testName: string): string {
  const dir = join(tmpdir(), "lokaflow-test", testName.replace(/\s+/g, "-"));
  mkdirSync(dir, { recursive: true });
  return join(dir, "costs.db");
}

describe("BudgetTracker", () => {
  let dbPath: string;
  let tracker: BudgetTracker;

  beforeEach(() => {
    dbPath = tmpDb(`budget-${Date.now()}`);
    tracker = new BudgetTracker(2.0, 30.0, 80, dbPath);
  });

  afterEach(() => {
    tracker.close();
    rmSync(dbPath, { force: true });
  });

  describe("checkAndRecord()", () => {
    it("records a low-cost query without throwing", () => {
      expect(() =>
        tracker.checkAndRecord({
          model: "claude-sonnet",
          inputTokens: 100,
          outputTokens: 50,
          costEur: 0.001,
          routingTier: "cloud",
        }),
      ).not.toThrow();
    });

    it("throws BudgetExceededError when daily limit would be exceeded", () => {
      // Record a near-limit cost first
      tracker.checkAndRecord({
        model: "test",
        inputTokens: 1000,
        outputTokens: 500,
        costEur: 1.99,
        routingTier: "cloud",
      });

      // Next request should exceed daily limit of €2.00
      expect(() =>
        tracker.checkAndRecord({
          model: "test",
          inputTokens: 100,
          outputTokens: 50,
          costEur: 0.02,
          routingTier: "cloud",
        }),
      ).toThrow(BudgetExceededError);
    });

    it("BudgetExceededError carries period and limits", () => {
      tracker.checkAndRecord({
        model: "test",
        inputTokens: 1000,
        outputTokens: 500,
        costEur: 1.99,
        routingTier: "cloud",
      });

      try {
        tracker.checkAndRecord({
          model: "test",
          inputTokens: 100,
          outputTokens: 50,
          costEur: 0.02,
          routingTier: "cloud",
        });
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(BudgetExceededError);
        const budgetErr = err as BudgetExceededError;
        expect(budgetErr.period).toBe("daily");
        expect(budgetErr.limitEur).toBe(2.0);
      }
    });

    it("throws monthly BudgetExceededError when monthly limit exceeded", () => {
      // Large daily limit but small monthly limit
      const t = new BudgetTracker(100.0, 0.001, 80, dbPath + ".monthly");
      expect(() =>
        t.checkAndRecord({
          model: "test",
          inputTokens: 1000,
          outputTokens: 500,
          costEur: 0.01,
          routingTier: "cloud",
        }),
      ).toThrow(BudgetExceededError);
      t.close();
    });

    it("zero-cost local queries are always allowed", () => {
      // Fill up to just under limit
      for (let i = 0; i < 5; i++) {
        tracker.checkAndRecord({
          model: "test",
          inputTokens: 10,
          outputTokens: 5,
          costEur: 0.0, // local — zero cost
          routingTier: "local",
        });
      }
      const summary = tracker.getSpendSummary();
      expect(summary.todayEur).toBe(0);
    });
  });

  describe("record()", () => {
    it("records without checking limits", () => {
      tracker.record({
        model: "ollama",
        inputTokens: 100,
        outputTokens: 50,
        costEur: 0.0,
        routingTier: "local",
      });
      const summary = tracker.getSpendSummary();
      expect(summary.queryCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe("getSpendSummary()", () => {
    it("returns zero totals for empty DB", () => {
      const summary = tracker.getSpendSummary();
      expect(summary.todayEur).toBe(0);
      expect(summary.monthEur).toBe(0);
      expect(summary.totalEur).toBe(0);
      expect(summary.queryCount).toBe(0);
    });

    it("accumulates totals correctly", () => {
      tracker.record({
        model: "a",
        inputTokens: 0,
        outputTokens: 0,
        costEur: 0.1,
        routingTier: "cloud",
      });
      tracker.record({
        model: "b",
        inputTokens: 0,
        outputTokens: 0,
        costEur: 0.2,
        routingTier: "cloud",
      });
      const summary = tracker.getSpendSummary();
      expect(summary.totalEur).toBeCloseTo(0.3, 5);
      expect(summary.queryCount).toBe(2);
    });
  });
});
