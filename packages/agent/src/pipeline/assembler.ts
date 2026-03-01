// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaFlow™ — lokaflow.io
//
// packages/agent/src/pipeline/assembler.ts
// Stage 8 — Assembler: merge all completed node outputs into a single final response.
// Assembly always uses LOCAL_NANO — never cloud. Returns FinalOutput + AgentTrace.

import type {
  AssemblyStrategy,
  NodeResult,
  FinalOutput,
  IntentProfile,
  AgentTrace,
  AgentMetrics,
  AssemblyTrace,
} from "../types/agent.js";
import { OllamaClient } from "../utils/ollama.js";
import { DEFAULT_NANO_MODEL } from "../registry/interim-models.js";

export class Assembler {
  private readonly ollama: OllamaClient;

  constructor(
    private readonly config = {
      synthesisModel: DEFAULT_NANO_MODEL,
      ollamaBaseUrl: "http://localhost:11434",
    },
  ) {
    this.ollama = new OllamaClient(this.config.ollamaBaseUrl);
  }

  async assemble(
    results: Map<string, NodeResult>,
    strategy: AssemblyStrategy,
    intent: IntentProfile,
    partialTrace: Omit<AgentTrace, "assembly" | "savings"> & { savings?: AgentTrace["savings"] },
    dependencyOrder: string[],
  ): Promise<FinalOutput> {
    const ordered = this.orderResults(results, dependencyOrder);
    let content: string;
    let usedSynthesis = false;

    if (strategy === "SYNTHESIS") {
      content = await this.synthesise(ordered, intent);
      usedSynthesis = true;
    } else if (strategy === "CODE_MERGE") {
      content = this.codeMerge(ordered);
    } else if (strategy === "EXTRACTIVE") {
      content = this.extractive(ordered);
    } else {
      // SEQUENTIAL | HIERARCHICAL
      content = this.concatenate(ordered, intent);
    }

    const assembly: AssemblyTrace = {
      strategy,
      usedSynthesisModel: usedSynthesis,
    };

    const savings = partialTrace.savings ?? this.buildSavingsTrace(results);
    const metrics = this.buildMetrics(results);

    const trace: AgentTrace = {
      ...(partialTrace as Omit<AgentTrace, "assembly" | "savings">),
      assembly,
      savings,
    };

    return { content, trace, metrics };
  }

  private async synthesise(ordered: NodeResult[], intent: IntentProfile): Promise<string> {
    const inputs = ordered.map((r, i) => `[Step ${i + 1}]\n${r.output}`).join("\n\n---\n\n");

    try {
      const result = await this.ollama.complete({
        model: this.config.synthesisModel,
        messages: [
          {
            role: "system",
            content:
              "You are a document assembler. Combine the following sections into a single coherent response. Preserve all facts. Fix transitions. Do not add new information.",
          },
          {
            role: "user",
            content: `Goal: ${intent.primaryGoal}\n\nSections to combine:\n\n${inputs.slice(0, 4000)}`,
          },
        ],
        temperature: 0.2,
        timeoutMs: 30_000,
      });
      return result.content;
    } catch {
      return this.concatenate(ordered, intent);
    }
  }

  private concatenate(ordered: NodeResult[], _intent: IntentProfile): string {
    return ordered.map((r) => r.output.trim()).join("\n\n");
  }

  private codeMerge(ordered: NodeResult[]): string {
    return ordered.map((r) => r.output.trim()).join("\n\n// ─── next section ───\n\n");
  }

  private extractive(ordered: NodeResult[]): string {
    // Pull out JSON fields from each result and merge
    const merged: Record<string, unknown> = {};
    for (const result of ordered) {
      try {
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        Object.assign(merged, parsed);
      } catch {
        merged[`section_${result.nodeId}`] = result.output;
      }
    }
    return JSON.stringify(merged, null, 2);
  }

  private orderResults(results: Map<string, NodeResult>, order: string[]): NodeResult[] {
    const ordered: NodeResult[] = [];
    for (const id of order) {
      const r = results.get(id);
      if (r) ordered.push(r);
    }
    // Any remaining nodes not in the order list
    for (const [id, r] of results) {
      if (!order.includes(id)) ordered.push(r);
    }
    return ordered;
  }

  private buildSavingsTrace(results: Map<string, NodeResult>): AgentTrace["savings"] {
    const nodes = [...results.values()];
    const escalated = nodes.filter((n) => n.escalated === true);
    const localTokens = nodes
      .filter((n) => !n.escalated)
      .reduce((s, n) => s + n.tokensUsed.inputTokens + n.tokensUsed.outputTokens, 0);
    const cloudTokens = escalated.reduce(
      (s, n) => s + n.tokensUsed.inputTokens + n.tokensUsed.outputTokens,
      0,
    );
    const cloudEquiv = (localTokens + cloudTokens) * 1.0; // estimate: if all cloud
    const savingPercent = cloudEquiv > 0 ? ((cloudEquiv - cloudTokens) / cloudEquiv) * 100 : 0;
    return {
      totalNodes: nodes.length,
      localNodes: nodes.length - escalated.length,
      cloudNodes: escalated.length,
      escalatedNodes: escalated.length,
      cloudEquivalentTokens: cloudEquiv,
      actualLocalTokens: localTokens,
      actualCloudTokens: cloudTokens,
      savingPercent,
      savingEur: (localTokens / 1000) * 0.0 + (cloudTokens / 1000) * 0.003,
    };
  }

  private buildMetrics(results: Map<string, NodeResult>): AgentMetrics {
    const nodes = [...results.values()];
    const totalInputTokens = nodes.reduce((s, n) => s + n.tokensUsed.inputTokens, 0);
    const totalOutputTokens = nodes.reduce((s, n) => s + n.tokensUsed.outputTokens, 0);
    const nodesEscalated = nodes.filter((n) => n.escalated).length;
    // Latency: sum of sequential layers — simplified to max latency observed
    const totalLatencyMs = Math.max(...nodes.map((n) => n.latencyMs), 0);

    return {
      totalLatencyMs,
      totalInputTokens,
      totalOutputTokens,
      nodesExecuted: nodes.length,
      nodesEscalated,
      estimatedCostEur: (totalInputTokens / 1000) * 0.002 + nodesEscalated * 0.003,
    };
  }
}
