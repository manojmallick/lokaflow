// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaLLM™ — lokaflow.io
//
// packages/lokallm/src/runner.ts
// PythonRunner — spawn a Python script, stream its stdout/stderr, and emit lifecycle events.

import { spawn, execSync, type ChildProcess } from "child_process";
import { EventEmitter } from "events";
import { existsSync } from "fs";

// ── Types ──────────────────────────────────────────────────────────────────

export interface PythonRunnerOptions {
  /** Path to Python executable — defaults to "python3" or "python" */
  pythonBin?: string;
  /** Script args */
  args?: string[];
  /** Working directory (defaults to process.cwd()) */
  cwd?: string;
  /** Extra environment variables */
  env?: Record<string, string>;
  /** Stream stdout lines as events instead of buffering */
  streamOutput?: boolean;
}

export type RunnerEvent =
  | { type: "stdout"; line: string }
  | { type: "stderr"; line: string }
  | { type: "progress"; percent: number; message: string }
  | { type: "exit"; code: number; output: string; errors: string };

export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

// ── PythonRunner ───────────────────────────────────────────────────────────

/**
 * Spawns a Python script as a child process and wraps it with:
 * - EventEmitter-based streaming (stdout / stderr / progress / exit)
 * - `run()` helper that resolves on exit or rejects on non-zero exit code
 * - Automatic detection of Python binary (python3 → python fallback)
 */
export class PythonRunner extends EventEmitter {
  private script: string;
  private opts: Required<PythonRunnerOptions>;
  private proc?: ChildProcess;

  constructor(script: string, opts: PythonRunnerOptions = {}) {
    super();
    if (!existsSync(script)) {
      throw new Error(`Python script not found: ${script}`);
    }
    this.script = script;
    this.opts = {
      pythonBin: opts.pythonBin ?? this.detectPython(),
      args: opts.args ?? [],
      cwd: opts.cwd ?? process.cwd(),
      env: opts.env ?? {},
      streamOutput: opts.streamOutput ?? false,
    };
  }

  private detectPython(): string {
    // Prefer python3, fall back to python (Windows)
    try {
      execSync("python3 --version", { stdio: "ignore" });
      return "python3";
    } catch {
      return "python";
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────

  /** Start the subprocess. Non-returning — use events or `run()`. */
  start(): void {
    const env = { ...process.env, ...this.opts.env };

    this.proc = spawn(this.opts.pythonBin, [this.script, ...this.opts.args], {
      cwd: this.opts.cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdoutBuf = "";
    let stderrBuf = "";

    this.proc.stdout!.setEncoding("utf8");
    this.proc.stdout!.on("data", (chunk: string) => {
      stdoutBuf += chunk;
      const lines = stdoutBuf.split("\n");
      stdoutBuf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        this.emit("data", { type: "stdout", line } satisfies RunnerEvent);
        this.parseProgress(line);
      }
    });

    this.proc.stderr!.setEncoding("utf8");
    this.proc.stderr!.on("data", (chunk: string) => {
      stderrBuf += chunk;
      const lines = stderrBuf.split("\n");
      stderrBuf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        this.emit("data", { type: "stderr", line } satisfies RunnerEvent);
        this.parseProgress(line);
      }
    });

    this.proc.on("close", (code) => {
      this.emit("data", {
        type: "exit",
        code: code ?? 1,
        output: stdoutBuf,
        errors: stderrBuf,
      } satisfies RunnerEvent);
    });

    this.proc.on("error", (err) => {
      this.emit("error", err);
    });
  }

  /**
   * Run script and resolve with stdout/stderr on completion.
   * Rejects if the exit code is non-zero.
   */
  run(): Promise<RunResult> {
    return new Promise((resolve, reject) => {
      const stdoutChunks: string[] = [];
      const stderrChunks: string[] = [];

      this.on("data", (ev: RunnerEvent) => {
        if (ev.type === "stdout") stdoutChunks.push(ev.line);
        if (ev.type === "stderr") stderrChunks.push(ev.line);
        if (ev.type === "exit") {
          const result: RunResult = {
            exitCode: ev.code,
            stdout: stdoutChunks.join("\n"),
            stderr: stderrChunks.join("\n"),
          };
          if (ev.code === 0) {
            resolve(result);
          } else {
            reject(Object.assign(new Error(`Python script exited with code ${ev.code}`), result));
          }
        }
      });

      this.start();
    });
  }

  /** Kill the running process */
  kill(): void {
    if (this.proc && !this.proc.killed) {
      this.proc.kill("SIGTERM");
    }
  }

  // ── Progress heuristics ───────────────────────────────────────────────

  /**
   * Attempt to parse Hugging Face / tqdm style progress lines.
   * E.g.: " 45%|████      | 45/100 [01:23<01:41, 0.54it/s]"
   * Emits `progress` event when a match is found.
   */
  private parseProgress(line: string): void {
    // tqdm: " 45%|..."
    const tqdm = line.match(/^\s*(\d{1,3})%\|/);
    if (tqdm) {
      const percent = parseInt(tqdm[1]!, 10);
      this.emit("data", { type: "progress", percent, message: line.trim() } satisfies RunnerEvent);
      return;
    }

    // HF Trainer: "{'loss': 1.234, 'epoch': 0.5}"
    const epoch = line.match(/'epoch':\s*([\d.]+)/);
    if (epoch) {
      const pct = Math.min(100, Math.round(parseFloat(epoch[1]!) * 100));
      this.emit("data", {
        type: "progress",
        percent: pct,
        message: line.trim(),
      } satisfies RunnerEvent);
    }
  }
}
