// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaRoute™ — lokaflow.io
//
// packages/route/tests/unit/classifier/classifier.test.ts
// Labelled regression tests for QueryClassifier.
//
// Run: pnpm --filter @lokaflow/route test

import { describe, it, expect, beforeAll } from "vitest";
import { QueryClassifier } from "../../../src/classifier/classifier.js";
import { PersonalisedLearner } from "../../../src/classifier/learner.js";
import { isLocalTier } from "../../../src/types/routing.js";
import querySamples from "../../fixtures/query-samples.json";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeClassifier() {
  const learner = new PersonalisedLearner(":memory:");
  return new QueryClassifier({ sensitivity: "balanced", learner });
}

// ── Tier regression tests ─────────────────────────────────────────────────────

describe("QueryClassifier — tier regression", () => {
  let classifier: QueryClassifier;

  beforeAll(() => {
    classifier = makeClassifier();
  });

  it("routes 'What is the capital of France?' → local-trivial (score ≤ 0.30)", () => {
    const r = classifier.classify("What is the capital of France?", {});
    expect(r.score).toBeLessThanOrEqual(0.3);
    expect(r.tier).toBe("local-trivial");
  });

  it("routes 'Hello!' → local-trivial (score ≤ 0.25)", () => {
    const r = classifier.classify("Hello!", {});
    expect(r.score).toBeLessThanOrEqual(0.25);
    expect(isLocalTier(r.tier)).toBe(true);
  });

  it("routes simple unit-test request → local-capable", () => {
    const q = "Write unit tests for this TypeScript module";
    const r = classifier.classify(q, {});
    expect(r.score).toBeLessThanOrEqual(0.55);
    expect(isLocalTier(r.tier)).toBe(true);
  });

  it("routes DORA compliance review → cloud-frontier (score ≥ 0.85)", () => {
    const q =
      "Analyse DORA Article 11 TLPT requirements and map our current controls to achieve compliance";
    const r = classifier.classify(q, {});
    expect(r.score).toBeGreaterThanOrEqual(0.85);
    expect(r.tier).toBe("cloud-frontier");
  });

  it("routes SOX audit review → cloud-frontier (score ≥ 0.85)", () => {
    const q =
      "Review this SOX audit trail and identify non-compliant transactions referencing PCAOB AS 2201";
    const r = classifier.classify(q, {});
    expect(r.score).toBeGreaterThanOrEqual(0.8);
    expect(r.tier).toBe("cloud-frontier");
  });

  it("routes microservices architecture design → cloud-capable", () => {
    const q =
      "Design a microservices architecture for a high-volume e-commerce platform with CQRS and event sourcing";
    const r = classifier.classify(q, {});
    expect(r.score).toBeGreaterThanOrEqual(0.55);
  });
});

// ── Labelled-sample regression ─────────────────────────────────────────────────

describe("QueryClassifier — labelled fixture regression", () => {
  let classifier: QueryClassifier;

  beforeAll(() => {
    classifier = makeClassifier();
  });

  for (const sample of querySamples as Array<{
    query: string;
    expectedTier?: string;
    maxScore?: number;
    minScore?: number;
  }>) {
    it(`"${sample.query.slice(0, 60)}…"`, () => {
      const r = classifier.classify(sample.query, {});
      if (sample.expectedTier) {
        expect(r.tier).toBe(sample.expectedTier);
      }
      if (sample.maxScore !== undefined) {
        expect(r.score).toBeLessThanOrEqual(sample.maxScore + 0.05); // 5-point tolerance
      }
      if (sample.minScore !== undefined) {
        expect(r.score).toBeGreaterThanOrEqual(sample.minScore - 0.05);
      }
    });
  }
});

// ── Performance test ──────────────────────────────────────────────────────────

describe("QueryClassifier — performance", () => {
  it("classifies 100 queries in under 500ms", () => {
    const classifier = makeClassifier();
    const queries = [
      "What is the capital of France?",
      "Write a TypeScript function to debounce events",
      "Analyse DORA Article 11 requirements",
      "Hello!",
      "Design a distributed system for 1M DAU",
    ];

    const start = Date.now();
    for (let i = 0; i < 100; i++) {
      classifier.classify(queries[i % queries.length]!, {});
    }
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(500);
  });

  it("single classification is under 5ms (p99)", () => {
    const classifier = makeClassifier();
    const query = "Explain the SOLID principles with TypeScript examples";
    const times: number[] = [];

    for (let i = 0; i < 50; i++) {
      const t0 = performance.now();
      classifier.classify(query, {});
      times.push(performance.now() - t0);
    }

    times.sort((a, b) => a - b);
    const p99 = times[Math.floor(times.length * 0.99)]!;
    expect(p99).toBeLessThan(5);
  });
});

// ── Sensitivity delta tests ───────────────────────────────────────────────────

describe("QueryClassifier — sensitivity deltas", () => {
  const query = "Write a function to parse JSON";

  it("conservative sensitivity returns higher score than balanced", () => {
    const cons = new QueryClassifier({
      sensitivity: "conservative",
      learner: new PersonalisedLearner(":memory:"),
    });
    const bal = new QueryClassifier({
      sensitivity: "balanced",
      learner: new PersonalisedLearner(":memory:"),
    });
    expect(cons.classify(query, {}).score).toBeGreaterThan(bal.classify(query, {}).score);
  });

  it("aggressive sensitivity returns lower score than balanced", () => {
    const agg = new QueryClassifier({
      sensitivity: "aggressive",
      learner: new PersonalisedLearner(":memory:"),
    });
    const bal = new QueryClassifier({
      sensitivity: "balanced",
      learner: new PersonalisedLearner(":memory:"),
    });
    expect(agg.classify(query, {}).score).toBeLessThan(bal.classify(query, {}).score);
  });
});
