import { describe, it, expect } from "vitest";

describe("ProxyServer", () => {
    it("initializes without throwing", async () => {
        // Dynamic import to avoid static TS analysis failures on missing dependencies
        // since the pnpm workspace is temporarily disabled
        const { ProxyServer } = await import("../../src/proxy/server.js");
        const proxy = new ProxyServer(4041);
        expect(proxy).toBeDefined();
    });
});
