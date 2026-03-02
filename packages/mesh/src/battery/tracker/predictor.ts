// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaMesh Battery Intelligence™ — lokaflow.io

import { HealthRecord } from "../store/cluster-battery-store.js";

export interface DegradationTrend {
  /** Percentage points of health lost per 100 charge cycles */
  pctPer100Cycles: number;
  /** Percentage points of health lost per day (under current usage) */
  pctPerDay: number;
  /** R² goodness-of-fit of the linear regression (0–1) */
  rSquared: number;
  /** Number of data points used */
  sampleSize: number;
}

export interface LifespanPrediction {
  nodeId: string;
  currentHealthPct: number;
  currentCycleCount: number;
  /**
   * Estimated date at which health drops below `targetHealthPct`.
   * null if there is insufficient data to extrapolate.
   */
  estimatedReplacementDate: string | null;
  /** How many days from today until estimated replacement */
  daysRemaining: number | null;
  /** The health floor used for this prediction (default 80%) */
  targetHealthPct: number;
  degradationRate: DegradationTrend;
  /**
   * Human-readable recommendation tier:
   * "healthy" | "monitor" | "plan-replacement" | "replace-soon" | "replace-now"
   */
  recommendation: "healthy" | "monitor" | "plan-replacement" | "replace-soon" | "replace-now";
  generatedAt: string;
}

/** Linear regression: returns slope (y per x) and intercept, plus R² */
function linearRegression(xs: number[], ys: number[]): { slope: number; intercept: number; rSquared: number } {
  const n = xs.length;
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 100, rSquared: 0 };

  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((acc, x, i) => acc + x * (ys[i] ?? 0), 0);
  const sumX2 = xs.reduce((acc, x) => acc + x * x, 0);

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n, rSquared: 0 };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // R²
  const yMean = sumY / n;
  const ssTot = ys.reduce((acc, y) => acc + (y - yMean) ** 2, 0);
  const ssRes = xs.reduce((acc, x, i) => {
    const predicted = slope * x + intercept;
    return acc + ((ys[i] ?? 0) - predicted) ** 2;
  }, 0);
  const rSquared = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);

  return { slope, intercept, rSquared };
}

/**
 * LifespanPredictor — projects battery replacement date from `HealthRecord` history.
 *
 * Uses two independent linear regressions:
 * 1. health% vs cycle count (cycle-based wear)
 * 2. health% vs days elapsed (calendar-based wear)
 *
 * The predictions are blended by their respective R² values.
 */
export class LifespanPredictor {
  constructor(
    private readonly targetHealthPct: number = 80,
  ) {}

  /**
   * Predict lifespan given a series of health records for a single node,
   * sorted ascending by date.
   */
  predict(records: HealthRecord[]): LifespanPrediction {
    const nodeId = records[0]?.nodeId ?? "unknown";
    const latest = records[records.length - 1];
    const currentHealthPct = latest?.healthPct ?? 95;
    const currentCycleCount = latest?.cycleCount ?? 0;
    const generatedAt = new Date().toISOString();

    if (records.length < 3) {
      return this.insufficientData(nodeId, currentHealthPct, currentCycleCount, generatedAt);
    }

    const t0 = new Date(records[0]!.date).getTime();

    // Build regression arrays
    const daysArr = records.map((r) => (new Date(r.date).getTime() - t0) / 86_400_000);
    const cyclesArr = records.map((r) => r.cycleCount);
    const healthArr = records.map((r) => r.healthPct);

    const regrByDay = linearRegression(daysArr, healthArr);
    const regrByCycle = linearRegression(cyclesArr, healthArr);

    // Days-based prediction
    let daysPrediction: number | null = null;
    if (regrByDay.slope < 0) {
      const daysToTarget = (this.targetHealthPct - regrByDay.intercept) / regrByDay.slope;
      const currentDays = daysArr[daysArr.length - 1] ?? 0;
      daysPrediction = daysToTarget - currentDays;
    }

    // Cycle-based prediction → convert to days
    let cyclePrediction: number | null = null;
    if (regrByCycle.slope < 0) {
      const cyclesToTarget = (this.targetHealthPct - regrByCycle.intercept) / regrByCycle.slope;
      const currentCycles = cyclesArr[cyclesArr.length - 1] ?? 0;
      const remainingCycles = cyclesToTarget - currentCycles;
      // Compute avg daily cycles from the window
      const totalCycles = (cyclesArr[cyclesArr.length - 1] ?? 0) - (cyclesArr[0] ?? 0);
      const totalDays = (daysArr[daysArr.length - 1] ?? 1);
      const avgDailyCycles = totalDays > 0 ? totalCycles / totalDays : 0.5;
      cyclePrediction = avgDailyCycles > 0 ? remainingCycles / avgDailyCycles : null;
    }

    // Blend by R²
    let daysRemaining: number | null = null;
    const totalR2 = regrByDay.rSquared + regrByCycle.rSquared;

    if (daysPrediction !== null && cyclePrediction !== null && totalR2 > 0) {
      daysRemaining = Math.round(
        (daysPrediction * regrByDay.rSquared + cyclePrediction * regrByCycle.rSquared) / totalR2,
      );
    } else if (daysPrediction !== null) {
      daysRemaining = Math.round(daysPrediction);
    } else if (cyclePrediction !== null) {
      daysRemaining = Math.round(cyclePrediction);
    }

    // Health% per day and per 100 cycles
    const pctPerDay = regrByDay.slope < 0 ? Math.abs(regrByDay.slope) : 0;
    const pctPer100Cycles = regrByCycle.slope < 0 ? Math.abs(regrByCycle.slope * 100) : 0;

    const degradationRate: DegradationTrend = {
      pctPer100Cycles: parseFloat(pctPer100Cycles.toFixed(3)),
      pctPerDay: parseFloat(pctPerDay.toFixed(5)),
      rSquared: parseFloat(((regrByDay.rSquared + regrByCycle.rSquared) / 2).toFixed(3)),
      sampleSize: records.length,
    };

    const estimatedReplacementDate =
      daysRemaining !== null && daysRemaining > 0
        ? new Date(Date.now() + daysRemaining * 86_400_000).toISOString().slice(0, 10)
        : null;

    return {
      nodeId,
      currentHealthPct: parseFloat(currentHealthPct.toFixed(1)),
      currentCycleCount,
      estimatedReplacementDate,
      daysRemaining,
      targetHealthPct: this.targetHealthPct,
      degradationRate,
      recommendation: this.classifyRecommendation(currentHealthPct, daysRemaining),
      generatedAt,
    };
  }

  private insufficientData(
    nodeId: string,
    currentHealthPct: number,
    currentCycleCount: number,
    generatedAt: string,
  ): LifespanPrediction {
    return {
      nodeId,
      currentHealthPct,
      currentCycleCount,
      estimatedReplacementDate: null,
      daysRemaining: null,
      targetHealthPct: this.targetHealthPct,
      degradationRate: { pctPer100Cycles: 0, pctPerDay: 0, rSquared: 0, sampleSize: 0 } as DegradationTrend,
      recommendation: currentHealthPct >= 90 ? "healthy" : "monitor",
      generatedAt,
    };
  }

  private classifyRecommendation(
    healthPct: number,
    daysRemaining: number | null,
  ): LifespanPrediction["recommendation"] {
    if (healthPct < 70) return "replace-now";
    if (healthPct < 80) return "replace-soon";
    if (daysRemaining !== null && daysRemaining < 180) return "plan-replacement";
    if (healthPct < 90) return "monitor";
    return "healthy";
  }
}
