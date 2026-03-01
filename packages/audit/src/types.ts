// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
//
// packages/audit/src/types.ts
// Core types for LokaAudit — the subscription analyzer.

export type ProviderType = "chatgpt" | "claude";

export interface ChatMessage {
    role: "user" | "assistant" | "system" | "tool";
    content: string;
    timestampMs: number;
}

export interface ConversationInfo {
    id: string;
    title: string;
    createTimeMs: number;
    updateTimeMs: number;
    messages: ChatMessage[];
}

export interface ExportData {
    provider: ProviderType;
    exportDateMs: number;
    conversations: ConversationInfo[];
}

export interface AuditReport {
    provider: ProviderType;
    periodDays: number;
    totalConversations: number;
    totalUserMessages: number;
    totalTokensEstimated: number;

    // Categorization
    complexQueriesCount: number;
    simpleQueriesCount: number;

    // Financial analysis
    currentMonthlySubscriptionEur: number;
    lokaflowEquivalentCostEur: number;
    monthlySavingsEur: number;

    // Recommendation
    canCancel: boolean;
    reasoning: string;
}

// Simple internal interface for parsers
export interface ExportParser {
    parse(rawJson: string): ExportData;
}
