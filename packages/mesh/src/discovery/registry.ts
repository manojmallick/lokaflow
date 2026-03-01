// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
//
// packages/mesh/src/discovery/registry.ts
// NodeRegistry — in-memory map of all known LokaMesh nodes.
// Nodes are evicted after 3 missed heartbeats.

import type { MeshNode, NodeState } from "../types/node.js";

const MISS_THRESHOLD = 3;

export class NodeRegistry {
    private readonly nodes = new Map<string, MeshNode>();
    private readonly missCount = new Map<string, number>();

    /** Register or update a node (resets miss counter). */
    upsert(node: MeshNode): void {
        this.nodes.set(node.id, { ...node, lastSeen: new Date() });
        this.missCount.set(node.id, 0);
    }

    /** Record a missed heartbeat. Evicts node after MISS_THRESHOLD misses. */
    recordMiss(nodeId: string): void {
        const count = (this.missCount.get(nodeId) ?? 0) + 1;
        this.missCount.set(nodeId, count);
        if (count >= MISS_THRESHOLD) {
            const node = this.nodes.get(nodeId);
            if (node) {
                this.nodes.set(nodeId, { ...node, state: "unreachable" });
            }
        }
    }

    /** Update only the state of a known node. */
    setState(nodeId: string, state: NodeState): void {
        const node = this.nodes.get(nodeId);
        if (node) {
            this.nodes.set(nodeId, { ...node, state });
        }
    }

    /** Update queue depth for active load-balancing decisions. */
    setQueueDepth(nodeId: string, depth: number): void {
        const node = this.nodes.get(nodeId);
        if (node) {
            this.nodes.set(nodeId, { ...node, queueDepth: depth });
        }
    }

    get(nodeId: string): MeshNode | undefined {
        return this.nodes.get(nodeId);
    }

    /** All nodes regardless of state. */
    all(): MeshNode[] {
        return [...this.nodes.values()];
    }

    /** Only nodes that are online or busy (not sleeping/unreachable). */
    available(): MeshNode[] {
        return [...this.nodes.values()].filter(
            (n) => n.state === "online" || n.state === "busy",
        );
    }

    /** Nodes that can run the specified model. */
    withModel(modelId: string): MeshNode[] {
        return this.available().filter((n) =>
            n.capabilities.models.some((m) => m === modelId || m.startsWith(modelId.split(":")[0]!)),
        );
    }

    remove(nodeId: string): void {
        this.nodes.delete(nodeId);
        this.missCount.delete(nodeId);
    }

    size(): number {
        return this.nodes.size;
    }
}
