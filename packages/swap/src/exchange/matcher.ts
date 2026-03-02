// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaSwap™ — lokaflow.io

import { ExchangeListing, ExchangeAsset } from "./listing.js";

export interface MatchResult {
  offer: ExchangeListing;
  request: ExchangeListing;
  /** How closely the offer and request assets match (0–1) */
  compatibilityScore: number;
}

/**
 * Returns true when two ExchangeAssets are compatible:
 * - Same type
 * - For api-credits: same provider
 * - For compute-time: same model (or request has no model requirement)
 */
function assetsCompatible(a: ExchangeAsset, b: ExchangeAsset): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "api-credits" && b.type === "api-credits") {
    return a.provider === b.provider;
  }
  if (a.type === "compute-time" && b.type === "compute-time") {
    return a.model === b.model;
  }
  return true; // lokacredits always compatible
}

/**
 * Score how well an offer matches a request.
 * Returns 0 if incompatible, 0–1 based on amount overlap.
 */
function scoreMatch(offer: ExchangeListing, request: ExchangeListing): number {
  // Asset compatibility check: offer.asset ↔ request.asking, offer.asking ↔ request.asset
  if (!assetsCompatible(offer.asset, request.asking)) return 0;
  if (!assetsCompatible(offer.asking, request.asset)) return 0;

  // Amount overlap: offer must supply at least what the request asks
  const offeredAmount =
    offer.asset.type === "lokacredits"
      ? offer.asset.amount
      : offer.asset.type === "api-credits"
        ? offer.asset.amount
        : offer.asset.type === "compute-time"
          ? offer.asset.hours
          : 0;

  const neededAmount =
    request.asking.type === "lokacredits"
      ? request.asking.amount
      : request.asking.type === "api-credits"
        ? request.asking.amount
        : request.asking.type === "compute-time"
          ? request.asking.hours
          : 0;

  if (offeredAmount <= 0 || neededAmount <= 0) return 0;

  const overlapRatio = Math.min(1, offeredAmount / neededAmount);
  return overlapRatio;
}

/**
 * ListingMatcher — finds compatible offer/request pairs from the open listing book.
 *
 * Matching rules:
 * - offer.asset must match request.asking (same type, same provider/model)
 * - offer.asking must match request.asset
 * - Both listings must be in 'open' status and not expired
 * - Sorted by compatibility score descending
 */
export class ListingMatcher {
  /**
   * Find all compatible matches for a given listing.
   * If `listing.listingType === 'offer'`, matches it against open 'want' listings.
   * If `listing.listingType === 'want'`, matches it against open 'offer' listings.
   */
  findMatches(listing: ExchangeListing, allListings: ExchangeListing[]): MatchResult[] {
    const now = new Date();
    const counterType = listing.listingType === "offer" ? "want" : "offer";

    const candidates = allListings.filter(
      (l) =>
        l.id !== listing.id &&
        l.listingType === counterType &&
        l.status === "open" &&
        new Date(l.expiresAt) > now,
    );

    const results: MatchResult[] = [];
    for (const candidate of candidates) {
      const offer = listing.listingType === "offer" ? listing : candidate;
      const request = listing.listingType === "offer" ? candidate : listing;
      const score = scoreMatch(offer, request);
      if (score > 0) {
        results.push({ offer, request, compatibilityScore: score });
      }
    }

    return results.sort((a, b) => b.compatibilityScore - a.compatibilityScore);
  }

  /**
   * Find the single best match for a listing.
   * Returns null if no compatible match exists.
   */
  bestMatch(listing: ExchangeListing, allListings: ExchangeListing[]): MatchResult | null {
    const matches = this.findMatches(listing, allListings);
    return matches[0] ?? null;
  }

  /**
   * Run a full order-book matching pass across all open listings.
   * Returns a set of non-overlapping matches (each listing appears at most once).
   */
  matchAll(allListings: ExchangeListing[]): MatchResult[] {
    const now = new Date();
    const openOffers = allListings.filter(
      (l) => l.listingType === "offer" && l.status === "open" && new Date(l.expiresAt) > now,
    );
    const openRequests = allListings.filter(
      (l) => l.listingType === "want" && l.status === "open" && new Date(l.expiresAt) > now,
    );

    const matched = new Set<string>();
    const results: MatchResult[] = [];

    // Build all candidate pairs, scored
    const candidates: MatchResult[] = [];
    for (const offer of openOffers) {
      for (const request of openRequests) {
        const score = scoreMatch(offer, request);
        if (score > 0) {
          candidates.push({ offer, request, compatibilityScore: score });
        }
      }
    }

    // Sort by score descending, greedy matching
    candidates.sort((a, b) => b.compatibilityScore - a.compatibilityScore);
    for (const c of candidates) {
      if (!matched.has(c.offer.id) && !matched.has(c.request.id)) {
        results.push(c);
        matched.add(c.offer.id);
        matched.add(c.request.id);
      }
    }

    return results;
  }
}
