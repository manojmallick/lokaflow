// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
//
// packages/mesh/src/types/config.ts
// LokaMesh configuration schema — validated with Zod from lokanet.yaml.

import { z } from "zod";

const sleepConfigSchema = z.object({
    enabled: z.boolean().default(false),
    /** Minutes of idle before entering light_sleep */
    idleMinutes: z.number().min(1).default(15),
    /** Enable Wake-on-LAN for deep_sleep wakeup */
    wol: z.boolean().default(false),
});

const meshNodeConfigSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    role: z.enum(["orchestrator", "always_on", "standard", "storage", "nano"]),
    /** "auto" = discovered via mDNS */
    ip: z.union([z.string().ip(), z.literal("auto")]).default("auto"),
    /** Ollama port — default 11434 */
    port: z.number().default(11434),
    /** Models that must be available on this node */
    models: z.array(z.string()).default([]),
    ramGb: z.number().min(1),
    inferenceWatts: z.number().min(0).default(10),
    gpuAcceleration: z.boolean().default(false),
    storageHub: z.boolean().default(false),
    /** Required for WoL wake (e.g. "aa:bb:cc:dd:ee:ff") */
    macAddress: z
        .string()
        .regex(/^([0-9A-Fa-f]{2}[:\-]){5}[0-9A-Fa-f]{2}$/)
        .optional(),
    sleep: sleepConfigSchema.default({}),
});

export const lokaMeshConfigSchema = z.object({
    nodes: z.array(meshNodeConfigSchema).min(1),
    /** mDNS discovery interval in ms */
    discoveryIntervalMs: z.number().default(30_000),
    /** Healthcheck ping interval in ms */
    healthCheckIntervalMs: z.number().default(10_000),
    /** Default task execution timeout in ms */
    taskTimeoutMs: z.number().default(120_000),
    green: z
        .object({
            enabled: z.boolean().default(true),
            /** ElectricityMaps zone code (e.g. "NL", "DE", "FR") */
            zone: z.string().default("NL"),
            /** electricitymap.org API key (free tier: 5 req/min) */
            carbonApiKey: z.string().default(""),
        })
        .default({}),
});

export type LokaMeshConfig = z.infer<typeof lokaMeshConfigSchema>;
export type MeshNodeConfig = z.infer<typeof meshNodeConfigSchema>;
export type SleepConfig = z.infer<typeof sleepConfigSchema>;
