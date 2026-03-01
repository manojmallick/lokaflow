// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
//
// packages/orchestrator/src/decomposer/decomposer.ts
// TaskDecomposer — translates a complex user query into a Directed Acyclic Graph (DAG)
// of subtasks using a Specialist LLM. Replaces V1's flat subtask array.

import type { Message } from "../../../src/types.js";
import type { TaskGraph, TaskNode } from "../types.js";

// We assume a specialist provider (e.g. Gemini 2.0 Flash) is passed in
interface SpecialistProvider {
    complete(messages: Message[]): Promise<{ content: string; inputTokens: number; outputTokens: number }>;
}

export class TaskDecomposer {
    constructor(private readonly specialist: SpecialistProvider) { }

    async decompose(originalQuery: string, maxDepth: number = 3): Promise<TaskGraph> {
        const systemPrompt = `You are the LokaOrchestrator Task Decomposer.
Your job is to break down a complex user query into a Directed Acyclic Graph (DAG) of subtasks.
Minimize dependencies where possible to maximize parallel execution.
Limit the depth to ${maxDepth}. Limit total nodes to 8.

Respond ONLY with valid JSON in this exact format, no markdown blocks:
{
  "nodes": [
    {
      "id": "fetch_data",
      "description": "Scrape the current pricing from example.com",
      "dependsOn": [],
      "requiredCapabilities": ["web_search"]
    },
    {
      "id": "analyze_competitors",
      "description": "Find competitor pricing",
      "dependsOn": [],
      "requiredCapabilities": ["web_search"]
    },
    {
      "id": "compare_pricing",
      "description": "Compare fetched data with competitor pricing and generate a summary table",
      "dependsOn": ["fetch_data", "analyze_competitors"],
      "requiredCapabilities": ["reasoning", "formatting"]
    }
  ],
  "criticalPathLength": 2
}`;

        const messages: Message[] = [
            { role: "system", content: systemPrompt },
            { role: "user", content: originalQuery },
        ];

        try {
            const response = await this.specialist.complete(messages);

            // Clean up potential markdown formatting
            let rawJson = response.content.trim();
            if (rawJson.startsWith("```json")) rawJson = rawJson.slice(7);
            if (rawJson.startsWith("```")) rawJson = rawJson.slice(3);
            if (rawJson.endsWith("```")) rawJson = rawJson.slice(0, -3);

            const parsed = JSON.parse(rawJson) as { nodes: Omit<TaskNode, "complexityScore">[]; criticalPathLength: number };

            // Validate DAG structure (prevent cycles, check dependants exist)
            this._validateDagOrThrow(parsed.nodes);

            // Enhance with basic mock complexity scores (real implementation would call ComplexityMeasurer per node)
            const nodes: TaskNode[] = parsed.nodes.map(n => ({
                ...n,
                complexityScore: Math.random() * 0.5 + 0.2, // Mock 0.2 - 0.7 score
            }));

            return {
                planId: crypto.randomUUID(),
                originalQuery,
                nodes,
                criticalPathLength: parsed.criticalPathLength || 1,
            };

        } catch (err) {
            // Fallback: don't decompose, just return a single node graph
            return {
                planId: crypto.randomUUID(),
                originalQuery,
                nodes: [{
                    id: "main_task",
                    description: originalQuery,
                    dependsOn: [],
                    complexityScore: 0.8,
                    requiredCapabilities: ["reasoning"],
                }],
                criticalPathLength: 1,
            };
        }
    }

    private _validateDagOrThrow(nodes: Array<{ id: string; dependsOn: string[] }>): void {
        const nodeIds = new Set(nodes.map(n => n.id));

        for (const node of nodes) {
            for (const dep of node.dependsOn) {
                if (!nodeIds.has(dep)) throw new Error(`Dependency ${dep} not found in graph`);
            }
        }

        // Simple cycle detection (Kahn's algorithm)
        const inDegree = new Map<string, number>();
        nodes.forEach(n => inDegree.set(n.id, n.dependsOn.length));

        const queue = nodes.filter(n => inDegree.get(n.id) === 0).map(n => n.id);
        let visitedCount = 0;

        while (queue.length > 0) {
            const current = queue.shift()!;
            visitedCount++;

            nodes.filter(n => n.dependsOn.includes(current)).forEach(n => {
                const currentInDegree = inDegree.get(n.id)! - 1;
                inDegree.set(n.id, currentInDegree);
                if (currentInDegree === 0) queue.push(n.id);
            });
        }

        if (visitedCount !== nodes.length) {
            throw new Error("Cycle detected in TaskGraph (not a DAG)");
        }
    }
}
