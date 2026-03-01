// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
//
// packages/mesh/src/discovery/mdns.ts
// MdnsDiscovery — announces this node on the LAN and scans for other LokaMesh nodes.
// Uses multicast-dns (zero-config, no Bonjour daemon required).
// Service type: _lokaflow._tcp.local

import EventEmitter from "events";
import type { NodeRegistry } from "./registry.js";
import type { MeshNode, NodeCapabilities, NodeRole } from "../types/node.js";

/** Service type for mDNS discovery */
const SERVICE_TYPE = "_lokaflow._tcp.local";
/** Announce + scan interval in ms (default 30s) */
const DEFAULT_INTERVAL_MS = 30_000;

export interface DiscoveryOptions {
    /** This node's own config — used to build the mDNS TXT record */
    nodeId: string;
    nodeName: string;
    nodeRole: NodeRole;
    port: number;
    models: string[];
    ramGb: number;
    gpuAcceleration: boolean;
    inferenceWatts: number;
    discoveryIntervalMs?: number;
}

export class MdnsDiscovery extends EventEmitter {
    private mdns: any = null;
    private timer: NodeJS.Timeout | null = null;
    private readonly opts: Required<DiscoveryOptions>;
    private readonly registry: NodeRegistry;
    private running = false;

    constructor(registry: NodeRegistry, opts: DiscoveryOptions) {
        super();
        this.registry = registry;
        this.opts = {
            discoveryIntervalMs: DEFAULT_INTERVAL_MS,
            ...opts,
        };
    }

    async start(): Promise<void> {
        if (this.running) return;
        this.running = true;

        try {
            // Dynamic import — multicast-dns may not be installed in test envs
            const mdnsModule = await import("multicast-dns");
            this.mdns = mdnsModule.default();
        } catch {
            // multicast-dns not available — log and continue (discovery disabled)
            this.emit("warn", "multicast-dns not installed — mDNS discovery disabled");
            return;
        }

        this.mdns.on("response", (response: any) => {
            this._handleResponse(response);
        });

        // Announce this node + query for peers on startup and on interval
        this._announce();
        this._query();
        this.timer = setInterval(() => {
            this._announce();
            this._query();
        }, this.opts.discoveryIntervalMs);
    }

    async stop(): Promise<void> {
        this.running = false;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        if (this.mdns) {
            await new Promise<void>((resolve) => this.mdns.destroy(resolve));
            this.mdns = null;
        }
    }

    private _announce(): void {
        if (!this.mdns) return;
        const { nodeId, nodeName, nodeRole, port, models, ramGb, gpuAcceleration, inferenceWatts } =
            this.opts;

        this.mdns.respond({
            answers: [
                {
                    name: `${nodeId}.${SERVICE_TYPE}`,
                    type: "SRV",
                    data: { port, target: `${nodeId}.local` },
                },
                {
                    name: `${nodeId}.${SERVICE_TYPE}`,
                    type: "TXT",
                    data: [
                        `id=${nodeId}`,
                        `name=${nodeName}`,
                        `role=${nodeRole}`,
                        `models=${models.join(",")}`,
                        `ram=${ramGb}`,
                        `gpu=${gpuAcceleration ? "1" : "0"}`,
                        `watts=${inferenceWatts}`,
                        `v=1`,
                    ],
                },
            ],
        });
    }

    private _query(): void {
        if (!this.mdns) return;
        this.mdns.query({ questions: [{ name: SERVICE_TYPE, type: "PTR" }] });
    }

    private _handleResponse(response: any): void {
        // Look for TXT records that contain our known fields
        const txtRecord = response.answers?.find(
            (a: any) => a.type === "TXT" && a.name?.includes("_lokaflow"),
        );
        if (!txtRecord) return;

        const txt: Record<string, string> = {};
        const entries: string[] = Array.isArray(txtRecord.data)
            ? txtRecord.data.map((b: Buffer | string) => (Buffer.isBuffer(b) ? b.toString() : b))
            : [];

        for (const entry of entries) {
            const [key, ...rest] = entry.split("=");
            if (key) txt[key] = rest.join("=");
        }

        if (!txt["id"] || txt["v"] !== "1") return;
        if (txt["id"] === this.opts.nodeId) return; // skip self

        // Find IP from A record for this node
        const aRecord = response.answers?.find(
            (a: any) => a.type === "A" && a.name?.startsWith(txt["id"]!),
        );
        const ip = aRecord?.data ?? "auto";

        const srvRecord = response.answers?.find(
            (a: any) => a.type === "SRV" && a.name?.includes(txt["id"]!),
        );
        const port = srvRecord?.data?.port ?? 11434;

        const capabilities: NodeCapabilities = {
            models: txt["models"] ? txt["models"].split(",").filter(Boolean) : [],
            ramGb: parseInt(txt["ram"] ?? "8", 10),
            gpuAcceleration: txt["gpu"] === "1",
            inferenceWatts: parseInt(txt["watts"] ?? "10", 10),
            storageHub: false,
        };

        const node: MeshNode = {
            id: txt["id"],
            name: txt["name"] ?? txt["id"],
            role: (txt["role"] as NodeRole) ?? "standard",
            state: "online",
            ip,
            port,
            capabilities,
            lastSeen: new Date(),
            tokensPerSec: capabilities.gpuAcceleration ? 30 : 6,
            queueDepth: 0,
            thermalCelsius: 0,
            batteryStressScore: 0,
        };

        this.registry.upsert(node);
        this.emit("discovered", node);
    }
}
