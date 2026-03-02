// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaSwap™ — lokaflow.io
//
// packages/swap/src/types/index.ts
// Aggregated type exports for all LokaSwap subsystems.

// ── Exchange ───────────────────────────────────────────────────────────────
export type { ExchangeAsset, ExchangeListing, TradeRecord } from "../exchange/listing.js";

// ── Settlement ─────────────────────────────────────────────────────────────

export interface SettlementRecord {
  id: string;
  buyerId: string;
  sellerId: string;
  asset: string; // JSON-serialised ExchangeAsset
  creditAmount: number;
  settledAt: string;
  transactionHash?: string; // optional future on-chain proof
}

export interface SettlementRequest {
  listingId: string;
  buyerId: string;
  paymentCredits: number;
}

export interface SettlementResult {
  success: boolean;
  record?: SettlementRecord;
  error?: string;
}

// ── Conversion ─────────────────────────────────────────────────────────────

export interface ConversionRate {
  provider: string;
  model: string;
  inputTokensPerCredit: number;
  outputTokensPerCredit: number;
  updatedAt: string;
}

export interface ConversionRequest {
  provider: "anthropic" | "openai" | "google" | string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface ConversionResult {
  creditsRequired: number;
  breakdown: {
    inputCost: number;
    outputCost: number;
  };
  rateSnapshot: ConversionRate;
}

// ── Pool ───────────────────────────────────────────────────────────────────

export type PoolProvider = "anthropic" | "openai" | "google" | "azure";

export interface ApiPool {
  id: string;
  provider: PoolProvider;
  displayName: string;
  totalCredits: number;
  allocatedCredits: number;
  reservedCredits: number;
  createdAt: string;
  expiresAt?: string;
}

export interface PoolAllocation {
  poolId: string;
  memberId: string;
  allocated: number;
  used: number;
  allocatedAt: string;
}

export interface PoolUsageSummary {
  poolId: string;
  totalAllocated: number;
  totalUsed: number;
  utilisation: number; // 0–1
  topMembers: Array<{ memberId: string; used: number }>;
}

// ── Demand aggregation ─────────────────────────────────────────────────────

export interface MemberDemandPledge {
  id: string;
  memberId: string;
  provider: PoolProvider;
  model: string;
  estimatedMonthlyTokens: number;
  currentLocalCapacity: number; // tokens/s available for cooperative sharing
  willingToPay: number; // max lokacredits per 1M output tokens
  pledgedAt: string;
  validUntil: string;
}

export interface AggregatedDemand {
  provider: PoolProvider;
  model: string;
  totalPledgedTokens: number;
  averageWillingToPay: number;
  pledgeCount: number;
  snapshotAt: string;
}

// ── Credit system ──────────────────────────────────────────────────────────

export interface CreditBalance {
  memberId: string;
  balance: number;
  lastUpdated: string;
}

export interface CreditTopUpRequest {
  memberId: string;
  amount: number;
  source: "purchase" | "compute_contribution" | "referral" | "promo";
  reference?: string;
}

export interface CreditTransferRequest {
  fromMemberId: string;
  toMemberId: string;
  amount: number;
  reason: string;
}

// ── Swap outcomes ──────────────────────────────────────────────────────────

export type SwapStatus = "pending" | "matched" | "settled" | "failed" | "expired";

export interface SwapOrder {
  id: string;
  memberId: string;
  offerAsset: string; // JSON ExchangeAsset
  requestAsset: string; // JSON ExchangeAsset
  status: SwapStatus;
  createdAt: string;
  matchedAt?: string;
  settledAt?: string;
  expiresAt: string;
}

export interface SwapMatch {
  orderId: string;
  counterOrderId: string;
  matchScore: number; // 0–1, how well assets match
  matchedAt: string;
}
