// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaFlow™ — lokaflow.io
//
// packages/agent/src/dag/topological-sort.ts
// Kahn's algorithm — returns execution layers (nodes in each layer can run in parallel).

import type { TaskGraph, TaskNode } from "../types/agent.js";
import { assertNoCycle } from "./cycle-detector.js";

/**
 * Returns an array of layers, where each layer is an array of nodes
 * that can be executed in parallel.
 *
 * Layer 0 = nodes with no dependencies (run first, all in parallel).
 * Layer N = nodes whose dependencies are all in layers 0..N-1.
 *
 * @throws DecompositionCycleError if the graph has a cycle.
 */
export function topologicalSort(graph: TaskGraph): TaskNode[][] {
  assertNoCycle(graph);

  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  // inDegree: how many un-resolved dependencies each node has
  const inDegree = new Map<string, number>();
  for (const node of graph.nodes) {
    inDegree.set(node.id, node.dependsOn.length);
  }

  const layers: TaskNode[][] = [];
  let ready = graph.nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0);

  while (ready.length > 0) {
    // Push this layer
    layers.push(ready);

    // Reduce in-degrees for nodes that depend on this layer
    const next: TaskNode[] = [];
    for (const node of ready) {
      for (const other of graph.nodes) {
        if (other.dependsOn.includes(node.id)) {
          const deg = (inDegree.get(other.id) ?? 0) - 1;
          inDegree.set(other.id, deg);
          if (deg === 0) next.push(other);
        }
      }
    }
    ready = next;
  }

  // Sanity: every node must be in exactly one layer
  const placed = layers.flat().length;
  if (placed !== graph.nodes.length) {
    throw new Error(
      `Topological sort incomplete: ${placed} of ${graph.nodes.length} nodes placed. Possible cycle.`,
    );
  }

  void nodeMap; // suppress unused-variable warning
  return layers;
}
