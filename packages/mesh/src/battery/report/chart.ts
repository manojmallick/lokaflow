// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaMesh Battery Intelligence™ — lokaflow.io

import chalk from "chalk";
import type { ChalkInstance } from "chalk";

export interface ChartDataPoint {
  label: string; // x-axis label (e.g. date, node name)
  value: number; // y-axis value
}

export interface ChartOptions {
  title?: string;
  /** Width in terminal columns (default 60) */
  width?: number;
  /** Height in terminal rows (default 8) */
  height?: number;
  /** Min y value. Defaults to min(values) − 2 */
  yMin?: number;
  /** Max y value. Defaults to max(values) + 2 */
  yMax?: number;
  /** Unit suffix shown on y-axis (e.g. "%", "°C") */
  unit?: string;
  /** Colour function for bars — receives normalised value 0–1 */
  colourFn?: (normalisedValue: number) => ChalkInstance;
}

/** Default colour: green → yellow → red by value (high = green for health%) */
function defaultColour(v: number): ChalkInstance {
  if (v >= 0.8) return chalk.green;
  if (v >= 0.5) return chalk.yellow;
  return chalk.red;
}

/**
 * renderSparkline — renders a compact single-row spark-bar chart.
 *
 * ```
 * Health %  ▇▇▇▇▇▆▆▆▅▅▅▄▄  92% → 88%
 * ```
 */
export function renderSparkline(
  points: ChartDataPoint[],
  opts: Pick<ChartOptions, "unit" | "colourFn"> = {},
): string {
  if (points.length === 0) return chalk.dim("(no data)");

  const values = points.map((p) => p.value);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = maxV - minV || 1;

  const blocks = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
  const colourFn = opts.colourFn ?? defaultColour;
  const unit = opts.unit ?? "";

  const bars = values.map((v) => {
    const norm = (v - minV) / range;
    const blockIdx = Math.min(7, Math.floor(norm * 8));
    const block = blocks[blockIdx] ?? "▁";
    return colourFn(norm)(block);
  });

  const first = values[0]?.toFixed(1) ?? "?";
  const last = values[values.length - 1]?.toFixed(1) ?? "?";
  return `${bars.join("")}  ${chalk.dim(first + unit + " → ")}${chalk.bold(last + unit)}`;
}

/**
 * renderBarChart — renders a full vertical bar chart with y-axis labels.
 *
 * ```
 * Health History — mac-mini-m2
 * 100 ┤
 *  95 ┤████████████████████████████████████████████████████
 *  90 ┤
 *  85 ┤
 *  80 ┼────────────────────────────────────────────────────
 *     Jan  Feb  Mar  Apr  May  Jun  Jul  Aug  Sep  Oct  Nov
 * ```
 */
export function renderBarChart(points: ChartDataPoint[], opts: ChartOptions = {}): string {
  if (points.length === 0) return chalk.dim("  (no data)\n");

  const width = opts.width ?? 60;
  const height = opts.height ?? 8;
  const unit = opts.unit ?? "";
  const colourFn = opts.colourFn ?? defaultColour;

  const values = points.map((p) => p.value);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const yMin = opts.yMin ?? Math.max(0, dataMin - 2);
  const yMax = opts.yMax ?? Math.min(100, dataMax + 2);
  const yRange = yMax - yMin || 1;

  const lines: string[] = [];

  if (opts.title) {
    lines.push(chalk.bold(opts.title));
  }

  // Build grid
  for (let row = height; row >= 0; row--) {
    const rowValue = yMin + (row / height) * yRange;
    const yLabel = rowValue.toFixed(0).padStart(4);
    const isBaseline = row === 0;

    let rowStr = chalk.dim(yLabel + unit) + (isBaseline ? " ┼" : " ┤");

    // For each data point map to a column
    const colWidth = Math.max(1, Math.floor(width / points.length));

    for (let i = 0; i < points.length; i++) {
      const pv = points[i]?.value ?? 0;
      const norm = (pv - yMin) / yRange;
      const barTopRow = Math.round(norm * height);

      const isBar = row <= barTopRow;
      const normVal = (pv - yMin) / yRange;
      const colour = colourFn(normVal);

      if (isBaseline) {
        rowStr += colour("─".repeat(colWidth));
      } else {
        rowStr += isBar ? colour("█".repeat(colWidth)) : " ".repeat(colWidth);
      }
    }

    lines.push(rowStr);
  }

  // X-axis labels — sample evenly
  const labelCount = Math.min(points.length, Math.floor(width / 5));
  const step = Math.max(1, Math.floor(points.length / labelCount));
  const xLabels = points.filter((_, i) => i % step === 0).map((p) => p.label.slice(0, 5).padEnd(6));

  lines.push("     " + chalk.dim(xLabels.join("")));

  return lines.join("\n");
}

/**
 * renderStressGauge — renders an inline gauge bar for stress scores 0–100.
 *
 * ```
 * Stress [████████░░░░░░░░░░░░] 42  🟠 Elevated
 * ```
 */
export function renderStressGauge(stressScore: number, barWidth = 20): string {
  const filled = Math.round((stressScore / 100) * barWidth);
  const empty = barWidth - filled;

  let colour: ChalkInstance;
  let label: string;
  if (stressScore <= 20) {
    colour = chalk.green;
    label = "🟢 Optimal";
  } else if (stressScore <= 40) {
    colour = chalk.yellow;
    label = "🟡 Normal";
  } else if (stressScore <= 60) {
    colour = chalk.hex("#FFA500");
    label = "🟠 Elevated";
  } else if (stressScore <= 80) {
    colour = chalk.red;
    label = "🔴 High";
  } else {
    colour = chalk.bgRed.white;
    label = "🚨 Critical";
  }

  const bar = colour("█".repeat(filled)) + chalk.dim("░".repeat(empty));
  return `Stress [${bar}] ${chalk.bold(String(stressScore))}  ${label}`;
}
