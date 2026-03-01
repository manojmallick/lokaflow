// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.

/**
 * Configuration loader for LokaFlow™.
 * Reads lokaflow.yaml from the project directory or ~/.lokaflow/config.yaml.
 * Validates with Zod and provides typed defaults.
 */

import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

import yaml from "js-yaml";
import { z } from "zod";

import { ConfigurationError } from "./exceptions.js";
import type { LokaFlowConfig } from "./types.js";

// ── Zod schema ───────────────────────────────────────────────────────────────

const RouterSchema = z.object({
  complexityLocalThreshold: z.number().min(0).max(1).default(0.35),
  complexityCloudThreshold: z.number().min(0).max(1).default(0.65),
  maxLocalTokens: z.number().positive().default(8000),
  piiScan: z.boolean().default(true),
  piiAction: z.enum(["force_local", "redact", "block"]).default("force_local"),
  fallbackToLocal: z.boolean().default(true),
  specialistProvider: z.string().optional(),
  specialistModel: z.string().optional(),
});

const BudgetSchema = z.object({
  dailyEur: z.number().nonnegative().default(2.0),
  monthlyEur: z.number().nonnegative().default(30.0),
  warnAtPercent: z.number().min(0).max(100).default(80),
});

const LocalSchema = z.object({
  provider: z.literal("ollama").default("ollama"),
  baseUrl: z.string().url().optional(), // For backwards compat before transform
  baseUrls: z.union([z.string().url(), z.array(z.string().url())]).optional(),
  defaultModel: z.string().default("mistral:7b"),
  timeoutSeconds: z.number().positive().default(60),
}).transform(data => {
  // Normalize baseUrl/baseUrls into strictly the `baseUrls` array
  const urls = data.baseUrls ?? data.baseUrl ?? "http://localhost:11434";
  return {
    ...data,
    baseUrls: Array.isArray(urls) ? urls : [urls],
  };
});

const CloudSchema = z.object({
  primary: z.string().default("claude"),
  fallback: z.string().default("openai"),
  claudeModel: z.string().default("claude-sonnet-4-20250514"),
  openaiModel: z.string().default("gpt-4o"),
  geminiModel: z.string().default("gemini-2.0-flash"),
  groqModel: z.string().default("llama-3.3-70b-versatile"),
  mistralModel: z.string().optional(),
  togetherModel: z.string().optional(),
  perplexityModel: z.string().optional(),
  azureDeployment: z.string().optional(),
  cohereModel: z.string().optional(),
});

const SpecialistSchema = z.object({
  provider: z.string().default("ollama"),
  model: z.string().default("llama3.3:70b"),
});

const PrivacySchema = z.object({
  telemetry: z.boolean().default(false),
  logQueries: z.boolean().default(false),
  logLevel: z.enum(["DEBUG", "INFO", "WARNING", "ERROR"]).default("INFO"),
});

const OutputSchema = z.object({
  showRoutingDecision: z.boolean().default(true),
  showCost: z.boolean().default(true),
  showSavings: z.boolean().default(true),
  stream: z.boolean().default(true),
});

const SearchSchema = z.object({
  enabled: z.boolean().default(false),
  maxResults: z.number().int().positive().default(5),
  braveEnabled: z.boolean().default(true),
  arxivEnabled: z.boolean().default(true),
  filterThreshold: z.number().min(0).max(10).default(5),
});

const MemorySchema = z.object({
  enabled: z.boolean().default(false),
  topK: z.number().int().positive().default(4),
  sessionId: z.string().default("default"),
});

const ConfigSchema = z.object({
  router: RouterSchema.default({}),
  budget: BudgetSchema.default({}),
  local: LocalSchema.default({}),
  specialist: SpecialistSchema.optional(),
  cloud: CloudSchema.default({}),
  privacy: PrivacySchema.default({}),
  output: OutputSchema.default({}),
  search: SearchSchema.default({}),
  memory: MemorySchema.default({}),
});

// ── YAML key → camelCase mapping ─────────────────────────────────────────────

/** Convert snake_case YAML keys to camelCase for Zod schema. */
function toCamel(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(toCamel);
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [
        k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
        toCamel(v),
      ]),
    );
  }
  return obj;
}

// ── Loader ───────────────────────────────────────────────────────────────────

const SEARCH_PATHS = [
  "lokaflow.yaml",
  "config/lokaflow.yaml",
  join(homedir(), ".lokaflow", "config.yaml"),
];

export function loadConfig(configPath?: string): LokaFlowConfig {
  const paths = configPath ? [configPath] : SEARCH_PATHS;
  const found = paths.find((p) => existsSync(p));

  if (!found) {
    // No config file — use all defaults (works for local-only mode)
    return ConfigSchema.parse({}) as LokaFlowConfig;
  }

  let raw: unknown;
  try {
    raw = yaml.load(readFileSync(found, "utf8"));
  } catch (err) {
    throw new ConfigurationError(`Failed to read config at '${found}': ${String(err)}`);
  }

  const result = ConfigSchema.safeParse(toCamel(raw));
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new ConfigurationError(`Invalid configuration in '${found}':\n${issues}`);
  }

  return result.data as LokaFlowConfig;
}

export const defaultConfig: LokaFlowConfig = ConfigSchema.parse({}) as LokaFlowConfig;
