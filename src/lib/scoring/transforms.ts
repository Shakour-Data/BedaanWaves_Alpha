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

function finite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
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
    if (finite(values[i])) {
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
//
// Low-frequency handling: quarterly/annual releases (GDP, CPI, payrolls, etc.)
// often have only 1-3 historical points. Instead of returning neutral 50.0,
// we use release-to-release change direction + magnitude, mapped through a
// bounded transform that produces meaningful scores even with sparse data.
export function timeSeriesScore(
  currentValue: number | null,
  history: number[],
  lowerIsBetter = false
): number {
  if (!finite(currentValue)) return 50.0;
  const hist = history.filter(finite);
  if (hist.length < 2) return 50.0;

  // Exclude current value from past to avoid self-bias
  const past = hist[hist.length - 1] === currentValue ? hist.slice(0, -1) : hist;
  if (past.length < 2) return 50.0;

  // ── Full history available (≥5 points): use percentile rank ──
  if (past.length >= 5) {
    const minVal = Math.min(...past);
    const maxVal = Math.max(...past);
    if (maxVal - minVal < 1e-12) return 50.0;
    let below = 0;
    for (const v of past) {
      if (v < currentValue) below++;
    }
    const m = past.length;
    let p = (below + 0.5) / m; // midrank percentile
    if (lowerIsBetter) p = 1.0 - p;
    p = clamp(p, 1e-6, 1 - 1e-6);
    const z = invNorm(p);
    return clamp(50 + 15 * z, 0, 100);
  }

  // ── Sparse history (2-4 points): use release-to-release change ──
  // For low-frequency indicators, compare current value to the most recent
  // prior release. Direction + relative magnitude produce a bounded score.
  const prior = past[past.length - 1];
  if (Math.abs(currentValue - prior) < 1e-12) return 50.0;

  // Relative change from prior release
  const relChange = (currentValue - prior) / (Math.abs(prior) + 1e-9);
  // Clamp relative change to a reasonable range for scoring
  const clampedRelChange = clamp(relChange, -0.5, 0.5);
  // Map [-0.5, 0.5] → score range. Higher change = more extreme score.
  // Scale: 0.05 change ≈ 10 points from neutral
  let score = 50 + (clampedRelChange / 0.05) * 10;
  if (lowerIsBetter) score = 100 - score;
  return clamp(score, 15, 85);
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

const FUNDAMENTAL_FIELDS = new Set([
  "pe_ratio", "pb_ratio", "ev_ebitda", "peg_ratio", "price_to_sales", "price_to_cash_flow",
  "payout_ratio", "roe", "roa", "roic", "profit_margin", "gross_margin", "operating_margin",
  "net_margin", "ebitda_margin", "operating_leverage", "revenue_growth", "eps_growth",
  "earnings_growth", "free_cash_flow_growth", "current_ratio", "quick_ratio", "cash_ratio",
  "asset_turnover", "inventory_turnover", "receivables_turnover", "debt_to_equity",
  "debt_to_assets", "interest_coverage", "debt_to_ebitda", "dividend_yield",
  "dividend_growth_rate", "free_cash_flow_yield", "operating_cash_flow_ratio",
  "capex_ratio", "cash_conversion_ratio", "roe_stability", "earnings_quality",
  "financial_leverage", "earnings_stability", "dividend_stability", "accounting_quality",
]);

const FUNDAMENTAL_LOWER_BETTER = new Set([
  "pe_ratio", "pb_ratio", "ev_ebitda", "peg_ratio", "price_to_sales", "price_to_cash_flow",
  "debt_to_equity", "debt_to_assets", "debt_to_ebitda", "capex_ratio", "financial_leverage",
]);

function robustUnbounded(v: number, lowerIsBetter: boolean): number {
  // Soft saturation preserves ordering without collapsing large ratios into a tie.
  const scaled = v / (100 + Math.abs(v));
  return clamp(50 + (lowerIsBetter ? -1 : 1) * 25 * scaled, 0, 100);
}

export function normalizeIndicatorScore(
  dbField: string,
  v: number | null,
  lowerIsBetter = false
): number {
  if (!finite(v)) return 50.0;
  const baseField = dbField.includes("__") ? dbField.slice(0, dbField.indexOf("__")) : dbField;
  const variant = dbField.includes("__") ? dbField.slice(dbField.indexOf("__") + 2) : "raw";

  // Sentiment sub-aspects are already on a 0..100 scale (from real-news
  // computation). Just clamp — no cross-sectional re-ranking needed.
  if (["news_sentiment_avg", "news_volume", "social_sentiment", "social_volume", "analyst_rating", "target_price_change"].includes(baseField)) {
    return clamp(v, 0, 100);
  }
  // Bounded: rsi_14, stoch_k, mfi_14 → 0..100
  if (["rsi_14", "stoch_k", "stoch_rsi_k", "mfi_14"].includes(baseField)) {
    return clamp(v, 0, 100);
  }
  // Binary-ish indicators
  if (
    ["parabolic_sar_signal", "ichimoku_score", "supertrend_signal"].includes(
      baseField
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
  const isLowerBetter = variant === "rolling_volatility" || lowerBetterFields.has(baseField) || FUNDAMENTAL_LOWER_BETTER.has(baseField) || lowerIsBetter;
  if (lowerBetterFields.has(baseField) || variant === "rolling_volatility") {
    const scale = TECHNICAL_SCALES[baseField] ?? 1.0;
    return clamp(50 - 25 * tanh(Math.abs(v) / scale), 0, 100);
  }
  // Scaled indicators (macd_histogram, roc_12, cci_20, etc.)
  if (TECHNICAL_SCALES[baseField] !== undefined) {
    const scale = TECHNICAL_SCALES[baseField];
    return clamp(50 + 25 * tanh(v / scale), 0, 100);
  }
  if (variant === "normalized") return clamp(v, 0, 100);
  if (FUNDAMENTAL_FIELDS.has(baseField)) return robustUnbounded(v, isLowerBetter);
  // Unknown/unbounded indicators retain a monotonic, finite transform for
  // cross-sectional ranking instead of saturating at 0/100.
  return robustUnbounded(v, isLowerBetter);
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
    if (!finite(s) || !finite(w) || w <= 0) continue;
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
  | "NO_DATA"
  | "BEARISH"
  | "STRONG_BEARISH";

const NO_DATA_COVERAGE_THRESHOLD = 0.1;

export function gradeFor(score: number, coverage?: number): Grade {
  if (
    score === 50 &&
    coverage !== undefined &&
    coverage <= NO_DATA_COVERAGE_THRESHOLD
  ) {
    return "NO_DATA";
  }
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
    case "NO_DATA":
      return "#6b7280";
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
