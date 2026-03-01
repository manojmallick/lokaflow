// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaCommons™ — lokaflow.io

export interface CreditTransaction {
    id: string;                    // UUID
    timestamp: string;             // ISO 8601
    memberId: string;
    type: 'earn' | 'spend' | 'reserve' | 'release' | 'governance-grant';
    amount: number;                // positive = earn, negative = spend
    tokenCount?: number;           // tokens that triggered this transaction
    taskId?: string;               // associated task
    nodeId?: string;               // which node was involved
    balance: number;               // balance AFTER this transaction
    memo: string;                  // human-readable reason
}

export interface LedgerAuditResult {
    passed: boolean;
    negativBalanceCount: number;
    issues: string[];
}
