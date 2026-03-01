// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
//
// packages/orchestrator/src/types.ts
// Core types for LokaOrchestrator — the V2 DAG-based complex task engine.

import type { Message } from "../../src/types.js";

export type TierLevel =
    | "local_nano"     // 1–3B (TinyLlama)
    | "local_standard" // 7–8B (Mistral/Qwen)
    | "local_large"    // 30–70B (Qwen 72B)
    | "cloud_light"    // Haiku / Flash
    | "cloud_standard" // Sonnet / GPT-4o
    | "cloud_premium"; // Opus / o1

export interface ComplexityProfile {
    overallScore: number; // 0.0–1.0
    dimensions: {
        reasoning: number;
        math: number;
        coding: number;
        creativity: number;
        precision: number;
        contextLength: number;
    };
    recommendedTier: TierLevel;
}

export interface TaskNode {
    id: string;
    description: string;
    /** Dependencies that must complete before this node can start */
    dependsOn: string[];
    complexityScore: number;
    requiredCapabilities: string[]; // e.g., ["math", "web_search"]
    assignedTier?: TierLevel;
    budgetTokens?: number;
}

export interface TaskGraph {
    planId: string;
    originalQuery: string;
    nodes: TaskNode[];
    /** Expected total parallel depth (longest path) */
    criticalPathLength: number;
}

export interface PlanDocument {
    scaffold: string;
    sectionNeeds: Record<string, string>;
    tokenBudgets: Record<string, number>;
}

export interface OrchestrationResult {
    planId: string;
    finalOutput: string;
    totalLatencyMs: number;
    tokenStats: {
        localPrompt: number;
        localCompletion: number;
        cloudPrompt: number;
        cloudCompletion: number;
        savedVsNaiveCloudEur: number;
    };
    subtaskResults: Record<string, { tier: TierLevel; latencyMs: number }>;
}
