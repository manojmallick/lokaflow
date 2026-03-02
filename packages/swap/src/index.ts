// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaSwap™ — lokaflow.io

// Exchange
export { TradeSettlement, CreditsLedger } from "./exchange/settlement.js";
export type { ExchangeListing, ExchangeAsset, TradeRecord } from "./exchange/listing.js";
export { ListingMatcher } from "./exchange/matcher.js";
export type { MatchResult } from "./exchange/matcher.js";
export { ExchangeHistory } from "./exchange/history.js";
export type { TradeHistoryRecord, ExchangeSummary } from "./exchange/history.js";

// Purchasing
export {
  DemandAggregator,
} from "./purchasing/demand-aggregator.js";
export type { MemberDemandPledge, AggregateDemand } from "./purchasing/demand-aggregator.js";
export { NegotiationTracker } from "./purchasing/negotiation-tracker.js";
export type { Negotiation, NegotiationRound, NegotiationStatus } from "./purchasing/negotiation-tracker.js";
export { AllocationManager } from "./purchasing/allocation.js";
export type { ApiCreditAllocation, AllocationSummary } from "./purchasing/allocation.js";

// Providers
export type { ApiProviderIntegration, ProviderBalance, ProviderRate } from "./purchasing/providers/base.js";
export { AnthropicProvider } from "./purchasing/providers/anthropic.js";
export { OpenAIProvider } from "./purchasing/providers/openai.js";
export { GoogleProvider } from "./purchasing/providers/google.js";

// Pools
export { PoolUsageTracker } from "./pools/pool.js";
export type { ApiCreditPool } from "./pools/pool.js";
export { PoolManager } from "./pools/pool-manager.js";
export type { PoolStatus, PoolFundingRecord } from "./pools/pool-manager.js";
export { PoolConsumptionTracker } from "./pools/usage-tracker.js";
export type { UsageEvent, MemberUsageSummary, PoolUsageSummary } from "./pools/usage-tracker.js";

// Conversion
export { CreditConverter, INITIAL_CONVERSION_RATES } from "./conversion/converter.js";
export { RateEngine } from "./conversion/rate-engine.js";
export type { GovernedRate } from "./conversion/rate-engine.js";
export { RateHistory } from "./conversion/rate-history.js";
export type { RateChange } from "./conversion/rate-history.js";

// Unique shared types from types/index.ts (avoid duplicating per-file exports)
export type {
  SettlementRecord,
  SettlementRequest,
  SettlementResult,
  ConversionRate,
  ConversionRequest,
  ConversionResult,
  PoolProvider,
  ApiPool,
  PoolAllocation,
  AggregatedDemand,
  CreditBalance,
  CreditTopUpRequest,
  CreditTransferRequest,
  SwapStatus,
  SwapOrder,
  SwapMatch,
} from "./types/index.js";

