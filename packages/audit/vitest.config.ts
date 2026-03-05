// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.

import { fileURLToPath } from "url";
import path from "path";
import { defineConfig } from "vitest/config";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// NodeNext TypeScript requires .js extensions in imports; at test-time
// Vitest must remap .js → .ts so it can find the source files directly.
// @lokaflow/orchestrator is aliased to its TS source so tests run without
// a prior build step (dist/ does not exist in a clean CI workspace).
export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@lokaflow/orchestrator",
        replacement: path.resolve(__dirname, "../orchestrator/src/index.ts"),
      },
    ],
    extensionAlias: {
      ".js": [".ts", ".js"],
    },
  },
  test: {
    environment: "node",
  },
});
