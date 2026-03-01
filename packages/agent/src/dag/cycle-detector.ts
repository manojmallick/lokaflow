// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaFlow™ — lokaflow.io
//
// packages/agent/src/dag/cycle-detector.ts
// DFS-based cycle detection. Must run before ExecutionEngine topology sort.

import type { TaskGraph } from "../types/agent.js";

export class DecompositionCycleError extends Error {
  constructor(cycleNodeId: string) {
    super(`Cycle detected in TaskGraph at node: ${cycleNodeId}`);
    this.name = "DecompositionCycleError";
  }
}

/**
 * Returns true if the task graph contains a dependency cycle.
 * Uses DFS with a recursion stack (back-edge detection).
 */
export function hasCycle(graph: TaskGraph): boolean {
  const visited = new Set<string>();
  const stack = new Set<string>();

  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));

  function dfs(nodeId: string): boolean {
    if (stack.has(nodeId)) return true; // back edge = cycle
    if (visited.has(nodeId)) return false;

    stack.add(nodeId);
    const node = nodeMap.get(nodeId);
    if (node) {
      for (const dep of node.dependsOn) {
        if (dfs(dep)) return true;
      }
    }
    stack.delete(nodeId);
    visited.add(nodeId);
    return false;
  }

  return graph.nodes.some((n) => dfs(n.id));
}

/**
 * Throws DecompositionCycleError if a cycle is found.
 * Use before executing any task graph.
 */
export function assertNoCycle(graph: TaskGraph): void {
  const visited = new Set<string>();
  const stack = new Set<string>();
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));

  function dfs(nodeId: string): boolean {
    if (stack.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;

    stack.add(nodeId);
    const node = nodeMap.get(nodeId);
    if (node) {
      for (const dep of node.dependsOn) {
        if (dfs(dep)) throw new DecompositionCycleError(nodeId);
      }
    }
    stack.delete(nodeId);
    visited.add(nodeId);
    return false;
  }

  graph.nodes.forEach((n) => dfs(n.id));
}
