// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaFlow™ — lokaflow.io
//
// packages/agent/src/index.ts
// LokaAgent™ — 8-stage orchestration pipeline.
// Entry point: call agent.process(request) for any user prompt.

import type {
  AgentRequest,
  AgentResponse,
  AgentTrace,
  AssemblyStrategy,
  ComplexityTrace,
  DecompositionTrace,
  ExecutionNodeTrace,
  ModelAssignmentTrace,
  PromptGuardTrace,
  QualityGateTrace,
  TaskGraph,
} from "./types/agent.js";
import { PromptGuard } from "./pipeline/prompt-guard.js";
import { ComplexityScorer } from "./pipeline/complexity-scorer.js";
import { TaskSplitter } from "./pipeline/task-splitter.js";
import { ExecutionEngine } from "./pipeline/execution-engine.js";
import { Assembler } from "./pipeline/assembler.js";
import { ModelCapabilityRegistry } from "./registry/model-registry.js";
import { WarmModelTracker } from "./registry/warm-tracker.js";
import { InterimDecomposer } from "./decomposer/interim-decomposer.js";
import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// LokaAgent configuration
// ---------------------------------------------------------------------------

export interface LokaAgentConfig {
  decomposer: "interim" | "lokallm";
  ollamaBaseUrl: string;
  complexityThresholds: {
    trivialBypass: number; // below this → bypass to direct local routing
    cloudEscalate: number; // above this → cloud recommended
  };
  taskSplitter: {
    maxSubtasks: number;
    maxDepth: number;
    minSubtaskTokens: number;
  };
  heuristicOnlyScoring: boolean;
}

const DEFAULT_CONFIG: LokaAgentConfig = {
  decomposer: "interim",
  ollamaBaseUrl: "http://localhost:11434",
  complexityThresholds: {
    trivialBypass: 0.4,
    cloudEscalate: 0.65,
  },
  taskSplitter: {
    maxSubtasks: 6,
    maxDepth: 3,
    minSubtaskTokens: 150,
  },
  heuristicOnlyScoring: false,
};

// ---------------------------------------------------------------------------
// LokaAgent
// ---------------------------------------------------------------------------

export class LokaAgent {
  private readonly guard: PromptGuard;
  private readonly scorer: ComplexityScorer;
  private readonly registry: ModelCapabilityRegistry;
  private readonly warmTracker: WarmModelTracker;
  private readonly decomposer: InterimDecomposer;
  private readonly splitter: TaskSplitter;
  private readonly engine: ExecutionEngine;
  private readonly assembler: Assembler;
  private readonly config: LokaAgentConfig;

  constructor(config: Partial<LokaAgentConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.guard = new PromptGuard();
    this.registry = new ModelCapabilityRegistry();
    this.warmTracker = new WarmModelTracker();
    this.scorer = new ComplexityScorer({
      scorerModel: "ollama:qwen2.5:7b",
      heuristicOnlyMode: this.config.heuristicOnlyScoring,
      heuristicConfidenceThreshold: 0.8,
      ollamaBaseUrl: this.config.ollamaBaseUrl,
    });
    this.decomposer = new InterimDecomposer(this.registry, this.warmTracker, {
      decomposerModel: "ollama:qwen2.5:7b",
      ollamaBaseUrl: this.config.ollamaBaseUrl,
      maxRetries: 1,
    });
    this.splitter = new TaskSplitter(this.decomposer, this.registry, this.warmTracker, {
      ...this.config.taskSplitter,
      minSavingPercent: 20,
      recursiveMinSavingPercent: 15,
    });
    this.engine = new ExecutionEngine(this.registry, {
      defaultTimeoutMs: 120_000,
      maxTimeoutMs: 180_000,
      preWarmNextModel: true,
      ollamaBaseUrl: this.config.ollamaBaseUrl,
    });
    this.assembler = new Assembler({
      synthesisModel: "ollama:tinyllama:1.1b",
      ollamaBaseUrl: this.config.ollamaBaseUrl,
    });
  }

  // ---------------------------------------------------------------------------
  // Main entry point
  // ---------------------------------------------------------------------------

