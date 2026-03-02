// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaRoute™ — lokaflow.io
//
// packages/route/src/classifier/features.ts
// FeatureExtractor — extracts 14 scoring signals from a query + context.
// All methods are pure/synchronous. No DB, no network.

import type { ClassifierFeatures, QueryContext } from "../types/classification.js";

// ── Signal weight configuration ──────────────────────────────────────────────
// Weights must sum to 1.0.
export const SIGNAL_WEIGHTS: Record<
  keyof Omit<ClassifierFeatures, "historicalComplexityBaseline">,
  number
> = {
  tokenCount: 0.1,
  attachmentCount: 0.05,
  questionDepth: 0.18,
  technicalTermDensity: 0.12,
  multiPartDetected: 0.08,
  imperativeComplexity: 0.15,
  regulatoryKeywords: 0.1,
  codeDetected: 0.05,
  mathDetected: 0.03,
  priorTurns: 0.04,
  systemPromptComplexity: 0.04,
  outputFormatRequested: 0.04,
  lengthRequested: 0.02,
};

// Historical baseline contributes 0% to the raw score — learner applies an
// additive delta outside of FeatureExtractor.

export class FeatureExtractor {
  extract(query: string, ctx: QueryContext = {}): ClassifierFeatures {
    return {
      tokenCount: this.scoreTokenCount(query),
      attachmentCount: this.scoreAttachments(ctx),
      questionDepth: this.scoreQuestionDepth(query),
      technicalTermDensity: this.scoreTechnicalDensity(query),
      multiPartDetected: this.detectMultiPart(query),
      imperativeComplexity: this.scoreImperative(query),
      regulatoryKeywords: this.detectRegulatory(query),
      codeDetected: this.detectCode(query),
      mathDetected: this.detectMath(query),
      priorTurns: this.scorePriorTurns(ctx),
      systemPromptComplexity: this.scoreSystemPrompt(ctx),
      outputFormatRequested: this.detectOutputFormat(query),
      lengthRequested: this.detectLengthRequest(query),
      historicalComplexityBaseline: ctx.userBaseline ?? 0.5,
    };
  }

  // ── Individual signal extractors ──────────────────────────────────────────

  /** 0–1: normalised log of token count (sat at 8 000 tokens → 1.0). */
  private scoreTokenCount(query: string): number {
    const tokens = query.split(/\s+/).length / 0.75;
    // log scale: 50 tokens → 0.2, 500 → 0.55, 2000 → 0.80, 8000 → 1.0
    return Math.min(Math.log10(Math.max(tokens, 1)) / Math.log10(8000), 1);
  }

  /** 0–1: each attachment adds 0.2 (saturates at 5). */
  private scoreAttachments(ctx: QueryContext): number {
    return Math.min((ctx.attachments?.length ?? 0) * 0.2, 1);
  }

  /**
   * 0–1: question depth signal.
   * "what/who/when/where" → 0.1
   * "how" → 0.3
   * "why/explain/describe" → 0.5
   * "analyse/compare/evaluate/argue" → 0.8
   * "design/architect/justify/recommend" → 1.0
   */
  private scoreQuestionDepth(query: string): number {
    const q = query.toLowerCase();
    if (
      /\b(design|architect|recommend|justify|strategis[e|z]|strategiz|propose|formulate|devise)\b/.test(
        q,
      )
    )
      return 1.0;
    if (/\b(analyse|analyze|evaluate|compare|contrast|assess|critique|argue|debate)\b/.test(q))
      return 0.8;
    if (/\b(explain|describe|discuss|elaborate|why|because|reason)\b/.test(q)) return 0.5;
    if (/\bhow\b/.test(q)) return 0.3;
    if (/\b(what|who|when|where|which|name|list)\b/.test(q)) return 0.1;
    return 0.2;
  }

