// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
//
// packages/api/src/types.ts
// Shared types for the LokaFlow REST API layer.

import type { LokaFlowConfig, Message, RoutingDecision } from "@lokaflow/core/types.js";

// ── OpenAI-compatible chat types ────────────────────────────────────────────

export interface OpenAIChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

export interface OpenAIChatRequest {
    model?: string;
    messages: OpenAIChatMessage[];
    stream?: boolean;
    max_tokens?: number;
    temperature?: number;
}

export interface OpenAIChatChoice {
    index: number;
    message: OpenAIChatMessage;
    finish_reason: "stop" | "length" | "error";
}

export interface OpenAIChatResponse {
    id: string;
    object: "chat.completion";
    created: number;
    model: string;
    choices: OpenAIChatChoice[];
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

// OpenAI SSE chunk format
export interface OpenAIChatChunk {
    id: string;
    object: "chat.completion.chunk";
    created: number;
    model: string;
    choices: [{
        index: 0;
        delta: { content?: string; role?: string };
        finish_reason: null | "stop";
    }];
}

// ── LokaFlow-specific route explain types ────────────────────────────────────

export interface RouteRequest {
    messages: OpenAIChatMessage[];
}

export interface RouteResponse {
    decision: RoutingDecision;
    complexityScore: number;
    tier: string;
    model: string;
    reason: string;
    costEstimateEur: number;
    trace: string[];
}

// ── Cost summary types ───────────────────────────────────────────────────────

export interface CostSummary {
    today: {
        totalEur: number;
        queryCount: number;
        localQueries: number;
        cloudQueries: number;
    };
    month: {
        totalEur: number;
        queryCount: number;
        savingsVsNaiveEur: number;
        localPercent: number;
    };
    limits: {
        dailyLimitEur: number;
        monthlyLimitEur: number;
        dailyUsedPercent: number;
        monthlyUsedPercent: number;
    };
}

// ── Health types ─────────────────────────────────────────────────────────────

export interface ProviderHealth {
    name: string;
    tier: "local" | "specialist" | "cloud";
    status: "ok" | "degraded" | "unavailable";
    latencyMs?: number;
    model?: string;
}

export interface HealthResponse {
    status: "ok" | "degraded";
    version: string;
    uptime: number;
    providers: ProviderHealth[];
}

// ── Server options ────────────────────────────────────────────────────────────

export interface ApiServerOptions {
    config: LokaFlowConfig;
    port?: number;
    host?: string;
    /** API key for authentication (optional — if not set, no auth required) */
    apiKey?: string;
    /** Enable Swagger UI at /docs */
    swagger?: boolean;
}