  async process(request: AgentRequest): Promise<AgentResponse> {
    const start = Date.now();

    // ── Stage 1: PromptGuard ────────────────────────────────────────────────
    const guardResult = this.guard.check(request.prompt);

    const guardTrace: PromptGuardTrace = {
      action: guardResult.action,
      piiDetected: !!guardResult.localOnly,
      ambiguous: guardResult.action === "CLARIFY",
    };

    if (guardResult.action === "BLOCK") {
      return this.errorResponse(
        guardResult.reason ?? "Request blocked by safety policy.",
        guardTrace,
        start,
      );
    }

    if (guardResult.action === "CLARIFY") {
      return this.clarifyResponse(
        guardResult.question ?? "Could you clarify your request?",
        guardTrace,
        start,
      );
    }

    const cleanPrompt = guardResult.cleanPrompt ?? request.prompt;
    const intent = guardResult.intent!;
    const localOnly = request.localOnly ?? guardResult.localOnly ?? false;

    // ── Stage 2: ComplexityScorer ───────────────────────────────────────────
    const complexity = await this.scorer.score(cleanPrompt, intent);

    const complexityTrace: ComplexityTrace = {
      index: complexity.index,
      dimensions: complexity.dimensions,
      confidence: complexity.confidence,
      usedModelCall: complexity.confidence < 0.8 && !this.config.heuristicOnlyScoring,
    };

    // Trivial bypass: complexity < threshold → hand off to simple local routing
    const isTrivial = complexity.index < this.config.complexityThresholds.trivialBypass;

    let graph: TaskGraph | undefined;
    let decompositionTrace: DecompositionTrace;
    let nodeOrder: string[] = [];
    let planTokens: { input: number; output: number } = { input: 0, output: 0 };

    if (isTrivial) {
      // No decomposition — build a single-node graph
      const nodeId = "t1";
      graph = {
        id: crypto.randomUUID(),
        originalPrompt: cleanPrompt,
        intent,
        nodes: [
          {
            id: nodeId,
            graphId: "direct",
            depth: 0,
            description: cleanPrompt,
            inputContext: "",
            outputSchema: { format: "PLAIN", requiredElements: [], maxTokens: 2000 },
            assignedModel: "ollama:qwen2.5:7b",
            fallbackModel: "anthropic:claude-sonnet-4",
            estimatedComplexity: complexity.index,
            tokenBudget: { inputMax: 4000, outputMax: 2000 },
            timeoutMs: 60_000,
            retryCount: 0,
            canRunParallel: true,
            status: "PENDING",
            dependsOn: [],
            taskType: "reasoning",
          },
        ],
        edges: [],
        depth: 0,
        intentPreserved: true,
        createdAt: new Date(),
      };
      nodeOrder = [nodeId];
      decompositionTrace = {
        subtaskCount: 0,
        depth: 0,
        gateDecision: "bypassed_trivial",
        intentPreserved: true,
        nodes: [],
      };
    } else {
      // ── Stage 3: TaskSplitter ─────────────────────────────────────────────
      const splitResult = await this.splitter.decompose(cleanPrompt, intent, complexity.index);
      graph = splitResult.graph;
      planTokens = splitResult.planTokens;
      nodeOrder = graph.nodes.map((n) => n.id);
      decompositionTrace = {
        subtaskCount: graph.nodes.length,
        depth: graph.depth,
        gateDecision: "decomposed",
        intentPreserved: graph.intentPreserved,
        nodes: graph.nodes.map((n) => ({ id: n.id, depth: n.depth })),
      };
    }

    // ── Stage 4: Model assignments are already set inside TaskSplitter ────────
    const modelAssignments: ModelAssignmentTrace[] = graph.nodes.map((n) => ({
      nodeId: n.id,
      modelId: n.assignedModel,
      tier: this.registry.get(n.assignedModel)?.tier ?? "LOCAL_STANDARD",
      qualityScore: this.registry.quality(n.assignedModel, n.taskType),
      warm: this.warmTracker.isWarm(n.assignedModel),
    }));

    // ── Stage 5 + 6: ContextPacker + ExecutionEngine ──────────────────────
    const executionResult = await this.engine.execute(graph, localOnly);
    const nodeResults = executionResult.nodeResults;

    // ── Stage 7: QualityGate (embedded inside ExecutionEngine per node) ────
    const qualityGates: QualityGateTrace[] = [...nodeResults.values()].map((r) => ({
      nodeId: r.nodeId,
      passed: !r.escalated,
      score: r.qualityScore ?? 0,
      failedChecks: [],
    }));

    const executionNodes: ExecutionNodeTrace[] = [...nodeResults.values()].map((r) => ({
      id: r.nodeId,
      description: graph!.nodes.find((n) => n.id === r.nodeId)?.description ?? "",
      model: r.model,
      tokensInput: r.tokensUsed.inputTokens,
      tokensOutput: r.tokensUsed.outputTokens,
      latencyMs: r.latencyMs,
      qualityScore: r.qualityScore ?? 0,
      escalated: r.escalated ?? false,
      packedTokens: r.packedTokens ?? 0,
    }));

    const partialTrace = {
      promptGuard: guardTrace,
      complexityScore: complexityTrace,
      decomposition: decompositionTrace,
      modelAssignments,
      execution: {
        nodes: executionNodes,
        parallelBatches: graph.nodes.length > 0 ? 1 : 0,
        totalLatencyMs: Date.now() - start,
      },
      qualityGates,
    };

    // ── Stage 8: Assembler ────────────────────────────────────────────────
    const strategy: AssemblyStrategy = this.selectStrategy(intent);
    const finalOutput = await this.assembler.assemble(
      nodeResults,
      strategy,
      intent,
      partialTrace,
      nodeOrder,
      planTokens,
    );

    const hasEscalations = [...nodeResults.values()].some((r) => r.escalated);

    return {
      content: finalOutput.content,
      trace: finalOutput.trace,
      metrics: finalOutput.metrics,
      partial: hasEscalations,
    };
  }

