// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.

import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// NodeNext TypeScript requires .js extensions in imports; at test-time
// Vitest must remap .js → .ts so it can find the source files directly.
// Workspace packages are aliased to their TypeScript source so tests pass
// even when dependencies have not been built (e.g. fresh CI checkout).
export default defineConfig({
  resolve: {
    alias: {
      "@lokaflow/core": resolve(__dirname, "../core/src/index.ts"),
      "@lokaflow/agent": resolve(__dirname, "../agent/src/index.ts"),
    },
    extensionAlias: {
      ".js": [".ts", ".js"],
    },
  },
  test: {
    environment: "node",
  },
});
