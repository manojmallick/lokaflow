// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaFlow™ — lokaflow.io
//
// packages/agent/src/pipeline/prompt-guard.ts
// Stage 1 — PromptGuard: safety, PII, ambiguity, intent extraction.
// Zero model calls. Deterministic rules + lightweight heuristics.

import type { GuardResult, IntentProfile, OutputType, QualityPreference } from "../types/agent.js";

// ---------------------------------------------------------------------------
// PII patterns (mirrors packages/commons/src — re-declared for zero dep)
// ---------------------------------------------------------------------------

const PII_PATTERNS: RegExp[] = [
  /\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?){0,16}\b/i, // IBAN
  /\b\d{9}\b/, // BSN (9 digits)
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, // email
  /\b(?:\+31|0)[0-9\s\-]{9,12}\b/, // NL phone
  /\b4[0-9]{12}(?:[0-9]{3})?\b/, // Visa
  /\b5[1-5][0-9]{14}\b/, // Mastercard
];

// ---------------------------------------------------------------------------
// Safety block-list — deterministic, no model required
// ---------------------------------------------------------------------------

const SAFETY_PATTERNS: RegExp[] = [
  /\b(bomb|explosive|weapon|poison|kill\s+yourself|suicide\s+method)\b/i,
  /\b(child\s+porn|csam|underage\s+sex)\b/i,
  /\b(hack|bypass|jailbreak)\s+(bank|government|military)\b/i,
];

// ---------------------------------------------------------------------------
// Ambiguity signals
// ---------------------------------------------------------------------------

const PRONOUN_REFERENTS = /\b(it|that|this|them|those|the thing|the file|the one)\b/i;
const CONFLICTING_CONSTRAINTS = /\bbut\s+(also|don't|avoid|not)\b/i;

function countWords(text: string): number {
  return text.trim().split(/\s+/).length;
}

// ---------------------------------------------------------------------------
// Intent extraction (heuristic — no model)
// ---------------------------------------------------------------------------

function extractIntent(prompt: string): IntentProfile {
  const lower = prompt.toLowerCase();

  let outputType: OutputType = "ANSWER";
  if (/\b(write|draft|generate|create)\b.*(report|document|essay|article)/.test(lower))
    outputType = "DOCUMENT";
  else if (/\b(code|script|function|implement|build)\b/.test(lower)) outputType = "CODE";
  else if (/\b(analyse|analyze|compare|evaluate|assess)\b/.test(lower)) outputType = "ANALYSIS";
  else if (/\b(list|enumerate|summarise|summarize)\b/.test(lower)) outputType = "LIST";
  else if (/\b(table|matrix)\b/.test(lower)) outputType = "TABLE";
  else if (/\b(summarise|summarize|tldr|tl;dr)\b/.test(lower)) outputType = "SUMMARY";

  let qualityReq: QualityPreference = "BALANCED";
  if (/\b(quick|fast|brief|short)\b/.test(lower)) qualityReq = "SPEED";
  if (/\b(thorough|detailed|comprehensive|accurate|exact|precise)\b/.test(lower))
    qualityReq = "QUALITY";

  const domainHints: string[] = [];
  if (/\b(dora|gdpr|sox|iso\s*27001|compliance|regulatory|regulation)\b/i.test(prompt))
    domainHints.push("regulatory");
  if (/\b(typescript|javascript|python|rust|java|go|sql)\b/i.test(prompt))
    domainHints.push("coding");
  if (/\b(finance|accounting|revenue|margin|arpu|mrr)\b/i.test(prompt)) domainHints.push("finance");

  const estimatedComplexity = estimatePreComplexity(prompt, domainHints);

  return {
    primaryGoal: prompt.slice(0, 120).replace(/\n/g, " "),
    outputType,
    requiredSections: [],
    domainHints,
    qualityRequirement: qualityReq,
    estimatedComplexity,
    preserveOriginalPrompt: prompt,
  };
}

function estimatePreComplexity(prompt: string, domainHints: string[]): number {
  let score = 0.2;
  const words = countWords(prompt);
  if (words > 50) score += 0.1;
  if (words > 150) score += 0.1;
  if (domainHints.length > 0) score += 0.1;
  const reasoningWords = /\b(why|because|compare|trade.?off|analyse|evaluate|explain)\b/i;
  if (reasoningWords.test(prompt)) score += 0.15;
  return Math.min(score, 1.0);
}

// ---------------------------------------------------------------------------
// PromptGuard
// ---------------------------------------------------------------------------

export class PromptGuard {
  check(prompt: string): GuardResult {
    // CHECK 1: Safety — block immediately, no model call
    for (const pattern of SAFETY_PATTERNS) {
      if (pattern.test(prompt)) {
        return {
          action: "BLOCK",
          reason: "Safety policy violation detected.",
        };
      }
    }

    // CHECK 2: PII scan — if PII found, force local-only
    const piiDetected = PII_PATTERNS.some((p) => p.test(prompt));

    // CHECK 3: Ambiguity — ask before spending compute
    const ambiguityScore = this.scoreAmbiguity(prompt);
    if (ambiguityScore >= 2) {
      return {
        action: "CLARIFY",
        question: this.buildClarificationQuestion(prompt),
      };
    }

    // CHECK 4: Intent extraction
    const intent = extractIntent(prompt);

    return {
      action: "PROCEED",
      cleanPrompt: this.sanitise(prompt),
      intent,
      localOnly: piiDetected,
      estimatedComplexity: intent.estimatedComplexity,
    };
  }

  private scoreAmbiguity(prompt: string): number {
    let score = 0;
    if (PRONOUN_REFERENTS.test(prompt) && countWords(prompt) < 30) score++;
    if (CONFLICTING_CONSTRAINTS.test(prompt)) score++;
    if (!prompt.includes("?") && countWords(prompt) < 6) score++;
    return score;
  }

  private buildClarificationQuestion(prompt: string): string {
    if (PRONOUN_REFERENTS.test(prompt)) {
      return "Could you clarify what you're referring to with 'it' / 'that' / 'this'? For example, which file, document, or system do you mean?";
    }
    return "Could you clarify what output format or outcome you expect? For example: a written report, a code file, or a numbered list?";
  }

  private sanitise(prompt: string): string {
    // Trim excessive whitespace; preserve content
    return prompt.replace(/\s{3,}/g, "\n\n").trim();
  }
}
