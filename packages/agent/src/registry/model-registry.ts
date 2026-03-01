// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaFlow™ — lokaflow.io
//
// packages/agent/src/registry/model-registry.ts
// ModelCapabilityRegistry — capability lookup, quality scoring, tier routing.

import type { ModelCapabilityProfile, ModelTier, TaskType } from "../types/agent.js";
import { INTERIM_MODEL_REGISTRY, CLOUD_FALLBACK_MODEL } from "./interim-models.js";

export class ModelCapabilityRegistry {
  private readonly profiles: Map<string, ModelCapabilityProfile>;

  constructor(profiles: ModelCapabilityProfile[] = INTERIM_MODEL_REGISTRY) {
    this.profiles = new Map(profiles.map((p) => [p.id, p]));
  }

  get(modelId: string): ModelCapabilityProfile | undefined {
    return this.profiles.get(modelId);
  }

  getAll(): ModelCapabilityProfile[] {
    return [...this.profiles.values()];
  }

  getAvailable(): ModelCapabilityProfile[] {
    // In future: filter by actually available (e.g. pulled via Ollama API).
    // For now return all non-cloud profiles.
    return this.getAll().filter(
      (p) => !p.id.startsWith("anthropic:") && !p.id.startsWith("openai:"),
    );
  }

  /**
   * Quality score for a model on a specific task type.
   * Returns 0 if the model has no score for that type.
   */
  quality(modelId: string, taskType: TaskType): number {
    const profile = this.profiles.get(modelId);
    if (!profile) return 0;
    return profile.capabilities[taskType] ?? 0;
  }

  localQuality(modelId: string, taskType: TaskType): number {
    const profile = this.profiles.get(modelId);
    if (
      !profile ||
      profile.tier === "CLOUD_LIGHT" ||
      profile.tier === "CLOUD_STANDARD" ||
      profile.tier === "CLOUD_PREMIUM"
    ) {
      return 0;
    }
    return this.quality(modelId, taskType);
  }

  /**
   * Best local model for a given task type meeting the quality floor.
   */
  bestLocalForTask(taskType: TaskType, allowCloud = false): string {
    const candidates = this.getAvailable()
      .filter((p) => (p.capabilities[taskType] ?? 0) >= p.qualityFloor)
      .sort((a, b) => (b.capabilities[taskType] ?? 0) - (a.capabilities[taskType] ?? 0));

    if (candidates.length > 0 && candidates[0] !== undefined) {
      return candidates[0].id;
    }

    if (allowCloud) return CLOUD_FALLBACK_MODEL;
    throw new Error(`No model meets quality floor for task type: ${taskType}`);
  }

  /**
   * Returns models of a specific tier.
   */
  byTier(tier: ModelTier): ModelCapabilityProfile[] {
    return this.getAll().filter((p) => p.tier === tier);
  }

  hasCapableModel(taskType: TaskType, qualityFloor = 0.65): boolean {
    return this.getAvailable().some((p) => (p.capabilities[taskType] ?? 0) >= qualityFloor);
  }

  contextTokens(modelId: string): number {
    return this.profiles.get(modelId)?.contextTokens ?? 4096;
  }

  ramGb(modelId: string): number {
    return this.profiles.get(modelId)?.ramGb ?? 8;
  }
}
