// © 2026 LearnHubPlay BV. All rights reserved.
// packages/mesh/tests/unit/mesh.test.ts
// Unit tests for LokaMesh core modules — no network, no real mDNS.

import { describe, it, expect, beforeEach } from "vitest";
import { NodeRegistry } from "../../src/discovery/registry.js";
import { MeshScheduler } from "../../src/scheduler/scheduler.js";
import { buildMagicPacket } from "../../src/power/wol.js";
import type { MeshNode, MeshTask } from "../../src/types/node.js";

// ── Test helpers ────────────────────────────────────────────────────────────

function makeNode(overrides: Partial<MeshNode> = {}): MeshNode {
    return {
        id: "test-node",
        name: "Test Node",
        role: "standard",
        state: "online",
        ip: "192.168.1.10",
        port: 11434,
        capabilities: {
            models: ["mistral:7b", "phi3:mini"],
            ramGb: 16,
            gpuAcceleration: false,
            inferenceWatts: 10,
            storageHub: false,
        },
        lastSeen: new Date(),
        tokensPerSec: 10,
        queueDepth: 0,
        thermalCelsius: 20,
        batteryStressScore: 0,
        ...overrides,
    };
}

function makeTask(overrides: Partial<MeshTask> = {}): MeshTask {
    return {
        id: "task-001",
        priority: "interactive",
        modelRequired: "mistral:7b",
        estimatedTokens: 500,
        messages: [{ role: "user", content: "Hello" }],
        timeoutMs: 30_000,
        ...overrides,
    };
}

// ── NodeRegistry ─────────────────────────────────────────────────────────────

describe("NodeRegistry", () => {
    let registry: NodeRegistry;

    beforeEach(() => {
        registry = new NodeRegistry();
    });

    it("upserts and retrieves a node", () => {
        const node = makeNode();
        registry.upsert(node);
        expect(registry.get("test-node")).toBeDefined();
        expect(registry.get("test-node")?.id).toBe("test-node");
    });

    it("returns available nodes (online + busy only)", () => {
        registry.upsert(makeNode({ id: "online", state: "online" }));
        registry.upsert(makeNode({ id: "busy", state: "busy" }));
        registry.upsert(makeNode({ id: "sleeping", state: "light_sleep" }));
        registry.upsert(makeNode({ id: "gone", state: "unreachable" }));

        const avail = registry.available();
        expect(avail).toHaveLength(2);
        expect(avail.map((n) => n.id)).toContain("online");
        expect(avail.map((n) => n.id)).toContain("busy");
    });

    it("marks node unreachable after 3 misses", () => {
        registry.upsert(makeNode());
        registry.recordMiss("test-node");
        registry.recordMiss("test-node");
        expect(registry.get("test-node")?.state).not.toBe("unreachable");
        registry.recordMiss("test-node");
        expect(registry.get("test-node")?.state).toBe("unreachable");
    });

    it("resets miss count on upsert", () => {
        const node = makeNode();
        registry.upsert(node);
        registry.recordMiss("test-node");
        registry.recordMiss("test-node");
        registry.upsert(node); // reset
        registry.recordMiss("test-node");
        registry.recordMiss("test-node");
        // Only 2 misses after reset — should NOT be unreachable yet
        expect(registry.get("test-node")?.state).not.toBe("unreachable");
    });

    it("filters by model (prefix match)", () => {
        registry.upsert(makeNode({ id: "has-mistral", capabilities: { models: ["mistral:7b"], ramGb: 8, gpuAcceleration: false, inferenceWatts: 10, storageHub: false } }));
        registry.upsert(makeNode({ id: "has-phi", capabilities: { models: ["phi3:mini"], ramGb: 8, gpuAcceleration: false, inferenceWatts: 10, storageHub: false } }));

        const mistralNodes = registry.withModel("mistral:7b");
        expect(mistralNodes).toHaveLength(1);
        expect(mistralNodes[0]?.id).toBe("has-mistral");
    });

    it("removes a node", () => {
        registry.upsert(makeNode());
        registry.remove("test-node");
        expect(registry.get("test-node")).toBeUndefined();
        expect(registry.size()).toBe(0);
    });
});

// ── MeshScheduler ─────────────────────────────────────────────────────────────

