// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
//
// packages/mesh/src/scheduler/scheduler.ts
// MeshScheduler — selects the optimal node for a given task.
//
// Scoring:
//   tokensPerSec × 0.40     speed (primary factor)
//   always_on bonus  +20    prefer 24/7 nodes
//   batteryStress   ×0.20   penalise high battery stress
//   queueDepth      ×10     penalise busy nodes
//   thermal penalty  -15    if > 35°C
//   GPU bonus        +40    for Apple Silicon (Metal)

import type { MeshNode, MeshTask } from "../types/node.js";
import type { NodeRegistry } from "../discovery/registry.js";

export interface SchedulerResult {
    node: MeshNode;
    score: number;
    reason: string;
}

export class MeshScheduler {
    constructor(private readonly registry: NodeRegistry) { }

    /**
     * Select the best available node for a task.
     * Returns null if no capable node is available.
     */
    selectNode(task: MeshTask): SchedulerResult | null {
        const candidates = this.registry.available().filter((node) =>
            this._canRunTask(node, task),
        );

        if (candidates.length === 0) return null;

        const scored = candidates.map((node) => ({
            node,
            score: this._score(node, task),
            reason: this._buildReason(node),
        }));

        scored.sort((a, b) => b.score - a.score);
        return scored[0] ?? null;
    }

    /** Whether a node can technically run the task */
    private _canRunTask(node: MeshNode, task: MeshTask): boolean {
        // Model check — exact match or family match (e.g. "mistral" matches "mistral:7b")
        const modelOk = node.capabilities.models.some(
            (m) => m === task.modelRequired || m.startsWith(task.modelRequired.split(":")[0]!),
        );
        if (!modelOk) return false;

        // Battery constraint — do not route to highly stressed nodes for non-interactive tasks
        if (task.priority !== "interactive" && node.batteryStressScore > 70) return false;

        // Thermal gate — never route to overheating nodes
        if (node.thermalCelsius > 45) return false;

        // Queue limit — do not pile more than 3 tasks on a single node
        if (node.queueDepth > 3) return false;

        return true;
    }

    /** Score a node for a task — higher is better */
    private _score(node: MeshNode, task: MeshTask): number {
        let score = 0;

        // 1. GPU acceleration (Metal) — major speed bonus
        if (node.capabilities.gpuAcceleration) score += 40;

        // 2. Raw throughput
        score += node.tokensPerSec * 0.40;

        // 3. Prefer always_on nodes (no sleep latency)
        if (node.role === "always_on") score += 20;

        // 4. Penalise busy or queued nodes
        score -= node.queueDepth * 10;
        if (node.state === "busy") score -= 10;

        // 5. Battery stress penalty
        score -= node.batteryStressScore * 0.20;

        // 6. Thermal penalty
        if (node.thermalCelsius > 35) score -= 15;

        // 7. Power efficiency bonus for non-interactive tasks
        if (task.priority !== "interactive") {
            const powerScore = Math.max(0, (100 - node.capabilities.inferenceWatts) / 100) * 20;
            score += powerScore;
        }

        return score;
    }

    private _buildReason(node: MeshNode): string {
        const parts: string[] = [`node=${node.id}`, `role=${node.role}`];
        if (node.capabilities.gpuAcceleration) parts.push("gpu=metal");
        if (node.queueDepth > 0) parts.push(`queue=${node.queueDepth}`);
        return parts.join(", ");
    }
}
