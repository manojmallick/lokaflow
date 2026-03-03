// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaFlow™ — lokaflow.io
//
// packages/agent/src/pipeline/execution-engine.ts
// Stage 6 — ExecutionEngine: topological sort → parallel execution per layer.
// Pre-warms next layer model while current layer executes.

import type {
  TaskGraph,
  TaskNode,
  NodeResult,
  ExecutionResult,
  ModelOutput,
} from "../types/agent.js";
import { topologicalSort } from "../dag/topological-sort.js";
import { assertNoCycle } from "../dag/cycle-detector.js";
import { ContextPacker } from "./context-packer.js";
import { QualityGate } from "./quality-gate.js";
import { OllamaClient } from "../utils/ollama.js";
import { CLOUD_FALLBACK_MODEL, DEFAULT_NANO_MODEL } from "../registry/interim-models.js";
import type { ModelCapabilityRegistry } from "../registry/model-registry.js";

const TIMEOUT_BY_COMPLEXITY: Readonly<Record<string, number>> = {
  TRIVIAL: 30_000,
  MODERATE: 60_000,
};

/**
 * Map a normalised complexity score to a timeout.
 * COMPLEX and above use the engine's configurable defaultTimeoutMs so
 * operators can tune it without touching source code.
 */
function complexityToTimeout(complexity: number, defaultMs: number): number {
  if (complexity < 0.35) return TIMEOUT_BY_COMPLEXITY["TRIVIAL"]!;
  if (complexity < 0.55) return TIMEOUT_BY_COMPLEXITY["MODERATE"]!;
  return defaultMs; // uses engine's configurable defaultTimeoutMs for complex tasks
}

export class ExecutionEngine {
  private readonly ollama: OllamaClient;
  private readonly packer: ContextPacker;
  private readonly gate: QualityGate;

  constructor(
    private readonly registry: ModelCapabilityRegistry,
    private readonly config: {
      defaultTimeoutMs: number;
      maxTimeoutMs: number;
      preWarmNextModel: boolean;
      ollamaBaseUrl: string;
      /** Enable cloud escalation when a provider adapter is wired in. Default: false. */
      cloudEscalation?: boolean;
    } = {
      defaultTimeoutMs: 120_000,
      maxTimeoutMs: 180_000,
      preWarmNextModel: true,
      ollamaBaseUrl: "http://localhost:11434",
    },
  ) {
    this.ollama = new OllamaClient(this.config.ollamaBaseUrl);
    this.packer = new ContextPacker(registry, {
      windowUseFactor: 0.75,
      compressionModel: "ollama:tinyllama:1.1b",
      ollamaBaseUrl: config.ollamaBaseUrl,
    });
    this.gate = new QualityGate();
  }

  async execute(graph: TaskGraph, localOnly = false): Promise<ExecutionResult> {
    assertNoCycle(graph);

    const results = new Map<string, NodeResult>();
    // Cycle check already performed above — skip the redundant DFS inside topologicalSort.
    const layers = topologicalSort(graph, { skipCycleCheck: true });
    let _parallelBatches = 0;

    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      if (!layer || layer.length === 0) continue;
      _parallelBatches++;

      // Pre-warm all distinct models in the next layer while current layer runs.
      // Capped at 3 to avoid flooding Ollama with concurrent load requests.
      if (this.config.preWarmNextModel && i + 1 < layers.length) {
        const nextLayer = layers[i + 1];
        if (nextLayer) {
          const distinct = [...new Set(nextLayer.map((n) => n.assignedModel))].slice(0, 3);
          for (const modelId of distinct) void this.preWarm(modelId);
        }
      }

      // Honour TaskNode.canRunParallel: if any node in this layer is marked as
      // non-parallel, run all nodes in the layer sequentially (in deterministic
      // priority order) to avoid concurrent side-effects.
      const hasNonParallel = layer.some((n) => n.canRunParallel === false);
      if (hasNonParallel) {
        for (const node of layer) {
          const r = await this.executeNode(node, results, localOnly);
          results.set(r.nodeId, r);
        }
      } else {
        const layerResults = await Promise.all(
          layer.map((node) => this.executeNode(node, results, localOnly)),
        );
        for (const r of layerResults) {
          results.set(r.nodeId, r);
        }
      }
    }

    const totalInputTokens = [...results.values()].reduce(
      (s, r) => s + r.tokensUsed.inputTokens,
      0,
    );
    const totalOutputTokens = [...results.values()].reduce(
      (s, r) => s + r.tokensUsed.outputTokens,
      0,
    );

