// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaRoute™ — lokaflow.io
//
// packages/route/src/classifier/rules.ts
// Fast regex-based pre-filter that runs BEFORE ML scoring.
// Rules represent explicit domain knowledge — they override statistical inference.
// Must resolve in well under 1ms (no async, no DB, no network).

import type { QueryClassification } from "../types/classification.js";
import type { RoutingTier } from "../types/routing.js";

interface Rule {
  pattern: RegExp;
  tier: RoutingTier;
  reason: string;
}

// ── Force-Local rules ─────────────────────────────────────────────────────────
// These queries are always trivially simple regardless of length.
const FORCE_LOCAL_TRIVIAL: Rule[] = [
  {
    pattern: /^(what is|what's|whats|define|who is|when was|where is|spell)\b/i,
    tier: "local-trivial",
    reason: "factual lookup",
  },
  {
    pattern: /^(hi|hello|hey|thanks|thank you|good morning|good night)\b/i,
    tier: "local-trivial",
    reason: "greeting or social phrase",
  },
  {
    pattern: /^(yes|no|maybe|ok|okay|sure|no problem)\b/i,
    tier: "local-trivial",
    reason: "one-word confirmation",
  },
  {
    pattern: /^(fix|correct|rewrite|clean up|improve grammar).{0,60}(sentence|paragraph|email|message|line)\b/i,
    tier: "local-trivial",
    reason: "simple text edit",
  },
  {
    pattern: /^translate\s+.{1,120}\s+(to|into)\s+\w+/i,
    tier: "local-trivial",
    reason: "translation task",
  },
  {
    pattern: /^(list|name)\s+(the\s+)?\d+\s+\w+/i,
    tier: "local-trivial",
    reason: "enumeration request",
  },
  {
    pattern: /^(summarise|summarize|tldr|tl;dr|brief summary)\b/i,
    tier: "local-capable",
    reason: "summarisation task",
  },
  {
    pattern: /^convert\s+.{1,60}\s+(to|into|from)\s+/i,
    tier: "local-trivial",
    reason: "data conversion",
  },
  {
    pattern: /^\d+[\s*×x+\-/^]\s*\d+/i,
    tier: "local-trivial",
    reason: "arithmetic expression",
  },
];

// ── Force-Cloud rules ─────────────────────────────────────────────────────────
// These queries require frontier capabilities regardless of phrasing.
const FORCE_CLOUD_FRONTIER: Rule[] = [
  {
    pattern: /(DORA|SOX|Sarbanes.Oxley|MiFID|Basel\s+III|NIS2|OFAC|FATF).{0,150}(compliance|gap|assessment|review|audit|control|article|framework)/i,
    tier: "cloud-frontier",
    reason: "regulatory compliance analysis",
  },
  {
    pattern: /(penetration\s+test|pentest|threat\s+model|security\s+architecture\s+review|zero[\s-]day)/i,
    tier: "cloud-frontier",
    reason: "security domain expertise required",
  },
  {
    pattern: /(draft|write|review).{0,60}(contract|agreement|NDA|SLA|EULA|terms\s+of\s+service|merger|acquisition)/i,
    tier: "cloud-frontier",
    reason: "legal document drafting",
  },
  {
    pattern: /(medical|clinical|diagnostic|treatment\s+plan|drug\s+interaction|differential\s+diagnosis).{0,150}(advice|recommend|review|analyse|analyze|remediat|vulnerabilit|CVE|plan|assess|consult)/i,
    tier: "cloud-frontier",
    reason: "medical domain",
  },
  {
    pattern: /\b(quantum\s+computing|quantum\s+circuit|quantum\s+annealing|photonic\s+computing|qubit|quantum\s+advantage|quantum\s+approach)/i,
    tier: "cloud-frontier",
    reason: "quantum computing domain",
  },
];

const FORCE_CLOUD_CAPABLE: Rule[] = [
  {
    pattern: /(audit|security\s+review|risk\s+assessment).{0,100}(financial|system|codebase|infrastructure)/i,
    tier: "cloud-capable",
    reason: "auditing domain",
  },
  {
    pattern: /(architect|design).{0,100}(system|microservice|database\s+schema|API|platform|infrastructure)/i,
    tier: "cloud-capable",
    reason: "system design task",
  },
  {
    pattern: /\b(analyse|analyze)\s+.{0,80}(30|40|50|60|70|80|90|100)[\s-]page/i,
    tier: "cloud-capable",
    reason: "long document analysis",
  },
  {
    pattern: /\b(summarise|summarize)\b.{0,150}\b(\d+[\s-]page|legal\s+contract|legal\s+document|compliance\s+report|annual\s+report|key\s+obligations)/i,
    tier: "cloud-capable",
    reason: "long legal/compliance document summarisation",
  },
];

// ── Force-Local-Capable rules ─────────────────────────────────────────────────
const FORCE_LOCAL_CAPABLE: Rule[] = [
  {
    pattern: /\b(write|implement|create|build|generate)\b.{0,120}\b(function|method|class|tests?|unit\s+tests?|algorithm|script|module|component|interface)\b/i,
    tier: "local-capable",
    reason: "programming task",
  },
  {
    pattern: /\b(explain|describe|compare)\b.{0,100}\b(difference|TCP|UDP|HTTP|SQL|algorithm|protocol|pattern|REST|async|thread|stack|heap|SOLID|DRY|CAP\s+theorem)\b/i,
    tier: "local-capable",
    reason: "technical concept explanation",
  },
];

/** Single compiled rule bank. */
const ALL_RULES: Array<{ rules: Rule[] }> = [
  { rules: FORCE_CLOUD_FRONTIER },  // highest priority — check first
  { rules: FORCE_CLOUD_CAPABLE },
  { rules: FORCE_LOCAL_CAPABLE },
  { rules: FORCE_LOCAL_TRIVIAL },
];

export class RuleEngine {
  /**
   * Returns a QueryClassification if a deterministic rule matches, or null
   * if no rule matches (fall through to ML scoring).
   *
   * Rules take ~0ms — regex only, no heap allocations beyond match result.
   */
  match(query: string): QueryClassification | null {
    const trimmed = query.trim();

    for (const { rules } of ALL_RULES) {
      for (const rule of rules) {
        if (rule.pattern.test(trimmed)) {
          return {
            tier: rule.tier,
            score: tierToMidScore(rule.tier),
            features: EMPTY_FEATURES,
            reason: `rule match: ${rule.reason}`,
            ruleMatch: rule.reason,
          };
        }
      }
    }
    return null;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function tierToMidScore(tier: RoutingTier): number {
  switch (tier) {
    case "local-trivial": return 0.17;
    case "local-capable": return 0.45;
    case "cloud-mid":     return 0.62;
    case "cloud-capable": return 0.77;
    case "cloud-frontier": return 0.92;
  }
}

const EMPTY_FEATURES = {
  tokenCount: 0, attachmentCount: 0, questionDepth: 0, technicalTermDensity: 0,
  multiPartDetected: false, imperativeComplexity: 0, regulatoryKeywords: false,
  codeDetected: false, mathDetected: false, priorTurns: 0, systemPromptComplexity: 0,
  outputFormatRequested: false, lengthRequested: false, historicalComplexityBaseline: 0.5,
};
