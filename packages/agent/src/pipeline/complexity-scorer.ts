// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaFlow™ — lokaflow.io
//
// packages/agent/src/pipeline/complexity-scorer.ts
// Stage 2 — ComplexityScorer: 6-dimension heuristic + optional qwen2.5:7b second pass.

import type { ComplexityScore, ComplexityDimensions, IntentProfile } from "../types/agent.js";
import { OllamaClient } from "../utils/ollama.js";
import { DECOMPOSER_MODEL } from "../registry/interim-models.js";
import {
  COMPLEXITY_SCORING_SYSTEM_PROMPT,
  buildComplexityScoringPrompt,
} from "../decomposer/prompts/complexity-scoring.js";
import { estimateTokens } from "../utils/tokens.js";

// ---------------------------------------------------------------------------
// Heuristic scorer (Pass 1 — zero model call, <5ms)
// ---------------------------------------------------------------------------

function countMatches(text: string, patterns: RegExp[]): number {
  return patterns.filter((p) => p.test(text)).length;
}

const REASONING_SIGNALS = [
  /\b(because|therefore|thus|hence|consequently)\b/i,
  /\b(why|explain|reason|justify)\b/i,
  /\b(compare|contrast|vs\.?|trade.?off|pros?\s+and\s+cons?)\b/i,
  /\b(analyse|analyze|evaluate|assess|critique)\b/i,
];

const PRECISION_SIGNALS = [
  /\b(exact|exactly|precise|precisely|must|required|critical|strict)\b/i,
  /\b(no\s+more\s+than|at\s+most|at\s+least|minimum|maximum)\b/i,
];

const DOMAIN_SIGNALS = [
  /\b(dora|gdpr|sox|hipaa|pci.?dss|iso\s*27001|nist|cis)\b/i,
  /\b(financial|compliance|regulatory|legal|medical|clinical)\b/i,
  /\b(machine\s+learning|neural\s+network|llm|embedding|fine.?tun)\b/i,
];

const CREATIVITY_SIGNALS = [
  /\b(creative|novel|innovative|original|brainstorm)\b/i,
  /\b(imagine|invent|design|propose|suggest)\b/i,
];

function heuristicScore(
  prompt: string,
  intent: IntentProfile,
): ComplexityDimensions & { confidence: number } {
  const tokens = estimateTokens(prompt);

  const reasoning = Math.min(countMatches(prompt, REASONING_SIGNALS) * 0.25, 1.0);
  const domain = Math.min(
    countMatches(prompt, DOMAIN_SIGNALS) * 0.3 + intent.domainHints.length * 0.2,
    1.0,
  );
  const creativity = Math.min(countMatches(prompt, CREATIVITY_SIGNALS) * 0.25, 1.0);
  const context = Math.min(tokens / 3000, 1.0); // saturates at 3000 tokens
  const precision = Math.min(countMatches(prompt, PRECISION_SIGNALS) * 0.3, 1.0);
  const interdependence = 0; // unknown until after decomposition

  // Confidence: higher when signals are clear
  const signalStrength = reasoning + domain + creativity + precision;
  const confidence = Math.min(0.5 + signalStrength * 0.12, 0.95);

  return { reasoning, domain, creativity, context, precision, interdependence, confidence };
}

function dimensionsToIndex(d: ComplexityDimensions): number {
  // Weighted average across 5 active dimensions (interdependence excluded)
  return (
    d.reasoning * 0.35 + d.domain * 0.3 + d.creativity * 0.15 + d.context * 0.1 + d.precision * 0.1
  );
}

// ---------------------------------------------------------------------------
// ComplexityScorer
// ---------------------------------------------------------------------------

export class ComplexityScorer {
  private readonly ollama: OllamaClient;

  constructor(
    private readonly config = {
      scorerModel: DECOMPOSER_MODEL,
      heuristicOnlyMode: false,
      heuristicConfidenceThreshold: 0.8,
      ollamaBaseUrl: "http://localhost:11434",
    },
  ) {
    this.ollama = new OllamaClient(this.config.ollamaBaseUrl);
  }

  async score(prompt: string, intent: IntentProfile): Promise<ComplexityScore> {
    // Pass 1: Heuristic (always)
    const heuristic = heuristicScore(prompt, intent);

    if (
      this.config.heuristicOnlyMode ||
      heuristic.confidence >= this.config.heuristicConfidenceThreshold
    ) {
      const index = dimensionsToIndex(heuristic);
      return {
        index,
        dimensions: heuristic,
        confidence: heuristic.confidence,
      };
    }

    // Pass 2: Model call (only when heuristic confidence < threshold)
    try {
      const result = await this.ollama.complete({
        model: this.config.scorerModel,
        messages: [
          { role: "system", content: COMPLEXITY_SCORING_SYSTEM_PROMPT },
          {
            role: "user",
            content: buildComplexityScoringPrompt(
              prompt.slice(0, 500), // keep call lean
              intent.primaryGoal,
            ),
          },
        ],
        temperature: 0.1,
        timeoutMs: 15_000,
      });

      const jsonStr = result.content
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      const parsed = JSON.parse(jsonStr) as Record<string, number>;

      const modelDimensions: ComplexityDimensions = {
        reasoning: Number(parsed["reasoning"] ?? heuristic.reasoning),
        domain: Number(parsed["domain"] ?? heuristic.domain),
        creativity: Number(parsed["creativity"] ?? heuristic.creativity),
        context: Number(parsed["context"] ?? heuristic.context),
        precision: Number(parsed["precision"] ?? heuristic.precision),
        interdependence: 0,
      };

      const confidence = Number(parsed["confidence"] ?? 0.8);
      const index = dimensionsToIndex(modelDimensions);
      return { index, dimensions: modelDimensions, confidence };
    } catch {
      // Fall back to heuristic on model failure
      return {
        index: dimensionsToIndex(heuristic),
        dimensions: heuristic,
        confidence: heuristic.confidence * 0.8, // lower confidence
      };
    }
  }
}
