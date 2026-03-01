// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
//
// packages/orchestrator/src/complexity/measurer.ts
// ComplexityMeasurer — Replaces the basic V1 classifier.
// Scores tasks across 6 dimensions to select the optimal tier.

import type { Message } from "../../../src/types.js";
import type { ComplexityProfile, TierLevel } from "../types.js";

export interface HeuristicWeight {
    reasoning: number;
    math: number;
    coding: number;
    creativity: number;
    precision: number;
    contextLength: number;
}

export class ComplexityMeasurer {
    constructor(private readonly heuristics: HeuristicWeight = {
        reasoning: 0.25,
        math: 0.15,
        coding: 0.25,
        creativity: 0.10,
        precision: 0.15,
        contextLength: 0.10,
    }) { }

    measure(messages: Message[]): ComplexityProfile {
        const text = messages.map(m => m.content).join("\n");

        // Simplistic heuristic scoring for now (would be replaced by LokaLLM in V2.7)
        const dimensions = {
            reasoning: this._scoreReasoning(text),
            math: this._scoreMath(text),
            coding: this._scoreCoding(text),
            creativity: this._scoreCreativity(text),
            precision: this._scorePrecision(text),
            contextLength: Math.min(1.0, text.length / 8000),
        };

        const overallScore =
            (dimensions.reasoning * this.heuristics.reasoning) +
            (dimensions.math * this.heuristics.math) +
            (dimensions.coding * this.heuristics.coding) +
            (dimensions.creativity * this.heuristics.creativity) +
            (dimensions.precision * this.heuristics.precision) +
            (dimensions.contextLength * this.heuristics.contextLength);

        return {
            overallScore: Number(overallScore.toFixed(3)),
            dimensions,
            recommendedTier: this._mapToTier(overallScore, dimensions),
        };
    }

    private _scoreReasoning(text: string): number {
        const keywords = ["why", "compare", "evaluate", "justify", "analyze", "trade-off", "architect"];
        return this._keywordScore(text, keywords, 0.2);
    }

    private _scoreMath(text: string): number {
        const keywords = ["calculate", "equation", "solve", "math", "derive", "integral", "probability"];
        const hasNumbers = /\b\d+\b/.test(text) ? 0.3 : 0;
        return Math.min(1.0, this._keywordScore(text, keywords, 0.2) + hasNumbers);
    }

    private _scoreCoding(text: string): number {
        const keywords = ["python", "typescript", "implement", "refactor", "bug", "code", "function", "class"];
        const hasCodeBlocks = /```[\s\S]*?```/.test(text) ? 0.4 : 0;
        return Math.min(1.0, this._keywordScore(text, keywords, 0.1) + hasCodeBlocks);
    }

    private _scoreCreativity(text: string): number {
        const keywords = ["write", "imagine", "story", "poem", "generate", "brainstorm", "creative"];
        return this._keywordScore(text, keywords, 0.2);
    }

    private _scorePrecision(text: string): number {
        const keywords = ["exact", "quote", "cite", "reference", "specifically", "strict", "verify"];
        return this._keywordScore(text, keywords, 0.25);
    }

    private _keywordScore(text: string, keywords: string[], weightPerKeyword: number): number {
        const lower = text.toLowerCase();
        let matches = 0;
        for (const kw of keywords) {
            if (lower.includes(kw)) matches++;
        }
        return Math.min(1.0, matches * weightPerKeyword);
    }

    private _mapToTier(score: number, dim: ComplexityProfile["dimensions"]): TierLevel {
        // If precision or math is very high, push to higher tiers even if overall is low
        if (dim.math > 0.8 || dim.precision > 0.9) return "cloud_standard";

        if (score < 0.20) return "local_nano";
        if (score < 0.45) return "local_standard";
        if (score < 0.55) return "local_large";     // Assumes 72B class model exists locally
        if (score < 0.70) return "cloud_light";     // Haiku / Flash
        if (score < 0.85) return "cloud_standard";  // Sonnet / GPT-4o
        return "cloud_premium";                     // Opus / o1
    }
}
