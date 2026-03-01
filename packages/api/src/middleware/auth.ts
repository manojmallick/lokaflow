// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
//
// packages/api/src/middleware/auth.ts
// Optional API key authentication middleware for the LokaFlow REST API.
// If no API key is configured, all requests are allowed (local-by-default).

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";

export interface AuthOptions {
    /** Required API key — if undefined, auth is disabled */
    apiKey?: string;
}

const authPlugin: FastifyPluginAsync<AuthOptions> = async (fastify, opts) => {
    if (!opts.apiKey) {
        // No API key configured — skip authentication entirely (local-first default)
        return;
    }

    fastify.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
        // Health endpoint is always public
        if (request.url === "/v1/health" || request.url === "/") {
            return;
        }

        const authHeader = request.headers["authorization"];
        const keyHeader = request.headers["x-api-key"] as string | undefined;

        const token =
            authHeader?.startsWith("Bearer ")
                ? authHeader.slice(7)
                : keyHeader;

        if (token !== opts.apiKey) {
            return reply.code(401).send({
                error: {
                    type: "authentication_error",
                    code: "invalid_api_key",
                    message: "Invalid API key. Pass your key via 'Authorization: Bearer <key>' or 'x-api-key: <key>'.",
                },
            });
        }
    });
};

export default fp(authPlugin, { name: "lokaflow-auth" });
