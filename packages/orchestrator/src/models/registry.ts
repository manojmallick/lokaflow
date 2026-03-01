// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
//
// packages/orchestrator/src/models/registry.ts
// ModelCapabilityRegistry — maps specific models to capability tiers and features.
// Determines which models can handle specific requiredCapabilities from the DAG.

import type { TierLevel } from "../types.js";

export interface ModelProfile {
  name: string;
  tier: TierLevel;
  costPer1kInputEur: number;
  costPer1kOutputEur: number;
  capabilities: string[]; // e.g. ["coding", "math", "reasoning", "web_search", "vision"]
  maxTokens: number;
}

export class ModelRegistry {
  private readonly profiles = new Map<string, ModelProfile>();

  constructor() {
    this._seedDefaultProfiles();
  }

  register(profile: ModelProfile): void {
    this.profiles.set(profile.name, profile);
  }

  getProfile(modelName: string): ModelProfile | undefined {
    return this.profiles.get(modelName);
  }

  findCheapestCapableModel(requiredTier: TierLevel, requiredCaps: string[]): ModelProfile | null {
    const candidates = Array.from(this.profiles.values()).filter((p) => {
      // Must be at least the required tier (or higher, but we prefer not to overpay)
      const tierRank: Record<TierLevel, number> = {
        local_nano: 1,
        local_standard: 2,
        local_large: 3,
        cloud_light: 4,
        cloud_standard: 5,
        cloud_premium: 6,
      };

      if (tierRank[p.tier] < tierRank[requiredTier]) return false;

      // Must have all required capabilities
      return requiredCaps.every((cap) => p.capabilities.includes(cap));
    });

    if (candidates.length === 0) return null;

    // Sort by cost (input cost primary, output cost secondary)
    return candidates.sort((a, b) => a.costPer1kInputEur - b.costPer1kInputEur)[0] ?? null;
  }

  private _seedDefaultProfiles(): void {
    this.register({
      name: "phi3:mini",
      tier: "local_nano",
      costPer1kInputEur: 0,
      costPer1kOutputEur: 0,
      capabilities: ["reasoning", "formatting"],
      maxTokens: 4096,
    });

    this.register({
      name: "mistral:7b",
      tier: "local_standard",
      costPer1kInputEur: 0,
      costPer1kOutputEur: 0,
      capabilities: ["reasoning", "coding", "formatting"],
      maxTokens: 8192,
    });

    this.register({
      name: "qwen2.5-coder:7b",
      tier: "local_standard",
      costPer1kInputEur: 0,
      costPer1kOutputEur: 0,
      capabilities: ["reasoning", "coding", "math", "formatting"],
      maxTokens: 32768,
    });

    this.register({
      name: "gemini-2.0-flash",
      tier: "cloud_light",
      costPer1kInputEur: 0.00069,
      costPer1kOutputEur: 0.00276,
      capabilities: ["reasoning", "coding", "math", "formatting", "web_search", "vision"],
      maxTokens: 1048576,
    });

    this.register({
      name: "gpt-4o",
      tier: "cloud_standard",
      costPer1kInputEur: 0.0046,
      costPer1kOutputEur: 0.0138,
      capabilities: ["reasoning", "coding", "math", "formatting", "vision", "precision"],
      maxTokens: 128000,
    });

    this.register({
      name: "claude-3-opus-20240229",
      tier: "cloud_premium",
      costPer1kInputEur: 0.015,
      costPer1kOutputEur: 0.075,
      capabilities: [
        "reasoning",
        "coding",
        "math",
        "formatting",
        "vision",
        "precision",
        "complex_logic",
      ],
      maxTokens: 200000,
    });
  }
}
