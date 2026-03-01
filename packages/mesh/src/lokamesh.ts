// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
//
// packages/mesh/src/lokamesh.ts
// LokaMesh — main facade class. The public API for the LokaMesh cluster layer.
//
// Usage:
//   const mesh = new LokaMesh({ configPath: "./lokanet.yaml" })
//   await mesh.start()
//   const node = await mesh.selectNode({ modelRequired: "mistral:7b", priority: "interactive", estimatedTokens: 500 })
//   await mesh.stop()

import { readFileSync } from "fs";
import { parse as parseYaml } from "js-yaml";
import EventEmitter from "events";
import { lokaMeshConfigSchema } from "./types/config.js";
import { NodeRegistry } from "./discovery/registry.js";
import { MdnsDiscovery } from "./discovery/mdns.js";
import { MeshScheduler } from "./scheduler/scheduler.js";
import { NodeHealthChecker } from "./executor/health.js";
import { ElectricityMapsClient, GreenReport } from "./green/carbon.js";
import { sendWol } from "./power/wol.js";
import type { MeshNode, MeshTask } from "./types/node.js";
import type { LokaMeshConfig } from "./types/config.js";
import type { SchedulerResult } from "./scheduler/scheduler.js";

interface LokaMeshOptions {
    configPath?: string;
    config?: LokaMeshConfig;
}

/** Result from mesh.nodes() — includes live state */
export interface MeshStatus {
    nodes: MeshNode[];
    onlineCount: number;
    sleepingCount: number;
    unreachableCount: number;
}

export class LokaMesh extends EventEmitter {
    private readonly registry = new NodeRegistry();
    private scheduler: MeshScheduler;
    private discovery: MdnsDiscovery | null = null;
    private healthChecker: NodeHealthChecker;
    private greenReport: GreenReport;
    private readonly config: LokaMeshConfig;
    private running = false;

    constructor(opts: LokaMeshOptions = {}) {
        super();
        if (opts.config) {
            this.config = opts.config;
        } else if (opts.configPath) {
            const raw = readFileSync(opts.configPath, "utf-8");
            const parsed = parseYaml(raw) as unknown;
            this.config = lokaMeshConfigSchema.parse(parsed);
        } else {
            throw new Error("LokaMesh: provide either configPath or config");
        }

        this.scheduler = new MeshScheduler(this.registry);
        this.healthChecker = new NodeHealthChecker(
            this.registry,
            this.config.healthCheckIntervalMs,
        );

        const carbonClient = new ElectricityMapsClient(
            this.config.green.carbonApiKey,
            this.config.green.zone,
        );
        this.greenReport = new GreenReport(carbonClient);

        // Seed registry from config (static nodes — mDNS will update IPs dynamically)
        this._seedFromConfig();
    }

    /** Start discovery, health checks, and sleep state machines. */
    async start(): Promise<void> {
        if (this.running) return;
        this.running = true;

        // Find this node's config entry (by hostname or role=orchestrator)
        const selfNode = this.config.nodes.find((n) => n.role === "orchestrator");
        if (selfNode) {
            this.discovery = new MdnsDiscovery(this.registry, {
                nodeId: selfNode.id,
                nodeName: selfNode.name,
                nodeRole: selfNode.role,
                port: selfNode.port,
                models: selfNode.models,
                ramGb: selfNode.ramGb,
                gpuAcceleration: selfNode.gpuAcceleration,
                inferenceWatts: selfNode.inferenceWatts,
                discoveryIntervalMs: this.config.discoveryIntervalMs,
            });

            this.discovery.on("discovered", (node: MeshNode) => {
                this.emit("discovered", node);
            });
            this.discovery.on("warn", (msg: string) => {
                this.emit("warn", msg);
            });

            await this.discovery.start();
        }

        // Initial health check + start periodic checks
        await this.healthChecker.checkAll();
        this.healthChecker.start();
    }

    /** Graceful shutdown — stops discovery, health checks, and timers. */
    async stop(): Promise<void> {
        this.running = false;
        this.healthChecker.stop();
        if (this.discovery) await this.discovery.stop();
    }

    /**
     * Select the best available node for a task.
     * Returns null if no suitable node is available right now.
     */
    selectNode(task: Pick<MeshTask, "modelRequired" | "priority" | "estimatedTokens">): SchedulerResult | null {
        const fullTask: MeshTask = {
            id: crypto.randomUUID(),
            timeoutMs: this.config.taskTimeoutMs,
            messages: [],
            ...task,
        };
        return this.scheduler.selectNode(fullTask);
    }

    /** Send Wake-on-LAN to a sleeping node by node ID. */
    async wake(nodeId: string): Promise<boolean> {
        const node = this.registry.get(nodeId);
        if (!node) return false;
        if (!node.macAddress) return false;

        await sendWol(node.macAddress);
        this.registry.setState(nodeId, "waking");
        this.emit("waking", nodeId);
        return true;
    }

    /** Current status of all nodes. */
    nodes(): MeshStatus {
        const all = this.registry.all();
        return {
            nodes: all,
            onlineCount: all.filter((n) => n.state === "online" || n.state === "busy").length,
            sleepingCount: all.filter((n) => n.state === "light_sleep" || n.state === "deep_sleep" || n.state === "waking").length,
            unreachableCount: all.filter((n) => n.state === "unreachable").length,
        };
    }

    /** Get a green CO₂ savings report. */
    async greenSavings(localWatts: number, inferenceSeconds: number, cloudTokensReplaced: number) {
        return this.greenReport.calculate(localWatts, inferenceSeconds, cloudTokensReplaced);
    }

    /** Format a green report as a terminal string. */
    async formatGreenReport(localWatts: number, inferenceSeconds: number, cloudTokens: number): Promise<string> {
        const metrics = await this.greenReport.calculate(localWatts, inferenceSeconds, cloudTokens);
        return this.greenReport.formatReport(metrics);
    }

    private _seedFromConfig(): void {
        for (const nodeConf of this.config.nodes) {
            const node: MeshNode = {
                id: nodeConf.id,
                name: nodeConf.name,
                role: nodeConf.role,
                state: "unreachable", // health check will update
                ip: nodeConf.ip === "auto" ? "" : nodeConf.ip,
                port: nodeConf.port,
                capabilities: {
                    models: nodeConf.models,
                    ramGb: nodeConf.ramGb,
                    gpuAcceleration: nodeConf.gpuAcceleration,
                    inferenceWatts: nodeConf.inferenceWatts,
                    storageHub: nodeConf.storageHub,
                },
                lastSeen: new Date(0),
                macAddress: nodeConf.macAddress,
                tokensPerSec: nodeConf.gpuAcceleration ? 30 : 6,
                queueDepth: 0,
                thermalCelsius: 0,
                batteryStressScore: 0,
            };
            this.registry.upsert(node);
        }
    }
}
