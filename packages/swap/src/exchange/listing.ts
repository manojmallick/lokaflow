// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaSwap™ — lokaflow.io

export type ExchangeAsset =
    | { type: 'lokacredits'; amount: number }
    | { type: 'api-credits'; provider: 'anthropic' | 'openai' | 'google'; amount: number }
    | { type: 'compute-time'; nodeId: string; hours: number; model: string };

export interface ExchangeListing {
    id: string;
    memberId: string;
    listingType: 'offer' | 'want';
    asset: ExchangeAsset;

    // What the member wants in return
    asking: ExchangeAsset;

    // Optional: for compute-time listings, specific quality requirements
    requirements?: {
        minTokensPerSecond?: number;
        region?: string;           // data residency requirement
        model?: string;
    };

    expiresAt: string;           // listings expire after 7 days
    createdAt: string;
    status: 'open' | 'matched' | 'settled' | 'expired' | 'cancelled';
}

export interface TradeRecord {
    id: string;
    offerId: string;
    requestId: string;
    settledAt: string;
    status: 'settled';
}