  /** 0–1: density of technical vocabulary. */
  private scoreTechnicalDensity(query: string): number {
    const words = query.split(/\s+/);
    const techPatterns = [
      /```/, // code block
      /\berror\b|\bexception\b|\bstack trace\b/i,
      /\.[a-z]{2,5}\b/, // file extensions
      /https?:\/\//, // URL
      /\b(API|HTTP|REST|gRPC|JSON|XML|SQL|NoSQL|TCP|UDP|TLS|SSE|OAuth)\b/i,
      /\b(function|class|interface|import|export|async|await|Promise)\b/,
      /\b(Docker|Kubernetes|k8s|CI\/CD|pipeline|terraform|AWS|GCP|Azure)\b/i,
      /[a-zA-Z_][a-zA-Z0-9_]*\(.*\)/, // function call syntax
      /=>/, // arrow function
      /\b(null|undefined|boolean|integer|string|array|object)\b/i,
    ];
    const score = techPatterns.reduce((n, p) => n + (p.test(query) ? 0.1 : 0), 0);
    // Density: also factor in acronym density among total words
    const acronyms = words.filter((w) => /^[A-Z]{2,}$/.test(w)).length;
    return Math.min(score + (acronyms / Math.max(words.length, 1)) * 0.5, 1);
  }

  /** True if the query contains multiple distinct sub-questions or tasks. */
  private detectMultiPart(query: string): boolean {
    const multiMarkers = [
      /\band\s+(also|then|additionally|furthermore)\b/i,
      /\d+\.\s+\w/, // numbered list
      /\b(first|second|third|finally|lastly)\b/i,
      /\?.*\?/, // two or more question marks
      /;\s+\w/, // semicolon as sentence divider
      /\b(as well as|in addition|on top of)\b/i,
    ];
    return multiMarkers.some((p) => p.test(query));
  }

  /**
   * 0–1: complexity of the imperative verb used.
   * "summarise/translate/list" → 0.1
   * "write/generate/create" → 0.35
   * "explain/describe" → 0.5
   * "review/critique/check" → 0.65
   * "design/architect/analyse/compare/evaluate" → 0.85
   * "justify/argue/propose/strategise" → 1.0
   */
  private scoreImperative(query: string): number {
    const q = query.toLowerCase();
    if (/\b(justify|argue|propose|strategis[e|z]|strategiz|formulate|devise|challenge)\b/.test(q))
      return 1.0;
    if (/\b(design|architect|evaluate|compare|contrast|assess|analyse|analyze)\b/.test(q))
      return 0.85;
    if (/\b(review|audit|critique|inspect|debug|refactor|optimise|optimize)\b/.test(q)) return 0.65;
    if (/\b(explain|describe|discuss|clarify|elaborate)\b/.test(q)) return 0.5;
    if (/\b(write|generate|create|build|implement|code)\b/.test(q)) return 0.35;
    if (/\b(summarise|summarize|list|name|translate|convert|format)\b/.test(q)) return 0.1;
    return 0.2;
  }

  /** True if recognised regulatory framework terms are present. */
  private detectRegulatory(query: string): boolean {
    return /\b(DORA|SOX|Sarbanes.Oxley|GDPR|MiFID|Basel\s+III|NIS2|OFAC|FATF|HIPAA|PCI.DSS|ISO\s*27001|FCA|FINRA|ESMA|BaFin|DNB)\b/i.test(
      query,
    );
  }

  /** True if the query contains code snippets or programming syntax. */
  private detectCode(query: string): boolean {
    return (
      /```/.test(query) ||
      /`[^`]+`/.test(query) ||
      /\b(function|class|import|export|const|let|var|def|return|async|await)\b/.test(query) ||
      /\/\/\s|#\s/.test(query) ||
      /[{};]\s/.test(query)
    );
  }

  /** True if mathematical content detected. */
  private detectMath(query: string): boolean {
    return (
      /[∑∫∂∇√π∞±≤≥≠≈∀∃⊂⊃∪∩]/.test(query) ||
      /\$\$.+\$\$/.test(query) ||
      /\\\(.*\\\)/.test(query) ||
      /\b(derivative|integral|matrix|eigenvalue|gradient|probability|theorem|proof|equation)\b/i.test(
        query,
      )
    );
  }

  /** 0–1: number of prior turns influences needed context (sat at 20 → 1.0). */
  private scorePriorTurns(ctx: QueryContext): number {
    return Math.min((ctx.conversationLength ?? 0) / 20, 1);
  }

  /** 0–1: rough complexity of the system prompt. */
  private scoreSystemPrompt(ctx: QueryContext): number {
    if (!ctx.systemPrompt) return 0;
    const words = ctx.systemPrompt.split(/\s+/).length;
    return Math.min(words / 400, 1); // 400-word system prompt → 1.0
  }

  /** True if structured output (JSON schema, table, report, CSV) requested. */
  private detectOutputFormat(query: string): boolean {
    return /\b(JSON|XML|CSV|table|report|schema|structured output|markdown table|bullet point[s]?|numbered list)\b/i.test(
      query,
    );
  }

  /** True if the user explicitly asks for a detailed / long response. */
  private detectLengthRequest(query: string): boolean {
    return /\b(detailed|comprehensive|exhaustive|full|complete|in[\s-]depth|thorough|extensive|long)\b/i.test(
      query,
    );
  }
}

/**
 * Compute composite score from features using SIGNAL_WEIGHTS.
 * Returns 0.0–1.0.
 */
export function computeCompositeScore(features: ClassifierFeatures): number {
  const boolToNum = (b: boolean): number => (b ? 1 : 0);

  const raw =
    features.tokenCount * SIGNAL_WEIGHTS.tokenCount +
    features.attachmentCount * SIGNAL_WEIGHTS.attachmentCount +
    features.questionDepth * SIGNAL_WEIGHTS.questionDepth +
    features.technicalTermDensity * SIGNAL_WEIGHTS.technicalTermDensity +
    boolToNum(features.multiPartDetected) * SIGNAL_WEIGHTS.multiPartDetected +
    features.imperativeComplexity * SIGNAL_WEIGHTS.imperativeComplexity +
    boolToNum(features.regulatoryKeywords) * SIGNAL_WEIGHTS.regulatoryKeywords +
    boolToNum(features.codeDetected) * SIGNAL_WEIGHTS.codeDetected +
    boolToNum(features.mathDetected) * SIGNAL_WEIGHTS.mathDetected +
    features.priorTurns * SIGNAL_WEIGHTS.priorTurns +
    features.systemPromptComplexity * SIGNAL_WEIGHTS.systemPromptComplexity +
    boolToNum(features.outputFormatRequested) * SIGNAL_WEIGHTS.outputFormatRequested +
    boolToNum(features.lengthRequested) * SIGNAL_WEIGHTS.lengthRequested;

  return Math.max(0, Math.min(raw, 1));
}
