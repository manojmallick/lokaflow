// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
//
// packages/mesh/src/power/sleep.ts
// SleepStateMachine — tracks idle time and manages ONLINE → SLEEP → WAKING transitions.
//
// State graph:
//   ONLINE ──(idle idleMinutes)──→ LIGHT_SLEEP
//   LIGHT_SLEEP ──(idle 2x)──→ DEEP_SLEEP
//   DEEP_SLEEP + WoL enabled ──(wake request)──→ WAKING
//   WAKING ──(boot complete: 30–90s)──→ ONLINE

import EventEmitter from "events";
import type { NodeState } from "../types/node.js";
import type { NodeRegistry } from "../discovery/registry.js";

export interface SleepConfig {
    nodeId: string;
    idleMinutes: number;
    wolEnabled: boolean;
    macAddress?: string;
}

export type SleepEvent =
    | { type: "entering_light_sleep"; nodeId: string }
    | { type: "entering_deep_sleep"; nodeId: string }
    | { type: "waking"; nodeId: string }
    | { type: "online"; nodeId: string };

export class SleepStateMachine extends EventEmitter {
    private state: NodeState = "online";
    private lastActivityAt = Date.now();
    private timer: NodeJS.Timeout | null = null;
    private readonly idleMs: number;

    constructor(
        private readonly config: SleepConfig,
        private readonly registry: NodeRegistry,
    ) {
        super();
        this.idleMs = config.idleMinutes * 60 * 1_000;
    }

    start(): void {
        this._scheduleCheck();
    }

    stop(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    /** Call when any activity happens on this node (incoming task, user interaction) */
    recordActivity(): void {
        this.lastActivityAt = Date.now();
        if (this.state !== "online" && this.state !== "busy") {
            this._transitionTo("online");
        }
    }

    /** Get current state */
    getState(): NodeState {
        return this.state;
    }

    private _scheduleCheck(): void {
        // Check every minute
        this.timer = setTimeout(() => {
            this._checkIdle();
            this._scheduleCheck();
        }, 60_000);
    }

    private _checkIdle(): void {
        if (this.state === "waking" || this.state === "busy") return;

        const idleDuration = Date.now() - this.lastActivityAt;

        if (this.state === "online" && idleDuration >= this.idleMs) {
            this._transitionTo("light_sleep");
        } else if (this.state === "light_sleep" && idleDuration >= this.idleMs * 2) {
            this._transitionTo("deep_sleep");
        }
    }

    private _transitionTo(state: NodeState): void {
        this.state = state;
        this.registry.setState(this.config.nodeId, state);

        const eventMap: Record<NodeState, SleepEvent["type"] | null> = {
            light_sleep: "entering_light_sleep",
            deep_sleep: "entering_deep_sleep",
            waking: "waking",
            online: "online",
            busy: null,
            unreachable: null,
        };

        const eventType = eventMap[state];
        if (eventType) {
            this.emit("transition", { type: eventType, nodeId: this.config.nodeId } satisfies SleepEvent);
        }
    }

    /** Request wakeup — sends WoL if in deep_sleep and WoL is configured */
    async requestWakeup(): Promise<boolean> {
        if (this.state === "online" || this.state === "busy") return true;

        if (this.state === "deep_sleep" && this.config.wolEnabled && this.config.macAddress) {
            const { sendWol } = await import("./wol.js");
            await sendWol(this.config.macAddress);
            this._transitionTo("waking");
            return true;
        }

        return false; // Cannot wake without WoL
    }
}
