// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
//
// packages/cli/src/utils/meshConfig.ts
// Resolves lokanet.yaml config file for LokaMesh CLI commands.

import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import chalk from "chalk";

const CANDIDATES = [process.cwd(), join(homedir(), ".lokaflow")];

/**
 * Resolve lokanet.yaml from cwd or ~/.lokaflow/.
 * Prints a helpful error and returns null if not found.
 */
export function resolveMeshConfigPath(): string | null {
  for (const dir of CANDIDATES) {
    const candidate = join(dir, "lokanet.yaml");
    if (existsSync(candidate)) return candidate;
  }

  console.error(chalk.red("[LokaMesh] No lokanet.yaml found."));
  console.error(chalk.gray("  Searched:"));
  for (const dir of CANDIDATES) {
    console.error(chalk.gray(`    ${join(dir, "lokanet.yaml")}`));
  }
  console.error(
    chalk.yellow(
      "\n  Create your cluster config by copying the example:\n" +
        "    cp config/lokanet.example.yaml lokanet.yaml\n" +
        "  Then edit it to match your devices.",
    ),
  );
  return null;
}