    return {
      nodeResults: results,
      totalTokens: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      parallelBatches: _parallelBatches,
    };
  }

  private async executeNode(
    node: TaskNode,
    priorResults: Map<string, NodeResult>,
    localOnly = false,
  ): Promise<NodeResult> {
    // Redirect non-Ollama model IDs to a local model when:
    //   (a) localOnly is set (PII guard — never forward to remote), or
    //   (b) cloudEscalation is not enabled (offline-only engine, the default).
    // This keeps NodeResult.model honest: it always reflects the model that
    // was actually executed rather than a cloud assignment that never ran.
    const needsLocalRedirect =
      !node.assignedModel.startsWith("ollama:") &&
      (localOnly || this.config.cloudEscalation !== true);
    const effectiveNode: TaskNode = needsLocalRedirect
      ? {
          ...node,
          assignedModel: node.fallbackModel.startsWith("ollama:")
            ? node.fallbackModel
            : DEFAULT_NANO_MODEL,
        }
      : node;

    const packed = await this.packer.pack(effectiveNode, priorResults);
    const formattedContext = this.packer.format(packed);
    // Use node-level override first; fall back to complexity-based lookup;
    // use defaultTimeoutMs as the baseline for complex tasks so the config
    // field is actually wired in rather than dead.
    const timeoutMs = Math.min(
      effectiveNode.timeoutMs ||
        complexityToTimeout(effectiveNode.estimatedComplexity, this.config.defaultTimeoutMs),
      this.config.maxTimeoutMs,
    );

    let raw: ModelOutput;
    try {
      // Use a factory-based withTimeout so the AbortSignal is threaded into
      // callModel and down to the underlying fetch — cancelling the in-flight
      // HTTP request and freeing resources when the deadline fires.
      raw = await this.withTimeout(
        (signal) =>
          this.callModel(
            effectiveNode.assignedModel,
            packed.systemPrompt,
            formattedContext,
            timeoutMs,
            signal,
          ),
        timeoutMs,
      );
    } catch (err) {
      // callModel throws for non-Ollama models (cloud-only IDs) or on timeout/network errors.
      // Synthesise a zero-score result so handleFailure can route to cloud escalation or
      // return escalated:false honestly — rather than propagating the exception.
      const emptyRaw: ModelOutput = {
        content: "",
        usage: { inputTokens: 0, outputTokens: 0 },
        latencyMs: 0,
      };
      const failedValidation = { passed: false, score: 0, failedReason: String(err), output: "" };
      return this.handleFailure(
        effectiveNode,
        emptyRaw,
        failedValidation,
        priorResults,
        packed.totalTokens,
        localOnly,
      );
    }

    const validated = this.gate.validate(raw, effectiveNode.outputSchema);

    if (!validated.passed) {
      return this.handleFailure(
        effectiveNode,
        raw,
        validated,
        priorResults,
        packed.totalTokens,
        localOnly,
      );
    }

    return {
      nodeId: effectiveNode.id,
      output: validated.output,
      model: effectiveNode.assignedModel,
      tokensUsed: raw.usage,
      latencyMs: raw.latencyMs,
      packedTokens: packed.totalTokens,
      qualityScore: validated.score,
      qualityPassed: true,
      escalated: false,
    };
  }

  private async handleFailure(
    node: TaskNode,
    raw: ModelOutput,
    validation: { score: number; failedReason?: string | undefined; output: string },
    priorResults: Map<string, NodeResult>,
    packedTokens: number,
    localOnly = false,
  ): Promise<NodeResult> {
    // Path 1: Retry with same model (once) — only for Ollama models supported by this engine.
    // Guard against non-Ollama IDs before calling so we don't get a guaranteed throw.
    if (
      validation.score >= 0.5 &&
      node.retryCount < 1 &&
      node.assignedModel.startsWith("ollama:")
    ) {
      const retryNode: TaskNode = { ...node, retryCount: 1 };
      try {
        // Add explicit instruction to fix the failure; use a reduced timeout for retries.
        const retry = await this.callModel(
          node.assignedModel,
          node.outputSchema.format === "JSON"
            ? "You MUST return valid JSON only. No prose."
            : node.description,
          `Please retry. Previous attempt was: ${raw.content.slice(0, 200)}\n\nTask: ${node.description}`,
          Math.min(30_000, this.config.maxTimeoutMs),
        );

        const revalidated = this.gate.validate(retry, node.outputSchema);
        if (revalidated.passed) {
          return {
            nodeId: retryNode.id,
            output: revalidated.output,
            model: node.assignedModel,
            tokensUsed: retry.usage,
            latencyMs: retry.latencyMs,
            packedTokens,
            qualityScore: revalidated.score,
            qualityPassed: true,
            escalated: false,
          };
        }
      } catch {
        // Retry threw (timeout / OOM / network error) — fall through to cloud escalation.
      }
    }

    // Path 2: Escalate to cloud fallback.
    // Skipped when: (a) localOnly — PII guard forbids cloud, or
    //              (b) config.cloudEscalation is false (offline-only engine, default).
    // Set config.cloudEscalation = true when a cloud provider adapter is wired into callModel().
    if (localOnly || this.config.cloudEscalation !== true) {
      return {
        nodeId: node.id,
        output: raw.content,
        model: node.assignedModel,
        tokensUsed: raw.usage,
        latencyMs: raw.latencyMs,
        packedTokens,
        qualityScore: validation.score,
        qualityPassed: false,
        ...(validation.failedReason !== undefined && {
          qualityFailedReason: validation.failedReason,
        }),
        escalated: false,
      };
    }

    try {
      const cloudRaw = await this.callModel(
        CLOUD_FALLBACK_MODEL,
        `Complete this task: ${node.description}`,
        `Task: ${node.description}\n\nOutput format: ${node.outputSchema.format}`,
        Math.min(60_000, this.config.maxTimeoutMs),
      );
      return {
        nodeId: node.id,
        output: cloudRaw.content || raw.content,
        model: CLOUD_FALLBACK_MODEL,
        tokensUsed: cloudRaw.usage,
        latencyMs: cloudRaw.latencyMs,
        packedTokens,
        qualityScore: validation.score,
        qualityPassed: false,
        ...(validation.failedReason !== undefined && {
          qualityFailedReason: validation.failedReason,
        }),
        escalated: true,
      };
    } catch {
      // Cloud escalation failed (provider error) —
      // return the original local result so escalated: false is honest.
      return {
        nodeId: node.id,
        output: raw.content,
        model: node.assignedModel,
        tokensUsed: raw.usage,
        latencyMs: raw.latencyMs,
        packedTokens,
        qualityScore: validation.score,
        qualityPassed: false,
        ...(validation.failedReason !== undefined && {
          qualityFailedReason: validation.failedReason,
        }),
        escalated: false,
      };
    }
  }

  private async callModel(
    modelId: string,
    systemPrompt: string,
    userContent: string,
    timeoutMs = this.config.maxTimeoutMs,
    signal?: AbortSignal,
  ): Promise<ModelOutput> {
    const start = Date.now();

    // Only Ollama model IDs are supported by this engine.
    // Non-ollama IDs (cloud providers) should have been redirected to a local
    // model in executeNode before reaching here; if one slips through (e.g.
    // cloudEscalation=true with a real cloud adapter calling callModel directly)
    // throw so the caller can handle it properly rather than silently running
    // the wrong model and reporting misleading NodeResult metadata.
    if (!modelId.startsWith("ollama:")) {
      throw new Error(
        `Model '${modelId}' is not supported by the Ollama execution engine. ` +
          `Wire a cloud provider adapter or set cloudEscalation to false.`,
      );
    }

    const result = await this.ollama.complete({
      model: modelId,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      temperature: 0.2,
      timeoutMs,
      ...(signal !== undefined && { signal }),
    });

    return {
      content: result.content,
      usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
      latencyMs: Date.now() - start,
    };
  }

  /**
   * Run `fn` with an AbortSignal; abort (and cancel the underlying request)
   * if the deadline fires before `fn` resolves. The signal is threaded into
   * the fetch layer so the HTTP connection is actually torn down on timeout.
   */
  private async withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new Error(`Node execution timed out after ${ms}ms`)),
      ms,
    );
    try {
      return await fn(controller.signal);
    } finally {
      clearTimeout(timer);
    }
  }

  private async preWarm(modelId: string): Promise<void> {
    if (!modelId.startsWith("ollama:")) return;
    try {
      // Fire a tiny request to load the model into RAM while current layer runs
      await this.ollama.complete({
        model: modelId,
        messages: [{ role: "user", content: "ping" }],
        timeoutMs: 10_000,
      });
    } catch {
      // Pre-warm failure is non-fatal
    }
  }
}