describe("MeshScheduler", () => {
    let registry: NodeRegistry;
    let scheduler: MeshScheduler;

    beforeEach(() => {
        registry = new NodeRegistry();
        scheduler = new MeshScheduler(registry);
    });

    it("returns null when no nodes available", () => {
        const result = scheduler.selectNode(makeTask());
        expect(result).toBeNull();
    });

    it("selects the only available node", () => {
        registry.upsert(makeNode({ id: "only-node" }));
        const result = scheduler.selectNode(makeTask());
        expect(result).not.toBeNull();
        expect(result?.node.id).toBe("only-node");
    });

    it("prefers GPU node over non-GPU node", () => {
        registry.upsert(makeNode({ id: "no-gpu", capabilities: { models: ["mistral:7b"], ramGb: 16, gpuAcceleration: false, inferenceWatts: 10, storageHub: false }, tokensPerSec: 10 }));
        registry.upsert(makeNode({ id: "gpu", capabilities: { models: ["mistral:7b"], ramGb: 16, gpuAcceleration: true, inferenceWatts: 6, storageHub: false }, tokensPerSec: 30 }));

        const result = scheduler.selectNode(makeTask());
        expect(result?.node.id).toBe("gpu");
    });

    it("prefers always_on over standard role", () => {
        registry.upsert(makeNode({ id: "standard", role: "standard" }));
        registry.upsert(makeNode({ id: "always-on", role: "always_on" }));

        const result = scheduler.selectNode(makeTask());
        expect(result?.node.id).toBe("always-on");
    });

    it("penalises high queue depth", () => {
        registry.upsert(makeNode({ id: "busy-node", queueDepth: 3 }));
        registry.upsert(makeNode({ id: "free-node", queueDepth: 0 }));

        const result = scheduler.selectNode(makeTask());
        expect(result?.node.id).toBe("free-node");
    });

    it("rejects overheating node (> 45°C)", () => {
        registry.upsert(makeNode({ id: "hot-node", thermalCelsius: 50 }));
        registry.upsert(makeNode({ id: "cool-node", thermalCelsius: 30 }));

        const result = scheduler.selectNode(makeTask());
        expect(result?.node.id).toBe("cool-node");
    });

    it("rejects too-busy node (queueDepth > 3)", () => {
        registry.upsert(makeNode({ id: "overloaded", queueDepth: 4 }));
        const result = scheduler.selectNode(makeTask());
        expect(result).toBeNull();
    });

    it("rejects battery-stressed node for non-interactive tasks", () => {
        registry.upsert(makeNode({ id: "stressed", batteryStressScore: 80 }));
        const result = scheduler.selectNode(makeTask({ priority: "batch" }));
        expect(result).toBeNull();
    });

    it("skips node without required model", () => {
        registry.upsert(makeNode({ id: "wrong-model", capabilities: { models: ["phi3:mini"], ramGb: 16, gpuAcceleration: false, inferenceWatts: 10, storageHub: false } }));
        const result = scheduler.selectNode(makeTask({ modelRequired: "mistral:7b" }));
        expect(result).toBeNull();
    });
});

// ── WoL — buildMagicPacket ────────────────────────────────────────────────────

describe("buildMagicPacket", () => {
    it("produces a 102-byte packet", () => {
        const packet = buildMagicPacket("aa:bb:cc:dd:ee:ff");
        expect(packet.length).toBe(102);
    });

    it("starts with 6 bytes of 0xFF", () => {
        const packet = buildMagicPacket("aa:bb:cc:dd:ee:ff");
        expect([...packet.slice(0, 6)]).toEqual([0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
    });

    it("contains MAC repeated 16 times after header", () => {
        const mac = "aa:bb:cc:dd:ee:ff";
        const macBytes = Buffer.from("aabbccddeeff", "hex");
        const packet = buildMagicPacket(mac);
        for (let i = 0; i < 16; i++) {
            const chunk = packet.slice(6 + i * 6, 6 + i * 6 + 6);
            expect(Buffer.compare(chunk, macBytes)).toBe(0);
        }
    });

    it("accepts hyphen-separated MAC", () => {
        expect(() => buildMagicPacket("aa-bb-cc-dd-ee-ff")).not.toThrow();
    });

    it("throws on invalid MAC", () => {
        expect(() => buildMagicPacket("not-a-mac")).toThrow();
        expect(() => buildMagicPacket("gg:hh:ii:jj:kk:ll")).toThrow();
    });
});
