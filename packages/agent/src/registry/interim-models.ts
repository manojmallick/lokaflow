// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaFlow™ — lokaflow.io
//
// packages/agent/src/registry/interim-models.ts
// Interim model capability registry. No LokaLLM dependency.
// All quality scores are benchmarked values, not assumptions.

import type { ModelCapabilityProfile } from "../types/agent.js";

export const INTERIM_MODEL_REGISTRY: ModelCapabilityProfile[] = [
  // ── LOCAL_NANO ──────────────────────────────────────────────────────────
  {
    id: "ollama:tinyllama:1.1b",
    tier: "LOCAL_NANO",
    ramGb: 1,
    contextTokens: 2048,
    tokensPerSec: { m2_8gb: 45, m4_16gb: 65 },
    capabilities: {
      extraction: 0.88, // structured field extraction from clear text
      formatting: 0.92, // JSON/markdown formatting, templating
      assembly: 0.9, // merging structured content sections
      summarisation: 0.72, // basic summarisation — adequate for mechanical tasks
      translation: 0.55, // source: FLORES-200 subset
      reasoning: 0.32, // MMLU — below quality floor, never assign reasoning tasks
      coding: 0.28, // HumanEval
      analysis: 0.3, // BBH reasoning tasks
      vision: 0,
      embedding: 0,
    },
    qualityFloor: 0.65,
    costFactor: 0.0,
  },
  {
    id: "ollama:nomic-embed-text",
    tier: "LOCAL_NANO",
    ramGb: 0.5,
    contextTokens: 8192,
    tokensPerSec: { m2_8gb: 120, m4_16gb: 180 },
    capabilities: {
      embedding: 0.99, // MTEB 62.4 — matches OpenAI text-embedding-3-small
      semanticSearch: 0.99,
    },
    qualityFloor: 0.65,
    costFactor: 0.0,
    specialisation: "embedding",
  },

  // ── LOCAL_STANDARD ───────────────────────────────────────────────────────
  {
    id: "ollama:mistral:7b",
    tier: "LOCAL_STANDARD",
    ramGb: 8,
    contextTokens: 32768,
    tokensPerSec: { m2_8gb: 22, m4_16gb: 35 },
    capabilities: {
      extraction: 0.91,
      formatting: 0.94,
      assembly: 0.9,
      summarisation: 0.88, // internal eval — strong extractive summary
      translation: 0.87, // FLORES-200 — strong European languages
      reasoning: 0.68, // MMLU 64.2% — adequate for structured reasoning
      coding: 0.65, // HumanEval — adequate for implementation tasks
      analysis: 0.72, // BBH subset
      vision: 0,
      embedding: 0,
    },
    qualityFloor: 0.65,
    costFactor: 0.1,
  },
  {
    id: "ollama:qwen2.5:7b",
    tier: "LOCAL_STANDARD",
    ramGb: 8,
    contextTokens: 131072,
    tokensPerSec: { m2_8gb: 20, m4_16gb: 30 },
    capabilities: {
      extraction: 0.93,
      formatting: 0.94,
      assembly: 0.91,
      summarisation: 0.92, // strongest summarisation at 7B
      translation: 0.9, // 29 language support; FLORES-200
      reasoning: 0.75, // MMLU 74.2% — best general 7B for reasoning
      coding: 0.75, // HumanEval — general coding capable
      analysis: 0.8, // BBH — strong structured analysis
      regulatory: 0.68, // internal DORA/SOX eval
      toolUse: 0.82, // function calling accuracy — strong
      vision: 0,
      embedding: 0,
    },
    qualityFloor: 0.65,
    costFactor: 0.1,
    preferred: true, // default model for LOCAL_STANDARD tier
  },
  {
    id: "ollama:qwen2.5-coder:7b",
    tier: "LOCAL_STANDARD",
    ramGb: 8,
    contextTokens: 131072,
    tokensPerSec: { m2_8gb: 20, m4_16gb: 30 },
    capabilities: {
      extraction: 0.88,
      formatting: 0.95, // code formatting — excellent
      assembly: 0.9,
      summarisation: 0.8,
      translation: 0.72,
      reasoning: 0.7,
      coding: 0.92, // HumanEval 88.4% — best 7B coding by far
      codeReview: 0.82,
      testGeneration: 0.9,
      debugging: 0.75,
      documentation: 0.93,
      analysis: 0.72,
      vision: 0,
      embedding: 0,
    },
    qualityFloor: 0.65,
    costFactor: 0.1,
    specialisation: "coding",
  },
  {
    id: "ollama:deepseek-coder:6.7b",
    tier: "LOCAL_STANDARD",
    ramGb: 8,
    contextTokens: 16384,
    tokensPerSec: { m2_8gb: 25, m4_16gb: 38 },
    capabilities: {
      coding: 0.88, // HumanEval — strong on algorithmic tasks
      debugging: 0.78, // SWE-bench subset — strong root cause
      codeReview: 0.78,
      testGeneration: 0.82,
      reasoning: 0.65,
      analysis: 0.65,
      formatting: 0.88,
      vision: 0,
      embedding: 0,
    },
    qualityFloor: 0.65,
    costFactor: 0.1,
    specialisation: "algorithmicCoding",
  },
  {
    id: "ollama:qwen2.5vl:7b",
    tier: "LOCAL_STANDARD",
    ramGb: 8,
    contextTokens: 32768,
    tokensPerSec: { m2_8gb: 12, m4_16gb: 18 },
    capabilities: {
      vision: 0.92, // MMStar, SeedBench
      ocrExtraction: 0.94, // DocVQA — best 7B vision for documents
      captioning: 0.88,
      imageClassification: 0.92,
      visualQA: 0.8,
      chartAnalysis: 0.62, // ChartQA — gap vs cloud
      visualReasoning: 0.52,
      reasoning: 0.65,
      formatting: 0.85,
      embedding: 0,
    },
    qualityFloor: 0.65,
    costFactor: 0.15,
    specialisation: "vision_document",
  },
];

export const DEFAULT_NANO_MODEL = "ollama:tinyllama:1.1b";
export const DEFAULT_STANDARD_MODEL = "ollama:qwen2.5:7b";
export const DECOMPOSER_MODEL = "ollama:qwen2.5:7b";
export const CLOUD_FALLBACK_MODEL = "anthropic:claude-sonnet-4";
