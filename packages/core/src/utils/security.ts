// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.

/** Security utilities — key masking, safe logging helpers. */

/**
 * Mask an API key for safe display in logs or CLI output.
 * Preserves the prefix (up to 10 chars) and replaces the rest with ***.
 *
 * @example
 *   maskKey("sk-ant-api03-abc123xyz") → "sk-ant-api***"
 */
export function maskKey(key: string): string {
  if (!key || key.length === 0) return "(empty)";
  const prefixLen = Math.min(10, Math.floor(key.length / 3));
  return `${key.slice(0, prefixLen)}***`;
}

/**
 * Safely read an environment variable.
 * Returns undefined (not an empty string) if not set.
 */
export function envVar(name: string): string | undefined {
  const val = process.env[name];
  return val && val.trim().length > 0 ? val.trim() : undefined;
}

/**
 * Assert a required environment variable is present.
 * Throws with a helpful message if missing.
 */
export function requireEnvVar(name: string): string {
  const val = envVar(name);
  if (!val) {
    throw new Error(
      `Required environment variable '${name}' is not set. ` +
        `See .env.example for setup instructions.`,
    );
  }
  return val;
}
