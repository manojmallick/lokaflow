// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaFlow™ — lokaflow.io
//
// packages/agent/src/pipeline/model-matcher.ts
// Stage 4 — ModelMatcher: assigns optimal model to each TaskNode.
// Scoring: quality × 0.40 + warm_bonus × 0.25 + cost_pref × 0.20 + speed × 0.10 - ram × 0.05

import type { ModelAssignment, ModelTier, TaskNode, TaskType } from "../types/agent.js";
import type { ModelCapabilityRegistry } from "../registry/model-registry.js";
import type { WarmModelTracker } from "../registry/warm-tracker.js";
import { CLOUD_FALLBACK_MODEL, DEFAULT_STANDARD_MODEL } from "../registry/interim-models.js";

export class ModelMatcher {
  constructor(
    private readonly registry: ModelCapabilityRegistry,
    private readonly warmTracker: WarmModelTracker,
    private readonly config = {
      qualityWeight: 0.4,
      warmBonusWeight: 0.25,
      costWeight: 0.2,
      speedWeight: 0.1,
      ramPenaltyWeight: 0.05,
      maxRamGb: 48,
      referenceTokensPerSec: 35,
    },
  ) {}

  assign(node: TaskNode): ModelAssignment {
    const taskType: TaskType = node.taskType;
    const qualityFloor = 0.65;

    const candidates = this.registry
      .getAvailable()
      .filter((m) => (m.capabilities[taskType] ?? 0) >= qualityFloor);

    if (candidates.length === 0) {
      const cloudAssign: ModelAssignment = {
        modelId: CLOUD_FALLBACK_MODEL,
        tier: "CLOUD_STANDARD",
        fallbackModelId: CLOUD_FALLBACK_MODEL,
        qualityScore: 0,
        reason: "no_local_capable",
      };
      return cloudAssign;
    }

    const scored = candidates.map((model) => {
      const quality = model.capabilities[taskType] ?? 0;
      const warmBonus = this.warmTracker.isWarm(model.id) ? this.config.warmBonusWeight : 0;
      const costPref = (1 - (model.costFactor ?? 0.1)) * this.config.costWeight;
      const speed =
        ((model.tokensPerSec.m2_8gb ?? 20) / this.config.referenceTokensPerSec) *
        this.config.speedWeight;
      const ramPenalty = (model.ramGb / this.config.maxRamGb) * this.config.ramPenaltyWeight;

      return {
        model,
        score: quality * this.config.qualityWeight + warmBonus + costPref + speed - ramPenalty,
        quality,
      };
    });

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (!best) {
      const fallbackAssign: ModelAssignment = {
        modelId: CLOUD_FALLBACK_MODEL,
        tier: "CLOUD_STANDARD",
        fallbackModelId: CLOUD_FALLBACK_MODEL,
        qualityScore: 0,
        reason: "no_local_capable",
      };
      return fallbackAssign;
    }

    const warmNode = this.warmTracker.getWarmNode(best.model.id);

    const assignment: ModelAssignment = {
      modelId: best.model.id,
      tier: best.model.tier,
      fallbackModelId: this.selectFallback(best.model.tier),
      qualityScore: best.quality,
      reason: this.warmTracker.isWarm(best.model.id) ? "warm_preference" : "matched",
    };
    if (warmNode !== undefined) {
      assignment.warmOnNode = warmNode;
    }
    return assignment;
  }

  private selectFallback(tier: ModelTier): string {
    switch (tier) {
      case "LOCAL_NANO":
        return DEFAULT_STANDARD_MODEL;
      case "LOCAL_STANDARD":
      case "LOCAL_LARGE":
        return CLOUD_FALLBACK_MODEL;
      default:
        return CLOUD_FALLBACK_MODEL;
    }
  }

  /**
   * Returns the best model for a specific task type without a full TaskNode.
   * Used by the main router for direct local routing.
   */
  bestForTaskType(taskType: TaskType, allowCloud = false): string {
    try {
      return this.registry.bestLocalForTask(taskType, allowCloud);
    } catch {
      return allowCloud ? CLOUD_FALLBACK_MODEL : DEFAULT_STANDARD_MODEL;
    }
  }
}
