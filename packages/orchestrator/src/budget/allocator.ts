// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
//
// packages/orchestrator/src/budget/allocator.ts
// TokenBudgetAllocator — distributes an overall token budget across DAG nodes
// based on their complexity and depth in the graph.

import type { TaskGraph, TaskNode } from "../types.js";

export class TokenBudgetAllocator {
    /**
     * Allocates a total token budget across all nodes in the DAG.
     * Nodes with higher complexity receive a proportionally larger budget.
     * Nodes deeper in the graph (dependencies of many) receive a slight bonus
     * to ensure they generate comprehensive context for their dependants.
     */
    allocate(graph: TaskGraph, totalBudgetTokens: number = 8000): TaskGraph {
        if (graph.nodes.length === 0) return graph;

        const baseWeights = new Map<string, number>();
        let totalWeight = 0;

        // 1. Calculate base weight = complexityScore * (1 + 0.2 * dependantCount)
        for (const node of graph.nodes) {
            const dependantCount = this._countDependants(node.id, graph.nodes);
            // Min complexity floor of 0.2 to ensure trivial tasks still get some budget
            const complexity = Math.max(0.2, node.complexityScore);
            const weight = complexity * (1 + 0.2 * dependantCount);

            baseWeights.set(node.id, weight);
            totalWeight += weight;
        }

        // 2. Distribute budget proportionally (min 100 tokens per node)
        const MIN_BUDGET = 100;
        let remainingBudget = totalBudgetTokens;
        const allocatedNodes: TaskNode[] = [];

        // First pass: give everyone the minimum
        for (const node of graph.nodes) {
            remainingBudget -= MIN_BUDGET;
        }

        if (remainingBudget < 0) {
            // Total budget too small to even satisfy minimums — spread evenly
            const evenSlice = Math.floor(totalBudgetTokens / graph.nodes.length);
            return {
                ...graph,
                nodes: graph.nodes.map(n => ({ ...n, budgetTokens: evenSlice })),
            };
        }

        // Second pass: distribute the rest based on calculated weights
        for (const node of graph.nodes) {
            const weight = baseWeights.get(node.id) || 0;
            const share = Math.floor((weight / totalWeight) * remainingBudget);
            allocatedNodes.push({
                ...node,
                budgetTokens: MIN_BUDGET + share,
            });
        }

        return { ...graph, nodes: allocatedNodes };
    }

    /** Counts how many nodes depend directly or indirectly on a given node id. */
    private _countDependants(nodeId: string, nodes: TaskNode[]): number {
        let count = 0;
        const queue = [nodeId];
        const visited = new Set<string>();

        while (queue.length > 0) {
            const current = queue.shift()!;
            for (const node of nodes) {
                if (node.dependsOn.includes(current) && !visited.has(node.id)) {
                    visited.add(node.id);
                    queue.push(node.id);
                    count++;
                }
            }
        }

        return count;
    }
}
