// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// Minimal type declaration for multicast-dns (no @types package available).

declare module "multicast-dns" {
  import { EventEmitter } from "events";

  interface MdnsAnswer {
    name: string;
    type: string;
    data: unknown;
    ttl?: number;
  }

  interface MdnsResponse {
    answers: MdnsAnswer[];
    additionals?: MdnsAnswer[];
  }

  interface MdnsInstance extends EventEmitter {
    query(q: Record<string, unknown>): void;
    destroy(cb?: () => void): void;
  }

  function multicastDns(opts?: Record<string, unknown>): MdnsInstance;
  export = multicastDns;
}
