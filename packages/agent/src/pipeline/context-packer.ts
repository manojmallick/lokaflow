// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaFlow™ — lokaflow.io
//
// packages/agent/src/pipeline/context-packer.ts
// Stage 5 — ContextPacker: pack per-subtask context within model window budget.
// Rule: packed_tokens ≤ model.context_limit × 0.75
// Never pass raw upstream output — always compress first.

import type { TaskNode, PackedContext, NodeResult, DependencyOutput } from "../types/agent.js";
import type { ModelCapabilityRegistry } from "../registry/model-registry.js";
import { OllamaClient } from "../utils/ollama.js";
import { DEFAULT_NANO_MODEL } from "../registry/interim-models.js";
import { estimateTokens, usableTokenBudget } from "../utils/tokens.js";

export class ContextPacker {
  private readonly ollama: OllamaClient;

  constructor(
    private readonly registry: ModelCapabilityRegistry,
    private readonly config = {
      windowUseFactor: 0.75,
      compressionModel: DEFAULT_NANO_MODEL,
      ollamaBaseUrl: "http://localhost:11434",
    },
  ) {
    this.ollama = new OllamaClient(this.config.ollamaBaseUrl);
  }

  async pack(node: TaskNode, priorResults: Map<string, NodeResult>): Promise<PackedContext> {
    const contextLimit = this.registry.contextTokens(node.assignedModel);
    const usable = usableTokenBudget(contextLimit, this.config.windowUseFactor);
    const outputReserve = Math.floor(usable * 0.25); // reserve 25% for output
    const inputBudget = usable - outputReserve;

    const systemPrompt = this.buildSystemPrompt(node);
    const taskDesc = node.description;
    const outputSchemaStr = this.outputSchemaToString(node);
    // Clamp the instructed output limit to the reserved output window,
    // the node's token budget, and any schema-level limit — whichever is smallest.
    const effectiveOutputMax = Math.max(
      1,
      Math.min(outputReserve, node.outputSchema.maxTokens, node.tokenBudget.outputMax),
    );
    const tokenBudgetInstruction = `Your response MUST be under ${effectiveOutputMax} tokens.`;

    let tokenSoFar =
      estimateTokens(systemPrompt) +
      estimateTokens(taskDesc) +
      estimateTokens(outputSchemaStr) +
      estimateTokens(tokenBudgetInstruction);

    // Collect dependency outputs (compressed to fit)
    const dependencyOutputs: DependencyOutput[] = [];
    for (const depId of node.dependsOn) {
      const depResult = priorResults.get(depId);
      if (!depResult) continue;

      const remainingBudget = Math.floor((inputBudget - tokenSoFar) * 0.6);
      if (remainingBudget < 50) break;

      const compressed = await this.compress(depResult.output, remainingBudget);
      const tokens = estimateTokens(compressed);
      dependencyOutputs.push({ taskId: depId, summary: compressed, tokenCount: tokens });
      tokenSoFar += tokens;
    }

    // Relevant context: use the decomposer-provided inputContext for this node.
    // Compress it if needed so it fits in the remaining input budget.
    let relevantContext = "";
    if (node.inputContext) {
      const remainingBudget = inputBudget - tokenSoFar;
      if (remainingBudget > 0) {
        const compressedContext = await this.compress(node.inputContext, remainingBudget);
        relevantContext = compressedContext;
        tokenSoFar += estimateTokens(compressedContext);
      }
    }
    const total = tokenSoFar;

    return {
      systemPrompt,
      taskDescription: taskDesc,
      outputSchema: outputSchemaStr,
      tokenBudgetInstruction,
      dependencyOutputs,
      relevantContext,
      totalTokens: total,
    };
  }

  /**
   * Formats a PackedContext into the final string sent to the model.
   */
  format(packed: PackedContext): string {
    const parts: string[] = [];
    if (packed.dependencyOutputs.length > 0) {
      parts.push("## Prior step outputs:");
      for (const dep of packed.dependencyOutputs) {
        parts.push(`### Step ${dep.taskId}:\n${dep.summary}`);
      }
    }
    if (packed.relevantContext) {
      parts.push("## Context:\n" + packed.relevantContext);
    }
    parts.push("## Task:\n" + packed.taskDescription);
    parts.push("## Output format:\n" + packed.outputSchema);
    parts.push(packed.tokenBudgetInstruction);
    return parts.join("\n\n");
  }

  private buildSystemPrompt(node: TaskNode): string {
    return `You are an AI assistant completing one specific subtask.
Follow the output format exactly. Be concise — do not add explanations not requested.
Output format: ${node.outputSchema.format}`;
  }

  private outputSchemaToString(node: TaskNode): string {
    const req = node.outputSchema.requiredElements.join(", ");
    return `Format: ${node.outputSchema.format}${req ? ". Required elements: " + req : ""}. Max tokens: ${node.outputSchema.maxTokens}.`;
  }

  private async compress(text: string, targetTokens: number): Promise<string> {
    if (estimateTokens(text) <= targetTokens) return text;

    // Strategy 1: Structural extraction (no model)
    const structured = this.extractStructure(text);
    if (estimateTokens(structured) <= targetTokens) return structured;

    // Strategy 2: LOCAL_NANO summarisation
    try {
      const result = await this.ollama.complete({
        model: this.config.compressionModel,
        messages: [
          {
            role: "system",
            content:
              "Summarise the following text concisely. Preserve all facts, decisions, and specific values. Remove only prose padding. Return only the summary.",
          },
          {
            role: "user",
            content: text.slice(0, 6000), // safety cap for nano model
          },
        ],
        temperature: 0.1,
        timeoutMs: 20_000,
      });
      return result.content;
    } catch {
      // Can't compress — return truncated original
      const avgChars = 4.0;
      return text.slice(0, targetTokens * avgChars) + "\n[...truncated]";
    }
  }

  /**
   * Extracts structure from text: headers, bullets, numbered items.
   * No model call — fast structural extraction.
   */
  private extractStructure(text: string): string {
    const lines = text.split("\n");
    const structural = lines.filter(
      (l) =>
        /^#+\s/.test(l) || // markdown headers
        /^\s*[-*•]\s/.test(l) || // bullets
        /^\s*\d+\.\s/.test(l) || // numbered
        /^\s*[A-Z][^.!?]*[:.]\s*$/.test(l), // label lines
    );
    return structural.join("\n") || text.slice(0, 800);
  }
}
