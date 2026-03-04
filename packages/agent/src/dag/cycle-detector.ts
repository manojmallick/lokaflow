// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaFlow™ — lokaflow.io
//
// packages/agent/src/dag/cycle-detector.ts
// DFS-based cycle detection. Must run before ExecutionEngine topology sort.

import type { TaskGraph } from "../types/agent.js";

export class DecompositionCycleError extends Error {
  constructor(cycleNodeId: string, message?: string) {
    super(message ?? `Cycle detected in TaskGraph at node: ${cycleNodeId}`);
    this.name = "DecompositionCycleError";
  }
}

/**
 * Thrown when a node's dependsOn references an id that does not exist in the graph.
 * Exported from cycle-detector so both assertNoCycle and topologicalSort can use it
 * without a circular import.
 */
export class UnknownDependencyError extends Error {
  constructor(nodeId: string, depId: string) {
    super(
      `Unknown dependency: node '${nodeId}' depends on '${depId}' which does not exist in the graph.`,
    );
    this.name = "UnknownDependencyError";
  }
}

/**
 * Returns true if the task graph contains a dependency cycle.
 * Uses DFS with a recursion stack (back-edge detection).
 * @throws UnknownDependencyError if a dependsOn edge references a node not in the graph.
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
        if (!nodeMap.has(dep)) throw new UnknownDependencyError(nodeId, dep);
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
 * @throws DecompositionCycleError if the graph contains a cycle.
 * @throws UnknownDependencyError if a dependsOn edge references a node not in the graph.
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
        if (!nodeMap.has(dep)) throw new UnknownDependencyError(nodeId, dep);
        if (dfs(dep)) throw new DecompositionCycleError(dep);
      }
    }
    stack.delete(nodeId);
    visited.add(nodeId);
    return false;
  }

  graph.nodes.forEach((n) => dfs(n.id));
}
