// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
//
// packages/mesh/src/executor/health.ts
// NodeHealthChecker — periodically pings each node's Ollama API to confirm it's alive.
// Updates NodeRegistry state based on HTTP response.

import type { NodeRegistry } from "../discovery/registry.js";

const HEALTH_PATH = "/api/tags"; // Ollama list-models endpoint — lightweight

export class NodeHealthChecker {
    private timer: NodeJS.Timeout | null = null;

    constructor(
        private readonly registry: NodeRegistry,
        private readonly intervalMs: number = 10_000,
    ) { }

    start(): void {
        this.timer = setInterval(() => this._checkAll(), this.intervalMs);
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    /** Immediately check all known nodes (also called on startup). */
    async checkAll(): Promise<void> {
        await this._checkAll();
    }

    private async _checkAll(): Promise<void> {
        const nodes = this.registry.all();
        await Promise.allSettled(nodes.map((node) => this._checkNode(node.id, node.ip, node.port)));
    }

    private async _checkNode(nodeId: string, ip: string, port: number): Promise<void> {
        if (ip === "auto") {
            this.registry.recordMiss(nodeId);
            return;
        }

        try {
            const res = await fetch(`http://${ip}:${port}${HEALTH_PATH}`, {
                signal: AbortSignal.timeout(5_000),
            });

            if (res.ok) {
                const data = (await res.json()) as { models?: Array<{ name: string }> };
                // Update available models from live API response
                const node = this.registry.get(nodeId);
                if (node && data.models) {
                    const liveModels = data.models.map((m: { name: string }) => m.name);
                    if (liveModels.length > 0) {
                        this.registry.upsert({ ...node, capabilities: { ...node.capabilities, models: liveModels } });
                    } else {
                        this.registry.upsert(node);
                    }
                }
            } else {
                this.registry.recordMiss(nodeId);
            }
        } catch {
            this.registry.recordMiss(nodeId);
        }
    }
}
