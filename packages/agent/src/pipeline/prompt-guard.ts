// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaFlow™ — lokaflow.io
//
// packages/agent/src/pipeline/prompt-guard.ts
// Stage 1 — PromptGuard: safety, PII, ambiguity, intent extraction.
// Zero model calls. Deterministic rules + lightweight heuristics.

import type { GuardResult, IntentProfile, OutputType, QualityPreference } from "../types/agent.js";

// ---------------------------------------------------------------------------
// PII patterns — validated to reduce false positives
// (mirrors @lokaflow/core PIIScanner logic; re-declared for zero extra dep)
// ---------------------------------------------------------------------------

/** Elfproef (Dutch 11-check) for BSN — avoids flagging arbitrary 9-digit numbers. */
function isValidBsn(digits: string): boolean {
  if (digits.length !== 9) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const d = Number(digits[i]);
    sum += (i < 8 ? 9 - i : -1) * d;
  }
  return sum % 11 === 0;
}

/** Luhn algorithm — avoids false-positive credit-card matches. */
function isValidLuhn(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

const PII_PATTERNS: RegExp[] = [
  /\bNL\d{2}[A-Z]{4}\d{10}\b/, // Dutch IBAN
  /\b[A-Z]{2}\d{2}[A-Z0-9]{4,30}\b/i, // generic IBAN
  /\b[\w.+%-]+@[\w-]+\.[a-z]{2,}\b/i, // email
  /(\+31|0031|0)[0-9()\s\-.]{8,14}|\+[1-9]\d{7,14}/, // NL/international phone
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/, // IP address
];

/** Returns true if text contains validated PII (Elfproef BSN or Luhn credit card). */
function containsValidatedPii(prompt: string): boolean {
  // Fast path: check simple patterns first
  if (PII_PATTERNS.some((p) => p.test(prompt))) return true;

  // BSN: 9 consecutive digits validated with Elfproef
  const bsnMatches = prompt.match(/\b\d{9}\b/g) ?? [];
  if (bsnMatches.some((m) => isValidBsn(m))) return true;

  // Credit cards: 13–16 digit sequences validated with Luhn
  const ccMatches = prompt.match(/\b(?:\d[ -]?){13,16}\b/g) ?? [];
  if (
    ccMatches
      .map((m) => m.replace(/[ -]/g, ""))
      .some((m) => m.length >= 13 && m.length <= 16 && isValidLuhn(m))
  )
    return true;

  return false;
}

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
    const piiDetected = containsValidatedPii(prompt);

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
