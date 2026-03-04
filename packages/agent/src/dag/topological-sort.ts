// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaFlow™ — lokaflow.io
//
// packages/agent/src/dag/topological-sort.ts
// Kahn's algorithm — returns execution layers (nodes in each layer can run in parallel).

import type { TaskGraph, TaskNode } from "../types/agent.js";
import {
  assertNoCycle,
  DecompositionCycleError,
  UnknownDependencyError,
} from "./cycle-detector.js";

// Re-export so callers can import UnknownDependencyError from either module.
export { UnknownDependencyError };

/**
 * Returns an array of layers, where each layer is an array of nodes
 * that can be executed in parallel.
 *
 * Layer 0 = nodes with no dependencies (run first, all in parallel).
 * Layer N = nodes whose dependencies are all in layers 0..N-1.
 *
 * @param options.skipCycleCheck - Set to `true` when the caller has already
 *   run `assertNoCycle` on this graph, avoiding a redundant O(V+E) DFS.
 * @throws DecompositionCycleError if the graph has a cycle (unless skipCycleCheck is true).
 * @throws UnknownDependencyError if any node depends on an id that does not exist in the graph.
 */
export function topologicalSort(
  graph: TaskGraph,
  options?: { skipCycleCheck?: boolean },
): TaskNode[][] {
  if (!options?.skipCycleCheck) {
    assertNoCycle(graph);
  }

  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));

  // Validate that every dependsOn edge points to a known node.
  // Report missing nodes explicitly rather than letting Kahn's algorithm
  // silently under-count placed nodes and emit a misleading "Possible cycle" error.
  for (const node of graph.nodes) {
    for (const depId of node.dependsOn) {
      if (!nodeMap.has(depId)) {
        throw new UnknownDependencyError(node.id, depId);
      }
    }
  }

  // inDegree: how many un-resolved dependencies each node has
  const inDegree = new Map<string, number>();
  for (const node of graph.nodes) {
    inDegree.set(node.id, node.dependsOn.length);
  }

  const layers: TaskNode[][] = [];
  // Build adjacency list: nodeId → list of node IDs that depend on it.
  // Together with the in-degree pass above this gives O(V+E) overall,
  // vs the naive O(V²) approach of scanning all edges on every layer.
  const dependentsOf = new Map<string, string[]>();
  for (const node of graph.nodes) {
    for (const dep of node.dependsOn) {
      const list = dependentsOf.get(dep) ?? [];
      list.push(node.id);
      dependentsOf.set(dep, list);
    }
  }

  let ready = graph.nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0);

  while (ready.length > 0) {
    // Push this layer
    layers.push(ready);

    // Only visit true dependents — O(E) per layer
    const next: TaskNode[] = [];
    for (const node of ready) {
      for (const dependentId of dependentsOf.get(node.id) ?? []) {
        const deg = (inDegree.get(dependentId) ?? 0) - 1;
        inDegree.set(dependentId, deg);
        if (deg === 0) {
          const dependent = nodeMap.get(dependentId);
          if (dependent) next.push(dependent);
        }
      }
    }
    ready = next;
  }

  // Sanity: every node must be in exactly one layer.
  // At this point all dependency IDs are known-valid (checked above), so a
  // deficit here can only be caused by a cycle that slipped past assertNoCycle.
  // Count without allocating a flattened intermediate array.
  let placed = 0;
  for (const layer of layers) placed += layer.length;
  if (placed !== graph.nodes.length) {
    throw new DecompositionCycleError(
      "__topo_overflow__",
      `Topological sort incomplete: ${placed} of ${graph.nodes.length} nodes placed. Cycle detected.`,
    );
  }

  // nodeMap is used above for O(1) dependent lookups
  return layers;
}
