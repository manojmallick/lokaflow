// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.

import { describe, it, expect } from "vitest";
import { TaskClassifier, scoreTier } from "../../src/router/classifier.js";

const classifier = new TaskClassifier();

describe("TaskClassifier", () => {
  describe("score() — tier bands", () => {
    it("trivial math → score < 0.35 (local)", () => {
      expect(classifier.score("What is 15% of 340?")).toBeLessThan(0.35);
    });

    it("simple translation → score < 0.35 (local)", () => {
      expect(classifier.score("Translate 'hello world' to French")).toBeLessThan(0.35);
    });

    it("list request → score < 0.35 (local)", () => {
      expect(classifier.score("List 5 fruits")).toBeLessThan(0.35);
    });

    it("git commit message → score < 0.35 (local)", () => {
      expect(classifier.score("Write a git commit message for fixing a null pointer")).toBeLessThan(
        0.35,
      );
    });

    it("stack trace explanation → score ≥ 0.35 (specialist or cloud)", () => {
      const score = classifier.score(
        "Explain this stack trace and suggest a fix:\n" +
          "TypeError: Cannot read properties of undefined\n" +
          "  at processRequest (/app/src/handler.ts:42)\n" +
          "  at async main (/app/src/index.ts:10)",
      );
      expect(score).toBeGreaterThanOrEqual(0.35);
    });

    it("architecture analysis → score > 0.65 (cloud)", () => {
      const score = classifier.score(
        "Compare these five architecture patterns and evaluate their trade-offs for a distributed " +
          "system. Analyse scalability, fault tolerance, and operational complexity. " +
          "Why would you choose event sourcing versus CQRS versus a traditional layered approach? " +
          "Consider the implications for a team of 20 engineers.",
      );
      expect(score).toBeGreaterThan(0.65);
    });

    it("research synthesis → score > 0.65 (cloud)", () => {
      const score = classifier.score(
        "Analyse the trade-offs between RAG and fine-tuning approaches for domain-specific LLMs. " +
          "Compare cost, accuracy, latency, and maintenance burden. " +
          "Recommend the best approach for a healthcare use case with strict privacy requirements.",
      );
      expect(score).toBeGreaterThan(0.65);
    });
  });

  describe("classify() — signals", () => {
    it("returns an object with score, tier, and signals", () => {
      const result = classifier.classify("What is 2 + 2?");
      expect(result).toHaveProperty("score");
      expect(result).toHaveProperty("tier");
      expect(result).toHaveProperty("signals");
      expect(typeof result.score).toBe("number");
    });

    it("score is always in [0, 1]", () => {
      const queries = [
        "",
        "a",
        "x ".repeat(10000),
        "Why because therefore compare analyse evaluate trade-off vs how",
      ];
      for (const q of queries) {
        const { score } = classifier.classify(q);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }
    });

    it("technical content (code block) raises score", () => {
      const plain = classifier.score("Fix the bug");
      const withCode = classifier.score(
        "Fix the bug\n```typescript\nconst x: string = 42;\n```\nError: Type 'number' is not assignable",
      );
      expect(withCode).toBeGreaterThan(plain);
    });
  });

  describe("scoreTier()", () => {
    it("score 0.1 → local", () => expect(scoreTier(0.1)).toBe("local"));
    it("score 0.34 → local", () => expect(scoreTier(0.34)).toBe("local"));
    it("score 0.35 → specialist", () => expect(scoreTier(0.35)).toBe("specialist"));
    it("score 0.5 → specialist", () => expect(scoreTier(0.5)).toBe("specialist"));
    it("score 0.64 → specialist", () => expect(scoreTier(0.64)).toBe("specialist"));
    it("score 0.65 → cloud", () => expect(scoreTier(0.65)).toBe("cloud"));
    it("score 1.0 → cloud", () => expect(scoreTier(1.0)).toBe("cloud"));
  });
});
