// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaLLM™ — lokaflow.io
//
// packages/lokallm/src/index.ts
// Public API — orchestration bridge between Node.js tooling and Python fine-tuning pipeline.

export { PythonRunner } from "./runner.js";
export type { PythonRunnerOptions, RunnerEvent, RunResult } from "./runner.js";

export { LokaTrainer } from "./trainer.js";
export type { TrainingConfig, TrainingProgress, TrainerEvent } from "./trainer.js";

export { GGUFExporter } from "./exporter.js";
export type { ExportConfig, ExporterEvent } from "./exporter.js";

// ── Convenience facade ─────────────────────────────────────────────────────

import { LokaTrainer } from "./trainer.js";
import { GGUFExporter } from "./exporter.js";

export interface FullPipelineConfig {
  dataset: string;
  adapterOutputDir: string;
  ggufOutputPath: string;
  baseModel?: string;
  epochs?: number;
  batchSize?: number;
  pythonBin?: string;
  ollamaModelfileTemplate?: "phi3" | "llama3" | "mistral";
}

export interface FullPipelineResult {
  adapterDir: string;
  ggufPath: string;
  ollamaModelfile: string;
  trainingMs: number;
  exportMs: number;
}

/**
 * Run the full fine-tune → GGUF export pipeline in sequence.
 *
 * @example
 * ```ts
 * import { runFullPipeline } from "@lokaflow/lokallm";
 *
 * const result = await runFullPipeline({
 *   dataset: "./data/routing_qa.jsonl",
 *   adapterOutputDir: "./out/adapter",
 *   ggufOutputPath: "./out/lokaflow-phi3.gguf",
 *   epochs: 3,
 * });
 * console.log("GGUF ready at:", result.ggufPath);
 * ```
 */
export async function runFullPipeline(config: FullPipelineConfig): Promise<FullPipelineResult> {
  const trainer = new LokaTrainer();
  const exporter = new GGUFExporter();

  const trainStart = Date.now();
  const adapterDir = await trainer.train({
    dataset: config.dataset,
    outputDir: config.adapterOutputDir,
    baseModel: config.baseModel,
    epochs: config.epochs,
    batchSize: config.batchSize,
    pythonBin: config.pythonBin,
  });

  const exportStart = Date.now();
  const ggufPath = await exporter.export({
    adapter: adapterDir,
    output: config.ggufOutputPath,
    baseModel: config.baseModel,
    pythonBin: config.pythonBin,
  });

  const ollamaModelfile = exporter.generateOllamaModelfile(
    ggufPath,
    config.ollamaModelfileTemplate ?? "phi3",
  );

  return {
    adapterDir,
    ggufPath,
    ollamaModelfile,
    trainingMs: exportStart - trainStart,
    exportMs: Date.now() - exportStart,
  };
}
