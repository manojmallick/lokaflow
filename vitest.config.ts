// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.

import path from "path";
import { defineConfig } from "vitest/config";

// Root-level tests in tests/unit/ were written against the old monolithic
// src/ layout.  All sources moved into packages/core/src/.  The alias
// below remaps any relative import of the form "../../src/<path>" to
// packages/core/src/<path> so we don't have to touch every test file.
const coreSrc = path.resolve("packages/core/src");

export default defineConfig({
  resolve: {
    alias: [
      {
        // Matches ../../src/<anything> or ../src/<anything> etc.
        find: /^(\.\.\/)+src\/(.*)/,
        replacement: `${coreSrc}/$2`,
      },
    ],
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/core/src/router/**", "packages/core/src/search/**", "packages/core/src/memory/**"],
      exclude: [
        "**/dist/**",
        "**/node_modules/**",
        // Re-export barrels and stub entry points have 0% coverage by design
        "**/index.ts",
        // High-level orchestration class — depends on live providers; covered by integration tests
        "packages/core/src/router/router.ts",
        // Search retriever stub and Brave/Arxiv HTTP adapters — covered by integration tests
        "packages/core/src/search/retriever.ts",
        "packages/core/src/search/sources/**",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
      reporter: ["text", "lcov", "html"],
    },
  },
});
