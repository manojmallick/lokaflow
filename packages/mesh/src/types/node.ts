// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
//
// packages/mesh/src/types/node.ts
// Core node types for the LokaMesh cluster layer.

export type NodeState =
    | "online"       // reachable, Ollama responding
    | "busy"         // online, currently processing a task
    | "light_sleep"  // display off, RAM retained (~5W)
    | "deep_sleep"   // S3/S4 (~1W), woken by WoL magic packet
    | "waking"       // magic packet sent, waiting for boot (30–90s)
    | "unreachable"; // missed 3 consecutive heartbeats

export type NodeRole =
    | "orchestrator" // makes routing decisions (MacBook Air M4)
    | "always_on"    // 24/7 home base (Mac Mini M2)
    | "standard"     // sleep/wake on demand
    | "storage"      // model library hub (Desktop i5)
    | "nano";        // low-power ambient tasks

export interface NodeCapabilities {
    /** Models available on this node e.g. ["mistral:7b", "phi3:mini"] */
    models: string[];
    ramGb: number;
    /** True for Apple Silicon (Metal GPU acceleration) */
    gpuAcceleration: boolean;
    /** Typical watts during inference */
    inferenceWatts: number;
    /** Shares model library via filesystem (Samba/NFS) */
    storageHub: boolean;
}

export interface MeshNode {
    id: string;
    name: string;
    role: NodeRole;
    state: NodeState;
    ip: string;
    /** Ollama port — default 11434 */
    port: number;
    capabilities: NodeCapabilities;
    lastSeen: Date;
    /** Currently executing task, if any */
    currentTaskId?: string;
    /** Required for Wake-on-LAN */
    macAddress?: string;
    /** Approximate tokens/sec for the default model */
    tokensPerSec: number;
    /** Current queue depth (tasks waiting) */
    queueDepth: number;
    /** CPU temperature in Celsius — throttle routing > 45°C */
    thermalCelsius: number;
    /** Battery stress score 0–100 (0 = no stress, 100 = critical) */
    batteryStressScore: number;
}

export type TaskPriority = "interactive" | "batch" | "ambient";

export interface MeshTask {
    id: string;
    priority: TaskPriority;
    /** Ollama model tag e.g. "mistral:7b" */
    modelRequired: string;
    estimatedTokens: number;
    messages: Array<{ role: string; content: string }>;
    timeoutMs: number;
}

export interface MeshTaskResult {
    taskId: string;
    nodeId: string;
    content: string;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    success: boolean;
    error?: string;
}
