// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    // LLM inference is slow — generous timeouts
    testTimeout: 120_000,
    hookTimeout: 30_000,
    // Run integration tests sequentially to avoid hammering Ollama
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});
