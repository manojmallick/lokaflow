"use strict";
// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
//
// packages/orchestrator/src/complexity/measurer.ts
// ComplexityMeasurer — Replaces the basic V1 classifier.
// Scores tasks across 6 dimensions to select the optimal tier.
Object.defineProperty(exports, "__esModule", { value: true });
exports.ComplexityMeasurer = void 0;
var ComplexityMeasurer = /** @class */ (function () {
    function ComplexityMeasurer(heuristics) {
        if (heuristics === void 0) { heuristics = {
            reasoning: 0.25,
            math: 0.15,
            coding: 0.25,
            creativity: 0.10,
            precision: 0.15,
            contextLength: 0.10,
        }; }
        this.heuristics = heuristics;
    }
    ComplexityMeasurer.prototype.measure = function (messages) {
        var text = messages.map(function (m) { return m.content; }).join("\n");
        // Simplistic heuristic scoring for now (would be replaced by LokaLLM in V2.7)
        var dimensions = {
            reasoning: this._scoreReasoning(text),
            math: this._scoreMath(text),
            coding: this._scoreCoding(text),
            creativity: this._scoreCreativity(text),
            precision: this._scorePrecision(text),
            contextLength: Math.min(1.0, text.length / 8000),
        };
        var overallScore = (dimensions.reasoning * this.heuristics.reasoning) +
            (dimensions.math * this.heuristics.math) +
            (dimensions.coding * this.heuristics.coding) +
            (dimensions.creativity * this.heuristics.creativity) +
            (dimensions.precision * this.heuristics.precision) +
            (dimensions.contextLength * this.heuristics.contextLength);
        return {
            overallScore: Number(overallScore.toFixed(3)),
            dimensions: dimensions,
            recommendedTier: this._mapToTier(overallScore, dimensions),
        };
    };
    ComplexityMeasurer.prototype._scoreReasoning = function (text) {
        var keywords = ["why", "compare", "evaluate", "justify", "analyze", "trade-off", "architect"];
        return this._keywordScore(text, keywords, 0.2);
    };
    ComplexityMeasurer.prototype._scoreMath = function (text) {
        var keywords = ["calculate", "equation", "solve", "math", "derive", "integral", "probability"];
        var hasNumbers = /\b\d+\b/.test(text) ? 0.3 : 0;
        return Math.min(1.0, this._keywordScore(text, keywords, 0.2) + hasNumbers);
    };
    ComplexityMeasurer.prototype._scoreCoding = function (text) {
        var keywords = ["python", "typescript", "implement", "refactor", "bug", "code", "function", "class"];
        var hasCodeBlocks = /```[\s\S]*?```/.test(text) ? 0.4 : 0;
        return Math.min(1.0, this._keywordScore(text, keywords, 0.1) + hasCodeBlocks);
    };
    ComplexityMeasurer.prototype._scoreCreativity = function (text) {
        var keywords = ["write", "imagine", "story", "poem", "generate", "brainstorm", "creative"];
        return this._keywordScore(text, keywords, 0.2);
    };
    ComplexityMeasurer.prototype._scorePrecision = function (text) {
        var keywords = ["exact", "quote", "cite", "reference", "specifically", "strict", "verify"];
        return this._keywordScore(text, keywords, 0.25);
    };
    ComplexityMeasurer.prototype._keywordScore = function (text, keywords, weightPerKeyword) {
        var lower = text.toLowerCase();
        var matches = 0;
        for (var _i = 0, keywords_1 = keywords; _i < keywords_1.length; _i++) {
            var kw = keywords_1[_i];
            if (lower.includes(kw))
                matches++;
        }
        return Math.min(1.0, matches * weightPerKeyword);
    };
    ComplexityMeasurer.prototype._mapToTier = function (score, dim) {
        // If precision or math is very high, push to higher tiers even if overall is low
        if (dim.math > 0.8 || dim.precision > 0.9)
            return "cloud_standard";
        if (score < 0.20)
            return "local_nano";
        if (score < 0.45)
            return "local_standard";
        if (score < 0.55)
            return "local_large"; // Assumes 72B class model exists locally
        if (score < 0.70)
            return "cloud_light"; // Haiku / Flash
        if (score < 0.85)
            return "cloud_standard"; // Sonnet / GPT-4o
        return "cloud_premium"; // Opus / o1
    };
    return ComplexityMeasurer;
}());
exports.ComplexityMeasurer = ComplexityMeasurer;
