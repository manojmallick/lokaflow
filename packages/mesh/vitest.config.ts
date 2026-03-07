// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.

import { defineConfig } from "vitest/config";

// NodeNext TypeScript requires .js extensions in imports; at test-time
// Vitest must remap .js → .ts so it can find the source files directly.
export default defineConfig({
  resolve: {
    extensionAlias: {
      ".js": [".ts", ".js"],
    },
  },
  test: {
    environment: "node",
  },
});