  // ---------------------------------------------------------------------------
  // Warm-tracker update (called by mesh poller)
  // ---------------------------------------------------------------------------

  updateWarmModels(nodeId: string, loadedModels: string[]): void {
    this.warmTracker.updateNode(nodeId, loadedModels);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private selectStrategy(intent: { outputType: string }): AssemblyStrategy {
    if (intent.outputType === "CODE") return "CODE_MERGE";
    if (intent.outputType === "TABLE" || intent.outputType === "LIST") return "EXTRACTIVE";
    if (intent.outputType === "SUMMARY") return "SYNTHESIS";
    return "SEQUENTIAL";
  }

  private errorResponse(
    reason: string,
    guardTrace: PromptGuardTrace,
    start: number,
  ): AgentResponse {
    return buildErrorResponse(reason, guardTrace, start);
  }

  private clarifyResponse(
    question: string,
    guardTrace: PromptGuardTrace,
    start: number,
  ): AgentResponse {
    return buildErrorResponse(question, guardTrace, start);
  }
}

// ---------------------------------------------------------------------------
// Standalone helper for error/clarify responses
// ---------------------------------------------------------------------------

function buildErrorResponse(
  content: string,
  guardTrace: PromptGuardTrace,
  start: number,
): AgentResponse {
  const emptyDimensions = {
    reasoning: 0,
    domain: 0,
    creativity: 0,
    context: 0,
    precision: 0,
    interdependence: 0,
  };
  const trace: AgentTrace = {
    promptGuard: guardTrace,
    complexityScore: { index: 0, dimensions: emptyDimensions, confidence: 0, usedModelCall: false },
    decomposition: {
      subtaskCount: 0,
      depth: 0,
      gateDecision: "blocked",
      intentPreserved: false,
      nodes: [],
    },
    modelAssignments: [],
    execution: { nodes: [], parallelBatches: 0, totalLatencyMs: Date.now() - start },
    qualityGates: [],
    assembly: { strategy: "SEQUENTIAL", usedSynthesisModel: false },
    savings: {
      totalNodes: 0,
      localNodes: 0,
      cloudNodes: 0,
      escalatedNodes: 0,
      cloudEquivalentTokens: 0,
      actualLocalTokens: 0,
      actualCloudTokens: 0,
      savingPercent: 0,
      savingEur: 0,
    },
  };
  return {
    content,
    trace,
    metrics: {
      totalLatencyMs: Date.now() - start,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      plannerInputTokens: 0,
      plannerOutputTokens: 0,
      nodesExecuted: 0,
      nodesEscalated: 0,
      estimatedCostEur: 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Public re-exports
// ---------------------------------------------------------------------------

export type { AgentRequest, AgentResponse, AgentTrace, AgentMetrics } from "./types/agent.js";
export { ModelCapabilityRegistry } from "./registry/model-registry.js";
export { WarmModelTracker } from "./registry/warm-tracker.js";
export { INTERIM_MODEL_REGISTRY } from "./registry/interim-models.js";
export { hasCycle } from "./dag/cycle-detector.js";
export { topologicalSort } from "./dag/topological-sort.js";
