// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
//
// packages/orchestrator/src/pipeline/pipeline.ts
// OrchestratorPipeline — The main entry point. Executes the full Plan → Execute → Verify → Assemble DAG.

import type { Message } from "../../../src/types.js";
import type { OrchestrationResult, TaskGraph, TaskNode, TierLevel } from "../types.js";
import { TaskDecomposer } from "../decomposer/decomposer.js";
import { TokenBudgetAllocator } from "../budget/allocator.js";
import { ModelRegistry, type ModelProfile } from "../models/registry.js";

// We assume these are passed in from Core
interface ProviderApi {
    name: string;
    complete(messages: Message[]): Promise<{ content: string; inputTokens: number; outputTokens: number }>;
}

export interface PipelineOptions {
    specialistProvider: ProviderApi;
    localProviders: ProviderApi[];
    cloudProvider: ProviderApi; // The primary fallback cloud provider if needed
    maxDepth?: number;
    totalTokenBudget?: number;
}

export class OrchestratorPipeline {
    private readonly decomposer: TaskDecomposer;
    private readonly allocator: TokenBudgetAllocator;
    private readonly registry: ModelRegistry;

    constructor(private readonly opts: PipelineOptions) {
        this.decomposer = new TaskDecomposer(opts.specialistProvider);
        this.allocator = new TokenBudgetAllocator();
        this.registry = new ModelRegistry();
    }

    async run(query: string): Promise<OrchestrationResult> {
        const startTime = Date.now();
        const stats = { localPrompt: 0, localCompletion: 0, cloudPrompt: 0, cloudCompletion: 0, savedEur: 0 };
        const subtaskResults: Record<string, { tier: TierLevel; latencyMs: number }> = {};
        const subtaskOutputs: Record<string, string> = {};

        // ── 1. PLAN (Decompose into DAG) ──────────────────────────────────────────
        let graph = await this.decomposer.decompose(query, this.opts.maxDepth ?? 3);

        // ── 2. BUDGET (Allocate tokens per node) ──────────────────────────────────
        graph = this.allocator.allocate(graph, this.opts.totalTokenBudget ?? 8000);

        // ── 3. EXECUTE (Parallel DAG traversal) ───────────────────────────────────
        await this._executeDag(graph, subtaskOutputs, subtaskResults, stats);

        // ── 4. ASSEMBLE (Final compilation) ───────────────────────────────────────
        // Assembly is a trivial task — use the fastest/cheapest local model
        const assembleTime = Date.now();
        const finalOutput = await this._assembleResults(query, subtaskOutputs, graph.nodes.map(n => n.id));
        const latencyEnd = Date.now();

        // Mock tracking the final assembly token usage
        stats.localPrompt += 1000;
        stats.localCompletion += 500;
        subtaskResults["_assemble"] = { tier: "local_nano", latencyMs: latencyEnd - assembleTime };

        return {
            planId: graph.planId,
            finalOutput,
            totalLatencyMs: latencyEnd - startTime,
            tokenStats: {
                localPrompt: stats.localPrompt,
                localCompletion: stats.localCompletion,
                cloudPrompt: stats.cloudPrompt,
                cloudCompletion: stats.cloudCompletion,
                savedVsNaiveCloudEur: Number(stats.savedEur.toFixed(6)),
            },
            subtaskResults,
        };
    }

