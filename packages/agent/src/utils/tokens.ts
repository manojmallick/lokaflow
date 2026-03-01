// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaFlow™ — lokaflow.io
//
// packages/agent/src/utils/tokens.ts
// Fast token count estimator using CL100k character-per-token approximation.
// Avoids running a full tokenizer; accurate within ±15% for practical use.

/**
 * Fast token estimate using CL100k (Claude / GPT-4 / Qwen) approximation.
 *
 * - English prose:  ~4.0 chars / token
 * - Code:           ~3.2 chars / token
 * - JSON:           ~3.5 chars / token
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const isCodeOrJson = text.includes("{") || text.includes("function ") || text.includes("def ");
  const avgCharsPerToken = isCodeOrJson ? 3.5 : 4.0;
  return Math.ceil(text.length / avgCharsPerToken);
}

/**
 * Checks whether text fits within a model's usable context window (×0.75).
 */
export function fitsInWindow(text: string, contextTokens: number, useFactor = 0.75): boolean {
  return estimateTokens(text) <= Math.floor(contextTokens * useFactor);
}

/**
 * Calculates the usable token budget for a model's context window.
 * Reserves 25% for KV cache, model overhead, and output headroom.
 */
export function usableTokenBudget(contextTokens: number, useFactor = 0.75): number {
  return Math.floor(contextTokens * useFactor);
}
