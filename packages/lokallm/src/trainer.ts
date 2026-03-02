// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaLLM™ — lokaflow.io
//
// packages/lokallm/src/trainer.ts
// LokaTrainer — orchestrates QLoRA fine-tuning via lora.py with progress events.

import { EventEmitter } from "events";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { PythonRunner, type RunnerEvent } from "./runner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LORA_SCRIPT = join(__dirname, "train", "lora.py");

// ── Types ──────────────────────────────────────────────────────────────────

export interface TrainingConfig {
  /** Path to JSONL training dataset */
  dataset: string;
  /** Directory to save LoRA adapters */
  outputDir: string;
  /** Base model (HuggingFace ID) */
  baseModel?: string;
  /** Number of training epochs */
  epochs?: number;
  /** Micro-batch size */
  batchSize?: number;
  /** Python binary override */
  pythonBin?: string;
}

export interface TrainingProgress {
  percent: number;
  message: string;
  epochEstimate?: number;
  loss?: number;
}

export type TrainerEvent =
  | { type: "start"; config: TrainingConfig }
  | { type: "progress"; progress: TrainingProgress }
  | { type: "log"; level: "info" | "warn" | "error"; message: string }
  | { type: "complete"; outputDir: string; durationMs: number }
  | { type: "error"; error: Error };

// ── LokaTrainer ────────────────────────────────────────────────────────────

export class LokaTrainer extends EventEmitter {
  private runner?: PythonRunner;
  private startedAt?: number;

  async train(config: TrainingConfig): Promise<string> {
    this.startedAt = Date.now();

    const args = [
      "--dataset", config.dataset,
      "--output_dir", config.outputDir,
    ];

    if (config.baseModel) args.push("--base_model", config.baseModel);
    if (config.epochs !== undefined) args.push("--epochs", String(config.epochs));
    if (config.batchSize !== undefined) args.push("--batch_size", String(config.batchSize));

    this.runner = new PythonRunner(LORA_SCRIPT, {
      args,
      pythonBin: config.pythonBin,
    });

    this.emit("data", { type: "start", config } satisfies TrainerEvent);

    this.runner.on("data", (ev: RunnerEvent) => {
      if (ev.type === "stdout" || ev.type === "stderr") {
        const level = ev.type === "stderr" ? "warn" : "info";
        this.emit("data", { type: "log", level, message: ev.line } satisfies TrainerEvent);
      }

      if (ev.type === "progress") {
        const progress: TrainingProgress = { percent: ev.percent, message: ev.message };

        // Extract epoch from message
        const epochMatch = ev.message.match(/'epoch':\s*([\d.]+)/);
        if (epochMatch) progress.epochEstimate = parseFloat(epochMatch[1]);

        // Extract loss
        const lossMatch = ev.message.match(/'loss':\s*([\d.]+)/);
        if (lossMatch) progress.loss = parseFloat(lossMatch[1]);

        this.emit("data", { type: "progress", progress } satisfies TrainerEvent);
      }
    });

    return new Promise<string>((resolve, reject) => {
      this.runner!.run()
        .then(() => {
          const durationMs = Date.now() - (this.startedAt ?? Date.now());
          this.emit("data", {
            type: "complete",
            outputDir: config.outputDir,
            durationMs,
          } satisfies TrainerEvent);
          resolve(config.outputDir);
        })
        .catch((err: Error) => {
          this.emit("data", { type: "error", error: err } satisfies TrainerEvent);
          reject(err);
        });
    });
  }

  stop(): void {
    this.runner?.kill();
  }
}