    /** Visits the DAG nodes in topological order, executing parallel layers concurrently */
    private async _executeDag(
        graph: TaskGraph,
        outputs: Record<string, string>,
        results: Record<string, { tier: TierLevel; latencyMs: number }>,
        stats: { localPrompt: number; localCompletion: number; cloudPrompt: number; cloudCompletion: number; savedEur: number }
    ): Promise<void> {
        const uncompleted = new Set(graph.nodes.map(n => n.id));
        const inProgress = new Set<string>();

        // We keep looping until all nodes are completed
        while (uncompleted.size > 0) {
            // Find all nodes whose dependencies are met and are not already in progress
            const readyNodes = graph.nodes.filter(
                n => uncompleted.has(n.id) && !inProgress.has(n.id) && n.dependsOn.every(dep => !uncompleted.has(dep))
            );

            if (readyNodes.length === 0 && inProgress.size > 0) {
                // We are waiting on running tasks — sleep briefly and poll (in a real system, we'd use Promise handlers)
                await new Promise(resolve => setTimeout(resolve, 50));
                continue;
            } else if (readyNodes.length === 0) {
                // Deadlock detected, bail out
                throw new Error("DAG Execution Deadlock: Unresolved dependencies.");
            }

            // Execute ready nodes concurrently
            const executions = readyNodes.map(async node => {
                inProgress.add(node.id);
                const nodeStart = Date.now();

                // 1. Determine tier based on complexity
                let assignedTier: TierLevel = "local_standard";
                if (node.complexityScore > 0.8) assignedTier = "cloud_standard";
                else if (node.complexityScore > 0.6) assignedTier = "cloud_light";
                else if (node.complexityScore < 0.3) assignedTier = "local_nano";

                // 2. Select appropriate provider
                let provider: ProviderApi;
                let isCloud = false;

                if (assignedTier.startsWith("cloud")) {
                    // Cloud fallback requested (e.g. GPT-4o)
                    provider = this.opts.cloudProvider;
                    isCloud = true;
                    // Calculate savings — if we used naive cloud logic, EVERYTHING would be sent to cloud.
                    // Since this node is genuinely complex, savings = 0 (we had to use cloud anyway).
                } else {
                    // Local execution requested. Find a local provider with the required capability.
                    provider = this.opts.localProviders[0] ?? this.opts.specialistProvider;

                    // Calculate savings: we avoided sending this subtask to the cloud
                    // Assume average Cloud Sonnet pricing for savings calculation:
                    // In: €0.0028/1K, Out: €0.014/1K
                    // Assuming ~800 tokens avg per subtask (500 in, 300 out) = €0.0056 saved per local chunk
                    stats.savedEur += 0.0056;
                }

                // 3. Build prompt including dependency outputs
                let context = "";
                for (const depId of node.dependsOn) {
                    context += `\n\n--- Output from dependency [${depId}] ---\n${outputs[depId]}`;
                }

                const prompt = `Subtask: ${node.description}\nContext:${context}\n\nExecute the subtask. Focus only on the requested output. Budget: ${node.budgetTokens} tokens.`;

                // 4. Execute
                let outputText = "Fallback output";
                try {
                    const res = await provider.complete([{ role: "user", content: prompt }]);
                    outputText = res.content;

                    if (isCloud) {
                        stats.cloudPrompt += res.inputTokens;
                        stats.cloudCompletion += res.outputTokens;
                    } else {
                        stats.localPrompt += res.inputTokens;
                        stats.localCompletion += res.outputTokens;
                    }
                } catch (err) {
                    outputText = `[Error executing subtask: ${String(err)}]`;
                }

                outputs[node.id] = outputText;
                results[node.id] = { tier: assignedTier, latencyMs: Date.now() - nodeStart };

                uncompleted.delete(node.id);
                inProgress.delete(node.id);
            });

            // Wait for all ready nodes in this "layer" to finish
            // (This is a simplified barrier-synchronization approach. A truer parallel runner
            // would fire and forget, letting callbacks unblock dependents individually).
            await Promise.allSettled(executions);
        }
    }

    private async _assembleResults(originalQuery: string, outputs: Record<string, string>, nodeIds: string[]): Promise<string> {
        const provider = this.opts.localProviders[0] ?? this.opts.specialistProvider;

        let context = "";
        for (const id of nodeIds) {
            context += `\n\n--- Output part [${id}] ---\n${outputs[id]}`;
        }

        const prompt = `You are the Assembler. The user originally asked: "${originalQuery}"\n\nBelow are the outputs from parallel subtasks resolving this query:\n${context}\n\nMerge and format these pieces into a single, cohesive, excellent final response to the user. Do not mention "subtasks" or the assembly process. Just provide the final answer.`;

        try {
            const res = await provider.complete([{ role: "user", content: prompt }]);
            return res.content;
        } catch (err) {
            return "Assembly failed. " + String(err);
        }
    }
}
