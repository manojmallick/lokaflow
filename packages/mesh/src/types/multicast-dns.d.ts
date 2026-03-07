// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// Minimal type declaration for multicast-dns (no @types package available).
/* eslint-disable @typescript-eslint/no-unused-vars */

declare module "multicast-dns" {
  import { EventEmitter } from "events";

  interface MdnsAnswer {
    name: string;
    type: string;
    data: unknown;
    ttl?: number;
  }

  interface MdnsInstance extends EventEmitter {
    query(q: Record<string, unknown>): void;
    destroy(cb?: () => void): void;
  }

  function multicastDns(opts?: Record<string, unknown>): MdnsInstance;
  export = multicastDns;
}
