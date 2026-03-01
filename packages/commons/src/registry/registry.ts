// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaCommons™ — lokaflow.io

import { NodeCapacityReport } from "../types/routing.js";

// A mock in-memory registry simulating a DHT network discovery or central tracker.
export class CommonsRegistry {
    private nodes: Map<string, NodeCapacityReport> = new Map();

    register(report: NodeCapacityReport) {
        this.nodes.set(report.nodeId, report);
    }

    remove(nodeId: string) {
        this.nodes.delete(nodeId);
    }

    async getAvailableNodes(filters: {
        modelRequired: string;
        dataResidencyRegion?: string;
        minTokensPerSecond: number;
        maxBatteryStressScore: number;
    }): Promise<NodeCapacityReport[]> {
        const list = Array.from(this.nodes.values());

        return list.filter(node => {
            // 1. Must have the requested model
            if (!node.availableModels.includes(filters.modelRequired)) return false;

            // 2. Data residency
            if (filters.dataResidencyRegion && node.dataResidencyRegion !== filters.dataResidencyRegion) return false;

            // 3. Minimum throughput
            if (node.tokensPerSecond < filters.minTokensPerSecond) return false;

            // 4. Battery respect (LBI integration)
            if (node.batteryStressScore > filters.maxBatteryStressScore) return false;

            // 5. Must have capacity
            if (node.queueDepth >= node.maxConcurrentTasks) return false;

            return true;
        });
    }
}

export class NodeSelector {
    // Score nodes and pick the top one
    selectBest(nodes: NodeCapacityReport[]): NodeCapacityReport {
        // A simple sorting approach prioritizing fast nodes that are not stressed
        const sorted = nodes.sort((a, b) => {
            // higher score is better.
            const scoreA = (a.tokensPerSecond * 10) - a.batteryStressScore;
            const scoreB = (b.tokensPerSecond * 10) - b.batteryStressScore;
            return scoreB - scoreA;
        });

        return sorted[0]; // Assume nodes.length > 0
    }
}
