// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaFlow™ — lokaflow.io
//
// packages/agent/src/pipeline/task-splitter.ts
// Stage 3 — TaskSplitter: recursive decomposition into TaskGraph.
// Max depth = 3. Max subtasks per level = 6. Min subtask tokens = 150.

import type { TaskGraph, TaskNode, IntentProfile } from "../types/agent.js";
import type { InterimDecomposer } from "../decomposer/interim-decomposer.js";
import { DecompositionGate } from "../decomposer/decomposition-gate.js";
import type { ModelCapabilityRegistry } from "../registry/model-registry.js";
import { ModelMatcher } from "./model-matcher.js";
import type { WarmModelTracker } from "../registry/warm-tracker.js";
import { ComplexityScorer } from "./complexity-scorer.js";
import { CLOUD_FALLBACK_MODEL } from "../registry/interim-models.js";
import { estimateTokens } from "../utils/tokens.js";
import crypto from "node:crypto";

export class TaskSplitter {
  private readonly gate: DecompositionGate;
  private readonly matcher: ModelMatcher;
  private readonly scorer: ComplexityScorer;

  constructor(
    private readonly decomposer: InterimDecomposer,
    private readonly registry: ModelCapabilityRegistry,
    private readonly warmTracker: WarmModelTracker,
    private readonly config = {
      maxSubtasks: 6,
      maxDepth: 3,
      minSubtaskTokens: 150,
      minSavingPercent: 20,
      recursiveMinSavingPercent: 15,
    },
  ) {
    this.gate = new DecompositionGate(registry);
    this.matcher = new ModelMatcher(registry, warmTracker);
    this.scorer = new ComplexityScorer();
  }

  async decompose(
    task: string,
    intent: IntentProfile,
    complexityIndex: number,
  ): Promise<TaskGraph> {
    const graphId = crypto.randomUUID();
    const graph = await this.decomposer.decompose(task, intent, complexityIndex, graphId, 0);
    this.enforceSubtaskLimits(graph);
    this.assignModels(graph);
    return graph;
  }

  /**
   * Recursively splits a single TaskNode if it still exceeds quality floor.
   */
  async splitRecursively(
    node: TaskNode,
    intent: IntentProfile,
    depth: number,
  ): Promise<TaskNode[]> {
    // Hard stop
    if (depth >= this.config.maxDepth) {
      if (this.registry.quality(node.assignedModel, node.taskType) < 0.65) {
        node.assignedModel = CLOUD_FALLBACK_MODEL;
        node.escalationReason = "max_recursion_depth";
      }
      return [node];
    }

    const complexity = await this.scorer.score(node.description, {
      primaryGoal: node.description,
      outputType: "ANALYSIS",
      requiredSections: [],
      domainHints: [],
      qualityRequirement: "BALANCED",
      estimatedComplexity: node.estimatedComplexity,
      preserveOriginalPrompt: node.description,
    });

    const modelQuality = this.registry.quality(node.assignedModel, node.taskType);

    // Stop recursing when node is simple enough for assigned model
    if (complexity.index < 0.45 || modelQuality >= 0.75) {
      return [node];
    }

    // Try re-decomposing this node
    let subGraph: TaskGraph;
    try {
      subGraph = await this.decomposer.decompose(
        node.description,
        {
          primaryGoal: node.description,
          outputType: "ANALYSIS",
          requiredSections: [],
          domainHints: [],
          qualityRequirement: "BALANCED",
          estimatedComplexity: node.estimatedComplexity,
          preserveOriginalPrompt: node.description,
        },
        complexity.index,
        node.graphId,
        depth,
      );
    } catch {
      // Decompose failed — assign best available
      node.assignedModel = this.matcher.bestForTaskType(node.taskType, true);
      return [node];
    }

    this.enforceSubtaskLimits(subGraph, 4);
    this.assignModels(subGraph);

    const gateResult = this.gate.evaluate(node, subGraph, true);
    if (!gateResult.decompose) {
      // Gate rejected — use best available
      node.assignedModel = this.matcher.bestForTaskType(node.taskType, true);
      return [node];
    }

    // Recursively resolve sub-nodes
    const resolved = await Promise.all(
      subGraph.nodes.map((n) => this.splitRecursively(n, intent, depth + 1)),
    );
    return resolved.flat();
  }

  /**
   * Enforce hard limits: max subtasks, min subtask token size.
   */
  private enforceSubtaskLimits(graph: TaskGraph, maxSubtasks = this.config.maxSubtasks): void {
    // Merge excess subtasks (take last N by merging the smallest)
    while (graph.nodes.length > maxSubtasks) {
      const smallest = graph.nodes
        .filter((n) => n.dependsOn.length === 0)
        .sort((a, b) => estimateTokens(a.description) - estimateTokens(b.description))[0];
      if (!smallest) break;
      // Merge with adjacent
      graph.nodes = graph.nodes.filter((n) => n.id !== smallest.id);
    }

    // Remove tiny subtasks (< minSubtaskTokens) by merging into nearest dependent
    graph.nodes = graph.nodes.filter(
      (n) => estimateTokens(n.description) >= this.config.minSubtaskTokens,
    );
  }

  /** Update model assignments based on ModelMatcher for all nodes. */
  private assignModels(graph: TaskGraph): void {
    for (const node of graph.nodes) {
      const assignment = this.matcher.assign(node);
      node.assignedModel = assignment.modelId;
      node.fallbackModel = assignment.fallbackModelId;
    }
  }
}
