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

const TIMEOUT_BY_COMPLEXITY: Record<string, number> = {
  TRIVIAL: 30_000,
  MODERATE: 60_000,
  COMPLEX: 120_000,
  MAX: 180_000,
};

function complexityToTimeout(complexity: number): number {
  if (complexity < 0.35) return TIMEOUT_BY_COMPLEXITY["TRIVIAL"]!;
  if (complexity < 0.55) return TIMEOUT_BY_COMPLEXITY["MODERATE"]!;
  return TIMEOUT_BY_COMPLEXITY["COMPLEX"]!;
}

export class ExecutionEngine {
  private readonly ollama: OllamaClient;
  private readonly packer: ContextPacker;
  private readonly gate: QualityGate;

  constructor(
    private readonly registry: ModelCapabilityRegistry,
    private readonly config = {
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
    const layers = topologicalSort(graph);
    let _parallelBatches = 0;

    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      if (!layer || layer.length === 0) continue;
      _parallelBatches++;

      // Pre-warm next layer's model while current layer runs (overlaps cold-start)
      if (this.config.preWarmNextModel && i + 1 < layers.length) {
        const nextLayer = layers[i + 1];
        if (nextLayer && nextLayer[0]) {
          void this.preWarm(nextLayer[0].assignedModel);
        }
      }

      const layerResults = await Promise.all(
        layer.map((node) => this.executeNode(node, results, localOnly)),
      );
      for (const r of layerResults) {
        results.set(r.nodeId, r);
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
    };
  }

  private async executeNode(
    node: TaskNode,
    priorResults: Map<string, NodeResult>,
    localOnly = false,
  ): Promise<NodeResult> {
    // Enforce localOnly (PII guard): if the task graph assigned a cloud model,
    // redirect to the node's local fallback (or DEFAULT_NANO_MODEL) so that
    // PII-detected prompts are never forwarded to a remote provider.
    const effectiveNode: TaskNode =
      localOnly && !node.assignedModel.startsWith("ollama:")
        ? {
            ...node,
            assignedModel:
              node.fallbackModel.startsWith("ollama:") ? node.fallbackModel : DEFAULT_NANO_MODEL,
          }
        : node;

    const packed = await this.packer.pack(effectiveNode, priorResults);
    const formattedContext = this.packer.format(packed);
    const timeoutMs = Math.min(
      effectiveNode.timeoutMs || complexityToTimeout(effectiveNode.estimatedComplexity),
      this.config.maxTimeoutMs,
    );

    const raw = await this.withTimeout(
      this.callModel(effectiveNode.assignedModel, packed.systemPrompt, formattedContext),
      timeoutMs,
    );

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
    // Path 1: Retry with same model (once)
    if (validation.score >= 0.5 && node.retryCount < 1) {
      const retryNode: TaskNode = { ...node, retryCount: 1 };
      // Add explicit instruction to fix the failure
      const retry = await this.callModel(
        node.assignedModel,
        node.outputSchema.format === "JSON"
          ? "You MUST return valid JSON only. No prose."
          : node.description,
        `Please retry. Previous attempt was: ${raw.content.slice(0, 200)}\n\nTask: ${node.description}`,
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
          escalated: false,
        };
      }
    }

    // Path 2: Escalate to cloud fallback — skip if localOnly (PII guard)
    if (localOnly) {
      return {
        nodeId: node.id,
        output: raw.content,
        model: node.assignedModel,
        tokensUsed: raw.usage,
        latencyMs: raw.latencyMs,
        packedTokens,
        qualityScore: validation.score,
        escalated: false,
      };
    }

    const cloudRaw = await this.callModel(
      CLOUD_FALLBACK_MODEL,
      `Complete this task: ${node.description}`,
      `Task: ${node.description}\n\nOutput format: ${node.outputSchema.format}`,
    ).catch(() => raw); // if cloud also fails, use original raw

    return {
      nodeId: node.id,
      output: cloudRaw.content || raw.content,
      model: CLOUD_FALLBACK_MODEL,
      tokensUsed: cloudRaw.usage,
      latencyMs: cloudRaw.latencyMs,
      packedTokens,
      qualityScore: validation.score,
      escalated: true,
    };
  }

  private async callModel(
    modelId: string,
    systemPrompt: string,
    userContent: string,
  ): Promise<ModelOutput> {
    const start = Date.now();

    // Cloud models not handled by OllamaClient — signal failure so the caller can fall back
    if (!modelId.startsWith("ollama:")) {
      throw new Error(`Cloud model '${modelId}' is not available via OllamaClient (offline mode).`);
    }

    const result = await this.ollama.complete({
      model: modelId,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      temperature: 0.2,
      timeoutMs: this.config.maxTimeoutMs,
    });

    return {
      content: result.content,
      usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
      latencyMs: Date.now() - start,
    };
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Node execution timed out after ${ms}ms`)), ms);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
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
