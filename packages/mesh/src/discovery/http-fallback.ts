// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
//
// packages/mesh/src/discovery/http-fallback.ts
// HttpDiscovery — HTTP-based peer discovery for Windows and environments where
// mDNS multicast is unavailable (corporate firewalls, VMs, WSL).
//
// Strategy:
//  1. On first run, scan the local /24 subnet for nodes responding on the
//     default LokaMesh port (4050).
//  2. Cache known-good addresses in ~/.lokaflow/mesh-peers.json.
//  3. Re-verify cached peers every `verifyIntervalMs`.

import EventEmitter from "events";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir, networkInterfaces } from "os";
import { join } from "path";
import type { NodeRegistry } from "./registry.js";
import type { MeshNode } from "../types/node.js";

const DEFAULT_MESH_PORT = 4050;
const CACHE_PATH = join(homedir(), ".lokaflow", "mesh-peers.json");
const SUBNET_SCAN_TIMEOUT_MS = 500;

export interface HttpDiscoveryOptions {
  nodeId: string;
  nodeName: string;
  port?: number;
  probeTimeoutMs?: number;
  verifyIntervalMs?: number;
  knownPeers?: string[]; // Explicit list of peer IPs (skip subnet scan)
  enableSubnetScan?: boolean;
}

interface CachedPeer {
  ip: string;
  port: number;
  nodeId: string;
  nodeName: string;
  lastSeen: string;
}

// ── HttpDiscovery ─────────────────────────────────────────────────────────

export class HttpDiscovery extends EventEmitter {
  private running = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly registry: NodeRegistry;
  private readonly opts: Required<HttpDiscoveryOptions>;

  constructor(registry: NodeRegistry, opts: HttpDiscoveryOptions) {
    super();
    this.registry = registry;
    this.opts = {
      port: DEFAULT_MESH_PORT,
      probeTimeoutMs: SUBNET_SCAN_TIMEOUT_MS,
      verifyIntervalMs: 60_000,
      knownPeers: [],
      enableSubnetScan: true,
      ...opts,
    };
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    await this.discover();

    this.timer = setInterval(() => {
      void this.verifyKnown();
    }, this.opts.verifyIntervalMs);
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // ── Discovery logic ──────────────────────────────────────────────────────

  private async discover(): Promise<void> {
    const candidates = new Set<string>();

    // 1. Add explicitly configured peers
    for (const ip of this.opts.knownPeers) candidates.add(ip);

    // 2. Load cached peers
    const cached = this.loadCache();
    for (const p of cached) candidates.add(p.ip);

    // 3. Subnet scan (if enabled and we found our local IP)
    if (this.opts.enableSubnetScan) {
      const localSubnets = this.getLocalSubnets();
      for (const subnet of localSubnets) {
        const peers = await this.scanSubnet(subnet);
        for (const p of peers) candidates.add(p);
      }
    }

    // 4. Probe all candidates
    const results = await Promise.allSettled(
      Array.from(candidates).map((ip) => this.probeNode(ip, this.opts.port)),
    );

    const newCache: CachedPeer[] = [];
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        newCache.push(r.value);
        this.onNodeFound(r.value);
      }
    }

    this.saveCache(newCache);
  }

  private async verifyKnown(): Promise<void> {
    const cached = this.loadCache();
    const stillAlive: CachedPeer[] = [];

    await Promise.allSettled(
      cached.map(async (peer) => {
        const result = await this.probeNode(peer.ip, peer.port);
        if (result) {
          result.lastSeen = new Date().toISOString();
          stillAlive.push(result);
        } else {
          this.emit("lost", peer.nodeId);
          this.registry.remove(peer.nodeId);
        }
      }),
    );

    this.saveCache(stillAlive);
  }

  // ── Subnet scanning ───────────────────────────────────────────────────────

  private getLocalSubnets(): string[] {
    const subnets: string[] = [];
    const ifaces = networkInterfaces();

    for (const iface of Object.values(ifaces)) {
      if (!iface) continue;
      for (const addr of iface) {
        if (addr.family !== "IPv4" || addr.internal) continue;
        // Extract /24 prefix
        const parts = addr.address.split(".");
        if (parts.length === 4) {
          subnets.push(`${parts[0]}.${parts[1]}.${parts[2]}`);
        }
      }
    }

    return [...new Set(subnets)];
  }

  private async scanSubnet(prefix: string): Promise<string[]> {
    // Scan x.x.x.1–254 in parallel with a short timeout
    const probes: Promise<string | null>[] = [];

    for (let i = 1; i <= 254; i++) {
      const ip = `${prefix}.${i}`;
      probes.push(
        this.probeNode(ip, this.opts.port)
          .then((r) => (r ? ip : null))
          .catch(() => null),
      );
    }

    const results = await Promise.all(probes);
    return results.filter((r): r is string => r !== null);
  }

  // ── HTTP probe ─────────────────────────────────────────────────────────────

  private async probeNode(ip: string, port: number): Promise<CachedPeer | null> {
    const url = `http://${ip}:${port}/mesh/info`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.opts.probeTimeoutMs);

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) return null;
      const data = (await res.json()) as Partial<CachedPeer & { version: string }>;

      if (!data.nodeId || !data.nodeName) return null;

      return {
        ip,
        port,
        nodeId: data.nodeId,
        nodeName: data.nodeName,
        lastSeen: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }

  // ── Registry integration ────────────────────────────────────────────────────

  private onNodeFound(peer: CachedPeer): void {
    // Build a minimal MeshNode from probe data
    const node: MeshNode = {
      id: peer.nodeId,
      name: peer.nodeName,
      ip: peer.ip,
      port: peer.port,
      role: "standard",
      state: "online",
      capabilities: {
        models: [],
        ramGb: 0,
        gpuAcceleration: false,
        inferenceWatts: 0,
        storageHub: false,
      },
      lastSeen: new Date(),
      tokensPerSec: 0,
      queueDepth: 0,
      thermalCelsius: 0,
      batteryStressScore: 0,
    };

    this.registry.upsert(node);
    this.emit("found", node);
  }

  // ── Cache helpers ───────────────────────────────────────────────────────────

  private loadCache(): CachedPeer[] {
    try {
      if (!existsSync(CACHE_PATH)) return [];
      return JSON.parse(readFileSync(CACHE_PATH, "utf8")) as CachedPeer[];
    } catch {
      return [];
    }
  }

  private saveCache(peers: CachedPeer[]): void {
    try {
      const dir = join(homedir(), ".lokaflow");
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(CACHE_PATH, JSON.stringify(peers, null, 2), "utf8");
    } catch {
      /* non-critical */
    }
  }
}
