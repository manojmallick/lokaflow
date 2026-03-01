// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaFlow™ — lokaflow.io
//
// packages/agent/src/decomposer/interim-decomposer.ts
// Interim decomposer — uses qwen2.5:7b to produce decomposition JSON.
// Swappable with LokaLLMDecomposer via config: agent.decomposer: 'lokallm'.

import { z } from "zod";
import type { TaskGraph, TaskNode, IntentProfile, TaskEdge } from "../types/agent.js";
import { OllamaClient } from "../utils/ollama.js";
import { DECOMPOSER_MODEL } from "../registry/interim-models.js";
import { DECOMPOSITION_SYSTEM_PROMPT, buildDecompositionPrompt } from "./prompts/decomposition.js";
import type { ModelCapabilityRegistry } from "../registry/model-registry.js";
import type { WarmModelTracker } from "../registry/warm-tracker.js";
import { estimateTokens } from "../utils/tokens.js";

// ---------------------------------------------------------------------------
// Zod schema — strict validation of decomposer output
// ---------------------------------------------------------------------------

const SubtaskSchema = z.object({
  id: z.string(),
  description: z.string().max(300),
  input_context: z.string().max(200),
  output_schema: z.string().max(200),
  assigned_model: z.string(),
  estimated_complexity: z.number().min(0).max(1),
  depends_on: z.array(z.string()),
  can_run_parallel: z.boolean(),
  token_budget: z.object({
    input_max: z.number().max(50000),
    output_max: z.number().max(4000),
  }),
});

const DecompositionOutputSchema = z.object({
  decomposition_rationale: z.string().max(300),
  intent_preserved: z.boolean(),
  subtasks: z.array(SubtaskSchema).min(2).max(6),
});

type DecompositionOutput = z.infer<typeof DecompositionOutputSchema>;

// ---------------------------------------------------------------------------
// InterimDecomposer
// ---------------------------------------------------------------------------

export class InterimDecomposer {
  private readonly ollama: OllamaClient;

  constructor(
    private readonly registry: ModelCapabilityRegistry,
    private readonly warmTracker: WarmModelTracker,
    private readonly config = {
      decomposerModel: DECOMPOSER_MODEL,
      ollamaBaseUrl: "http://localhost:11434",
      maxRetries: 1,
    },
  ) {
    this.ollama = new OllamaClient(this.config.ollamaBaseUrl);
  }

  async decompose(
    task: string,
    intent: IntentProfile,
    complexityIndex: number,
    graphId: string,
    depth = 0,
  ): Promise<TaskGraph> {
    const raw = await this.callDecomposer(task, intent, complexityIndex);
    return this.buildGraph(raw, task, intent, graphId, depth);
  }

  private async callDecomposer(
    task: string,
    intent: IntentProfile,
    complexityIndex: number,
  ): Promise<DecompositionOutput> {
    // Build condensed model capability JSON (lean — max ~400 tokens)
    const modelCapabilityJson = JSON.stringify(
      this.registry.getAvailable().map((m) => ({
        id: m.id,
        tier: m.tier,
        contextTokens: m.contextTokens,
        capabilities: m.capabilities,
      })),
      null,
      0,
    ).slice(0, 1600); // hard cap

    const warmModels = this.warmTracker.getWarmModels();
    const userPrompt = buildDecompositionPrompt(
      task,
      JSON.stringify({ primaryGoal: intent.primaryGoal, outputType: intent.outputType }),
      complexityIndex,
      modelCapabilityJson,
      warmModels,
    );

    let lastError: unknown;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      const retryInstruction =
        attempt > 0
          ? "\n\nYour previous response was not valid JSON. Return ONLY the JSON object."
          : "";

      try {
        const result = await this.ollama.complete({
          model: this.config.decomposerModel,
          messages: [
            { role: "system", content: DECOMPOSITION_SYSTEM_PROMPT },
            { role: "user", content: userPrompt + retryInstruction },
          ],
          temperature: 0.1,
          timeoutMs: 30_000,
        });

        const content = result.content.trim();
        // Strip possible markdown fences
        const jsonStr = content
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```$/i, "")
          .trim();
        const parsed = JSON.parse(jsonStr) as unknown;
        return DecompositionOutputSchema.parse(parsed);
      } catch (err) {
        lastError = err;
      }
    }

    // Both attempts failed — fall back to heuristic decomposition
    return this.heuristicDecompose(task, intent);
  }

  /**
   * Heuristic fallback: produces a minimal 2-subtask split when the model fails.
   */
  private heuristicDecompose(task: string, intent: IntentProfile): DecompositionOutput {
    return {
      decomposition_rationale: "Heuristic fallback: model decomposition failed",
      intent_preserved: true,
      subtasks: [
        {
          id: "t1",
          description: `Analyse and extract key information: ${task.slice(0, 100)}`,
          input_context: "Original task",
          output_schema: "JSON object with key findings",
          assigned_model: "ollama:qwen2.5:7b",
          estimated_complexity: 0.6,
          depends_on: [],
          can_run_parallel: true,
          token_budget: { input_max: 4000, output_max: 1000 },
        },
        {
          id: "t2",
          description: `Synthesise and format the final response for: ${intent.primaryGoal.slice(0, 100)}`,
          input_context: "Output from t1",
          output_schema: `${intent.outputType} format`,
          assigned_model: "ollama:qwen2.5:7b",
          estimated_complexity: 0.5,
          depends_on: ["t1"],
          can_run_parallel: false,
          token_budget: { input_max: 3000, output_max: 2000 },
        },
      ],
    };
  }

  private buildGraph(
    raw: DecompositionOutput,
    originalPrompt: string,
    intent: IntentProfile,
    graphId: string,
    depth: number,
  ): TaskGraph {
    const now = new Date();

    const nodes: TaskNode[] = raw.subtasks.map((s) => ({
      id: s.id,
      graphId,
      depth,
      description: s.description,
      inputContext: s.input_context,
      outputSchema: {
        format: "PLAIN" as const,
        requiredElements: [],
        maxTokens: s.token_budget.output_max,
      },
      assignedModel: s.assigned_model,
      fallbackModel: "anthropic:claude-sonnet-4",
      estimatedComplexity: s.estimated_complexity,
      tokenBudget: {
        inputMax: s.token_budget.input_max,
        outputMax: s.token_budget.output_max,
      },
      timeoutMs: 120_000,
      retryCount: 0,
      canRunParallel: s.can_run_parallel,
      status: "PENDING" as const,
      dependsOn: s.depends_on,
      taskType: "reasoning" as const,
    }));

    const edges: TaskEdge[] = raw.subtasks.flatMap((s) =>
      s.depends_on.map((dep) => ({ from: dep, to: s.id })),
    );

    return {
      id: graphId,
      originalPrompt,
      intent,
      nodes,
      edges,
      depth,
      intentPreserved: raw.intent_preserved,
      createdAt: now,
    };
  }
}
