// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaRoute™ — lokaflow.io
//
// packages/route/src/router/policy.ts
// RoutingPolicy — loads, validates, and applies user routing preferences.

import type { RoutingTier } from "../types/routing.js";
import type { PolicyOverride, RoutingPolicy } from "../types/routing.js";

export type { RoutingPolicy, PolicyOverride };

export const DEFAULT_POLICY: RoutingPolicy = {
  forceLocal: false,
  monthlyCloudBudgetEur: 10.0,
  optimiseFor: "balanced",
  overrides: [],
};

/**
 * Build a RoutingPolicy from a raw config block (lokaflow.yaml `route.policy`).
 * Unknown fields are silently ignored — safe to call with partial configs.
 */
export function buildPolicy(raw: Record<string, unknown> = {}): RoutingPolicy {
  const overrides: PolicyOverride[] = [];

  if (Array.isArray(raw["overrides"])) {
    for (const o of raw["overrides"] as Array<Record<string, unknown>>) {
      if (typeof o.pattern === "string" && typeof o.forceTier === "string") {
        overrides.push({
          pattern: new RegExp(o.pattern, "i"),
          forceTier: o.forceTier as RoutingTier,
          reason: (o.reason as string) ?? "policy override",
        });
      }
    }
  }

  return {
    forceLocal: Boolean(raw["forceLocal"] ?? false),
    monthlyCloudBudgetEur: Number(raw["monthlyCloudBudgetEur"] ?? 10.0),
    optimiseFor: ((raw["optimiseFor"] as string) ?? "balanced") as RoutingPolicy["optimiseFor"],
    overrides,
  };
}

/**
 * Check policy overrides against the query string.
 * Returns the forced tier and reason, or null if no override matches.
 */
export function matchPolicyOverride(
  query: string,
  policy: RoutingPolicy,
): { tier: RoutingTier; reason: string } | null {
  if (policy.forceLocal) return { tier: "local-capable", reason: "forceLocal: true" };

  for (const override of policy.overrides) {
    const pattern =
      typeof override.pattern === "string" ? new RegExp(override.pattern, "i") : override.pattern;
    if (pattern.test(query)) {
      return { tier: override.forceTier, reason: override.reason };
    }
  }
  return null;
}
