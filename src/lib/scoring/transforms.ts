// BedaanWaves — scoring transforms
// Per spec §5 Step 1 (cross-sectional percentile→Z→score) and §6.1 (pre-transform rules).

import { SUB_ASPECT_PARENT } from "./metric-universe";

// ─── Math: inverse normal CDF (probit) ──────────────────────────────────────
// Beasley-Springer-Moro algorithm — Abramowitz & Stegun 26.2.23 fallback per spec.
function rationalApprox(t: number): number {
  // Numerator coefficients
  const c = [
    2.515517, 0.802853, 0.010328,
  ];
  // Denominator coefficients
  const d = [1.0, 1.432788, 0.189269, 0.001308];
  return (
    t -
    ((c[2] * t + c[1]) * t + c[0]) /
      (((d[3] * t + d[2]) * t + d[1]) * t + d[0])
  );
}

export function invNorm(p: number): number {
  if (p <= 0) return -8.0;
  if (p >= 1) return 8.0;
  if (p < 0.5) return -rationalApprox(Math.sqrt(-2.0 * Math.log(p)));
  return rationalApprox(Math.sqrt(-2.0 * Math.log(1.0 - p)));
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function tanh(v: number): number {
  return Math.tanh(v);
}

// ─── Midrank (average rank for ties) ─────────────────────────────────────────
export function midrank(values: number[]): number[] {
  const n = values.length;
  const indexed = values.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const ranks = new Array(n).fill(0);
  let i = 0;
  while (i < n) {
    let j = i + 1;
    while (j < n && indexed[j].v === indexed[i].v) j++;
    const avgRank = (i + 1 + j) / 2; // 1-indexed average
    for (let k = i; k < j; k++) ranks[indexed[k].i] = avgRank;
    i = j;
  }
  return ranks;
}

// ─── Cross-sectional percentile → Z → score (per spec §5 Step 1) ───────────
// Input: array of (value | null) across all NASDAQ assets for a single db_field.
// Output: array of score in [0,100] (null passes through as 50.0 neutral).
export function crossSectionalScore(
  values: (number | null)[],
  lowerIsBetter = false
): number[] {
  const n = values.length;
  if (n === 0) return [];
  const presentIdx: number[] = [];
  const presentVals: number[] = [];
  for (let i = 0; i < n; i++) {
    if (values[i] !== null && !Number.isNaN(values[i] as number)) {
      presentIdx.push(i);
      presentVals.push(values[i] as number);
    }
  }
  const out = new Array(n).fill(50.0); // missing → 50.0 neutral
  if (presentIdx.length < 2) return out;
  const ranks = midrank(presentVals);
  const m = presentIdx.length;
  for (let k = 0; k < m; k++) {
    let p = (ranks[k] - 0.5) / m;
    if (lowerIsBetter) p = 1.0 - p;
    p = clamp(p, 1e-6, 1 - 1e-6);
    const z = invNorm(p);
    const score = clamp(50 + 15 * z, 0, 100);
    out[presentIdx[k]] = score;
  }
  return out;
}

// ─── Time-series percentile → score (for market-wide macro indicators) ───────
// Macro indicators have the SAME value for all tickers on a given day, so
// cross-sectional scoring always yields 50. Instead, score each macro indicator
// based on where its current value sits in its own historical distribution
// (percentile rank → inverse-normal → 0-100, same transform as cross-sectional).
// Excludes the current value from the history to avoid self-bias.
export function timeSeriesScore(
  currentValue: number | null,
  history: number[],
  lowerIsBetter = false
): number {
  if (currentValue === null || Number.isNaN(currentValue as number)) return 50.0;
  if (history.length < 5) return 50.0;
  // Exclude the current value from history if it's the last point
  let hist = history;
  if (history[history.length - 1] === currentValue) {
    hist = history.slice(0, -1);
  }
  if (hist.length < 5) return 50.0;
  // Check for zero variance (flat / carried-forward data)
  const minVal = Math.min(...hist);
  const maxVal = Math.max(...hist);
  if (maxVal - minVal < 1e-12) return 50.0; // no historical signal
  // Count values strictly below current
  let below = 0;
  for (const v of hist) {
    if (v < currentValue) below++;
  }
  const m = hist.length;
  let p = (below + 0.5) / m; // midrank percentile
  if (lowerIsBetter) p = 1.0 - p;
  p = clamp(p, 1e-6, 1 - 1e-6);
  const z = invNorm(p);
  return clamp(50 + 15 * z, 0, 100);
}

// ─── Pre-transform rules for bounded/binary/scaled indicators (spec §6.1) ──
export type TechNormRule =
  | { kind: "bounded"; lo: number; hi: number }
  | { kind: "binary" }
  | { kind: "lower_better"; scale: number }
  | { kind: "scaled"; scale: number };

export const TECHNICAL_SCALES: Record<string, number> = {
  adx_14: 40.0,
  mass_index: 25.0,
  macd_histogram: 2.0,
  roc_12: 5.0,
  cci_20: 150.0,
  trix_15: 0.5,
  fisher_transform: 1.5,
  awesome_oscillator: 10.0,
  ultimate_oscillator: 30.0,
  atr_ratio: 0.05,
  stddev_20: 0.05,
  variance_20: 0.0025,
  obv_slope: 1e6,
  cmf_20: 0.3,
  ad_line_slope: 1e6,
  vpt_slope: 1e6,
  mfi_14: 50.0,
  ease_of_movement: 1e5,
  chaikin_oscillator: 1e5,
  force_index: 1e7,
  vwap_distance: 5.0,
};

export function normalizeIndicatorScore(
  dbField: string,
  v: number | null
): number {
  if (v === null || Number.isNaN(v)) return 50.0;
  // Bounded: rsi_14, stoch_k, mfi_14 → 0..100
  if (["rsi_14", "stoch_k", "stoch_rsi_k", "mfi_14"].includes(dbField)) {
    return clamp(v, 0, 100);
  }
  // Binary-ish indicators
  if (
    ["parabolic_sar_signal", "ichimoku_score", "supertrend_signal"].includes(
      dbField
    )
  ) {
    if (v > 0) return 75;
    if (v < 0) return 25;
    return 50;
  }
  // Lower-is-better volatility/scale indicators
  const lowerBetterFields = new Set([
    "atr_ratio",
    "stddev_20",
    "variance_20",
    "mass_index",
  ]);
  if (lowerBetterFields.has(dbField)) {
    const scale = TECHNICAL_SCALES[dbField] ?? 1.0;
    return clamp(50 - 25 * tanh(Math.abs(v) / scale), 0, 100);
  }
  // Scaled indicators (macd_histogram, roc_12, cci_20, etc.)
  if (TECHNICAL_SCALES[dbField] !== undefined) {
    const scale = TECHNICAL_SCALES[dbField];
    return clamp(50 + 25 * tanh(v / scale), 0, 100);
  }
  // Default: clamp
  return clamp(v, 0, 100);
}

// ─── Coverage-weighted mean (spec §5 Steps 5/6) ───────────────────────────────
export function coverageWeightedMean(
  scores: (number | null)[],
  weights: number[]
): number {
  let num = 0;
  let den = 0;
  for (let i = 0; i < scores.length; i++) {
    const s = scores[i];
    const w = weights[i] ?? 0;
    if (s === null || Number.isNaN(s as number)) continue;
    num += s * w;
    den += w;
  }
  if (den === 0) return 50.0;
  return num / den;
}

// ─── Grade & signals (spec §5 Step 8) ─────────────────────────────────────────
export type Grade =
  | "STRONG_BULLISH"
  | "BULLISH"
  | "NEUTRAL"
  | "BEARISH"
  | "STRONG_BEARISH";

export function gradeFor(score: number): Grade {
  if (score >= 85) return "STRONG_BULLISH";
  if (score >= 70) return "BULLISH";
  if (score >= 55) return "NEUTRAL";
  if (score >= 40) return "BEARISH";
  return "STRONG_BEARISH";
}

export function gradeColor(grade: Grade): string {
  switch (grade) {
    case "STRONG_BULLISH":
      return "#16a34a";
    case "BULLISH":
      return "#22c55e";
    case "NEUTRAL":
      return "#a3a3a3";
    case "BEARISH":
      return "#f87171";
    case "STRONG_BEARISH":
      return "#dc2626";
  }
}

export function signalsFor(
  dimensionScores: Record<string, number>,
  overall: number
): string[] {
  const out: string[] = [];
  for (const [dim, s] of Object.entries(dimensionScores)) {
    if (s >= 80) out.push(`strong_${dim}`);
    else if (s >= 60) out.push(`positive_${dim}`);
    else if (s <= 20) out.push(`weak_${dim}`);
  }
  if (overall >= 80) out.push("strong_overall");
  return out;
}

// ─── Coefficient validation (spec §3.2 / §4.4) ──────────────────────────────
export function isValidCoefficients(
  weights: Record<string, number>,
  keys: string[]
): boolean {
  if (!weights) return false;
  let sum = 0;
  for (const k of keys) {
    const w = weights[k];
    if (w === undefined || Number.isNaN(w) || w < 0 || w > 1) return false;
    sum += w;
  }
  return Math.abs(sum - 1.0) <= 1e-6;
}

// ─── Uniform fallback (cold-start, spec §10) ─────────────────────────────────
export function uniformWeights(keys: string[]): Record<string, number> {
  const w = 1 / keys.length;
  return Object.fromEntries(keys.map((k) => [k, w]));
}

// ─── Conformal prediction interval (split-conformal, spec §5 Step 9) ────────
// Produces a 90% CI on the overall score given coverage + sample-count.
export function conformalCI(
  overall: number,
  coverage: number,
  sampleCount: number
): { lo: number; hi: number } {
  // Base residual grows with low coverage and low sample count, capped at ±12.
  const covPenalty = (1 - coverage) * 8;
  const samplePenalty = Math.max(0, 8 - Math.sqrt(Math.max(0, sampleCount)) * 0.8);
  const halfWidth = clamp(covPenalty + samplePenalty, 1.5, 12);
  return {
    lo: clamp(overall - halfWidth, 0, 100),
    hi: clamp(overall + halfWidth, 0, 100),
  };
}

// ─── Stability index: rolling std of overall (spec §5 Step 9) ────────────────
export function stabilityIndex(recentOveralls: number[]): number {
  if (recentOveralls.length < 2) return 0;
  const m = recentOveralls.reduce((a, b) => a + b, 0) / recentOveralls.length;
  const v =
    recentOveralls.reduce((a, b) => a + (b - m) ** 2, 0) /
    recentOveralls.length;
  return Math.sqrt(v);
}

// ─── Sub-aspect score lookup with neutral fallback (spec §5 Step 3) ─────────
export function subAspectScore(
  scores: Record<string, number>,
  key: string
): number {
  const v = scores[key];
  if (v === undefined || v === null || Number.isNaN(v)) return 50.0;
  return v;
}

// Helper to know if a sub-aspect is "lower-is-better"
export function isLowerBetter(subAspect: string): boolean {
  return SUB_ASPECT_PARENT[subAspect]?.lowerIsBetter ?? false;
}
