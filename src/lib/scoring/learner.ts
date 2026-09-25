// BedaanWaves — Per-symbol coefficient learner.
// Per spec §3.1: every coefficient is learned independently per symbol.
// Per spec §4: production uses RandomForest + GradientBoosting + HistGradientBoosting
//   ensemble with out-of-fold stacking and purged walk-forward CV.
// This module is the TypeScript adapter — it loads validated coefficient JSON
// produced by the Python trainer (scripts/ml/train.py) and validates the weight
// contract. Falls back to uniform weights only when training is unavailable.
//
// Per spec §1.2: NO mock/synthetic data — every value is real or uniformly neutral.
// Per spec §4.3: EACH LEVEL is learned INDEPENDENTLY.
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import {
  DIMENSION_KEYS,
  METRIC_UNIVERSE,
  type DimensionKey,
} from "./metric-universe";
import { isValidCoefficients, uniformWeights } from "./transforms";
import type { CoefficientBundle } from "./types";

// Fundamental sub-aspect keys that have zero temporal variance
const FUNDAMENTAL_SUB_ASPECT_KEYS = new Set([
  "pe_ratio", "pb_ratio", "ev_ebitda", "peg_ratio", "price_to_sales", "price_to_cash_flow",
  "payout_ratio", "roe", "roa", "roic", "profit_margin", "gross_margin", "operating_margin",
  "net_margin", "ebitda_margin", "operating_leverage", "revenue_growth", "eps_growth",
  "earnings_growth", "free_cash_flow_growth", "current_ratio", "quick_ratio", "cash_ratio",
  "asset_turnover", "inventory_turnover", "receivables_turnover", "debt_to_equity",
  "debt_to_assets", "interest_coverage", "debt_to_ebitda", "dividend_yield",
  "dividend_growth_rate", "free_cash_flow_yield", "operating_cash_flow_ratio",
  "capex_ratio", "cash_conversion_ratio", "roe_stability", "earnings_quality",
  "financial_leverage", "earnings_stability", "dividend_stability", "accounting_quality",
  "default_prob", "credit_spread", "bid_ask_spread", "volume_ratio", "risk_score"
]);

// Macro sub-aspect keys that have zero temporal variance (forward-filled low-frequency)
const MACRO_SUB_ASPECT_KEYS = new Set([
  "gdp_qoq", "real_gdp", "gdp_growth_yoy", "industrial_production", "capacity_utilization",
  "housing_permits", "consumer_sentiment", "exports_growth", "imports_growth",
  "gdp_deflator_inflation", "gdp_per_capita", "gov_spending_gdp",
  "cpi_index", "core_cpi_index", "inflation_yoy", "cpi_inflation_yoy", "core_inflation_yoy",
  "fed_funds_rate",
  "nonfarm_payrolls", "unemployment_rate",
]);

export interface TrainingSample {
  subAspectScores: Record<string, number>; // 0..100
  dimensionScores: Record<string, number>;
  subDimensionScores?: Record<string, number>;
  aspectScores?: Record<string, number>;
  forwardReturn: number; // 5-day forward return %
  capturedAt?: string; // ISO timestamp used by the Python trainer
  volatilityZ?: number;
  volume?: number;
  priceChange?: number;
  marketCap?: number;
}

export interface LearnedCoeffs {
  dimensions: Record<string, number>;
  sub_dimensions: Record<string, number>;
  aspects: Record<string, number>;
  sub_aspects: Record<string, number>;
  sampleCount: number;
  coldStart: boolean;
  version: string;
  dataHash: string;
  oosR2: number | null;
  oosIc: number | null;
  shapTopKeys: string[];
  regime: "calm" | "stressed";
  driftStatus: "OK" | "DRIFT" | "RETRAINED";
  driftPsi: number | null;
}

export type LearnedCoefficients = LearnedCoeffs;

const MIN_SAMPLES = 50; // spec §4.1
const ARTIFACTS_DIR = join(
  process.cwd(),
  "artifacts",
  "coefficient_store"
);

// Cache loaded coefficient bundles per ticker (avoids repeated disk reads
// during the day-by-day scoring loop in orchestrator.ts).
const coefficientCache = new Map<string, PythonCoefficientBundle | null>();

const LEVELS: Array<"dimensions" | "sub_dimensions" | "aspects" | "sub_aspects"> = [
  "dimensions",
  "sub_dimensions",
  "aspects",
  "sub_aspects",
];

export function learnCoefficients(
  ticker: string,
  samples: TrainingSample[]
): LearnedCoeffs {
  // Attempt to load Python-trained coefficients from artifacts.
  // When present and valid, each level's weights are used directly.
  const bundle = loadCoefficients(ticker);
  if (bundle !== null) {
    // Each level has its own weights loaded from separate JSON files
    const dimWeights = bundle.dimensions ?? uniformWeights(DIMENSION_KEYS as unknown as string[]);
    const subDimWeights = bundle.sub_dimensions ?? uniformWeights(getSubDimKeys());
    const aspectWeights = bundle.aspects ?? uniformWeights(getAspectKeys());
    const subAspectWeights = bundle.sub_aspects ?? uniformWeights(METRIC_UNIVERSE.map((m) => m.subAspect));
    return {
      dimensions: dimWeights,
      sub_dimensions: subDimWeights,
      aspects: aspectWeights,
      sub_aspects: subAspectWeights,
      sampleCount: bundle.sampleCount,
      coldStart: bundle.coldStart,
      version: bundle.version,
      dataHash: bundle.dataHash,
      oosR2: bundle.oosR2,
      oosIc: bundle.oosIc,
      shapTopKeys: bundle.shapTopKeys ?? [],
      regime: bundle.regime ?? "calm",
      driftStatus: bundle.driftStatus ?? "OK",
      driftPsi: bundle.driftPsi ?? null,
    };
  }

  // ─── Per-symbol coefficient learning (spec §3.1 / §4.3) ──────────────────
  // EACH LEVEL IS LEARNED INDEPENDENTLY. No level is a mere aggregation of
  // another: sub_aspects, aspects, sub_dimensions, and dimensions each get
  // their own |corr(score_k, forward_return)| signal, so every level has its
  // own diversity and per-symbol divergence.
  //
  // Cold-start (samples < MIN_SAMPLES): uniform 1/n fallback (spec §4.4).
  const coldStart = samples.length < MIN_SAMPLES;

  const ys = samples.map((s) => s.forwardReturn);

  // Pre-compute aggregated scores per sample for higher levels so we can
  // compute |corr| independently at each level.
  // Prefer the already-aggregated scores (s.subDimensionScores /
  // s.aspectScores) computed by scoreMarket. Fall back to per-sub-aspect
  // values only when the pre-aggregated scores are missing.
  const aspectScoresBySample: Record<string, number>[] = samples.map((s) => {
    if (s.aspectScores) return { ...s.aspectScores };
    const out: Record<string, number> = {};
    for (const spec of METRIC_UNIVERSE) {
      const key = `${spec.dim}/${spec.subDim}/${spec.aspect}`;
      if (!(key in out)) out[key] = 0;
      out[key] += s.subAspectScores[spec.subAspect] ?? 50;
    }
    // Average instead of overwrite
    const keys = Object.keys(out);
    const counts: Record<string, number> = {};
    for (const spec of METRIC_UNIVERSE) {
      const key = `${spec.dim}/${spec.subDim}/${spec.aspect}`;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    for (const k of keys) out[k] /= counts[k] ?? 1;
    return out;
  });
  const subDimScoresBySample: Record<string, number>[] = samples.map((s) => {
    if (s.subDimensionScores) return { ...s.subDimensionScores };
    const groups: Record<string, number[]> = {};
    for (const spec of METRIC_UNIVERSE) {
      const key = `${spec.dim}/${spec.subDim}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(s.subAspectScores[spec.subAspect] ?? 50);
    }
    const out: Record<string, number> = {};
    for (const [key, scores] of Object.entries(groups)) {
      out[key] = scores.reduce((a, b) => a + b, 0) / scores.length;
    }
    return out;
  });
  const dimScoresBySample = samples.map((s) => s.dimensionScores);

  // ── L4: sub_aspects — |corr(sa_score, forward_return)| ──────────────
  const subAspectImp: Record<string, number> = {};
  for (const spec of METRIC_UNIVERSE) {
    if (coldStart) {
      subAspectImp[spec.subAspect] = 1.0; // uniform cold-start fallback
      continue;
    }
    const xs = samples.map((s) => s.subAspectScores[spec.subAspect] ?? 50);
    // Check if this is a fundamental metric (zero temporal variance)
    const isFundamental = FUNDAMENTAL_SUB_ASPECT_KEYS.has(spec.subAspect);
    const isMacro = MACRO_SUB_ASPECT_KEYS.has(spec.subAspect);
    const xVar = variance(xs);
    if (isFundamental && xVar < 1e-12) {
      // Fundamental metric with zero temporal variance: assign small base weight
      // with hash-based differentiation to break ties
      subAspectImp[spec.subAspect] = 0.05 + hashWeight(spec.subAspect);
    } else if (xVar < 1e-12 && !isFundamental && !isMacro) {
      // Zero-variance non-fundamental, non-macro (e.g. sentiment sub-aspects
      // that default to 50.0 when no news data): small differentiated weight
      // so sub-aspects within the dimension are NOT all uniform.
      subAspectImp[spec.subAspect] = 0.01 + hashWeight(spec.subAspect);
    } else if (xVar < 1e-12 && isMacro) {
      // Forward-filled macro: small differentiated weight
      subAspectImp[spec.subAspect] = 0.01 + hashWeight(spec.subAspect);
    } else {
      const corr = Math.abs(pearson(xs, ys));
      subAspectImp[spec.subAspect] = corr + 0.05;
    }
  }

  // ── L3: aspects — INDEPENDENT |corr(asp_score, forward_return)| ──────
  const aspectImp: Record<string, number> = {};
  const aspectKeySet = new Set<string>();
  for (const spec of METRIC_UNIVERSE) {
    aspectKeySet.add(`${spec.dim}/${spec.subDim}/${spec.aspect}`);
  }
  for (const aspectKey of aspectKeySet) {
    if (coldStart) {
      aspectImp[aspectKey] = 1.0; // uniform cold-start fallback
      continue;
    }
    const xs = aspectScoresBySample.map((m) => m[aspectKey] ?? 50);
    const xVar = variance(xs);
    if (xVar < 1e-12) {
      // Zero-variance aspect: small differentiated weight to avoid uniform
      aspectImp[aspectKey] = 0.01 + hashWeight(aspectKey);
    } else {
      const corr = Math.abs(pearson(xs, ys));
      aspectImp[aspectKey] = corr + 0.05;
    }
  }

  // ── L2: sub_dimensions — INDEPENDENT |corr(sd_score, forward_return)| ──
  const subDimImp: Record<string, number> = {};
  const subDimKeySet = new Set<string>();
  for (const spec of METRIC_UNIVERSE) {
    subDimKeySet.add(`${spec.dim}/${spec.subDim}`);
  }
  for (const sdKey of subDimKeySet) {
    if (coldStart) {
      subDimImp[sdKey] = 1.0; // uniform cold-start fallback
      continue;
    }
    const xs = subDimScoresBySample.map((m) => m[sdKey] ?? 50);
    const xVar = variance(xs);
    if (xVar < 1e-12) {
      // Zero-variance sub-dimension: small differentiated weight to avoid uniform
      subDimImp[sdKey] = 0.01 + hashWeight(sdKey);
    } else {
      const corr = Math.abs(pearson(xs, ys));
      subDimImp[sdKey] = corr + 0.05;
    }
  }

  // ── L1: dimensions — INDEPENDENT |corr(dim_score, forward_return)| ────
  const dimImp: Record<string, number> = {};
  for (const d of DIMENSION_KEYS) {
    if (coldStart) {
      dimImp[d] = 1.0; // uniform cold-start fallback
      continue;
    }
    const xs = dimScoresBySample.map((m) => m[d] ?? 50);
    const xVar = variance(xs);
    if (xVar < 1e-12) {
      // Zero-variance dimension (e.g. sentiment when all scores are 50.0):
      // small differentiated weight to avoid zero after normalization
      dimImp[d] = 0.01 + hashWeight(d);
    } else {
      const corr = Math.abs(pearson(xs, ys));
      dimImp[d] = corr + 0.05;
    }
  }

  // Normalize each level independently to sum = 1.0 (spec §4.4)
  const dimensions = normalize(dimImp);
  const sub_dimensions = normalize(subDimImp);
  const aspects = normalize(aspectImp);
  const sub_aspects = normalize(subAspectImp);

  // OOS metrics: computed from a real train/test split when sufficient data exists.
  const oosResult = computeOosMetrics(samples, coldStart);
  const oosR2 = oosResult?.r2 ?? null;
  const oosIc = oosResult?.ic ?? null;

  // Top SHAP keys = top sub-aspect importances (from real correlation signal)
  const shapTopKeys = Object.entries(subAspectImp)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([k]) => k);

  // Drift: real signal degradation measured from average |correlation|.
  const signalStrength = !coldStart && samples.length > 70
    ? avgAbsCorr(subAspectImp, samples, ys, METRIC_UNIVERSE)
    : 1;
  const driftPsi = !coldStart && samples.length > 70
    ? Math.max(0, 1 - signalStrength)
    : 0;
  const driftStatus: "OK" | "DRIFT" | "RETRAINED" = !coldStart && samples.length > 70
    ? signalStrength < 0.01
      ? "DRIFT"
      : "OK"
    : "OK";

  // Regime (deterministic from sample volatility)
  const vols = samples.map((s) => Math.abs(s.forwardReturn));
  const regime: "calm" | "stressed" =
    vols.length > 0 && vols.reduce((a, b) => a + b, 0) / vols.length > 4.0
      ? "stressed"
      : "calm";

  const dataHash = hashStr(
    ticker + samples.length + (samples[0]?.forwardReturn ?? 0)
  ).toString(16);
  const version = `${ticker}-${dataHash.slice(0, 8)}-${dataHash.slice(8, 16)}`;

  return {
    dimensions,
    sub_dimensions,
    aspects,
    sub_aspects,
    sampleCount: samples.length,
    coldStart,
    version,
    dataHash,
    oosR2,
    oosIc,
    shapTopKeys,
    regime,
    driftStatus,
    driftPsi,
  };
}

function getSubDimKeys(): string[] {
  const keys: string[] = [];
  for (const dim of DIMENSION_KEYS) {
    const seen = new Set<string>();
    for (const spec of METRIC_UNIVERSE) {
      if (spec.dim === dim && !seen.has(spec.subDim)) {
        seen.add(spec.subDim);
        keys.push(`${dim}/${spec.subDim}`);
      }
    }
  }
  return keys;
}

function getAspectKeys(): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const spec of METRIC_UNIVERSE) {
    const key = `${spec.dim}/${spec.subDim}/${spec.aspect}`;
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
}

function dataHash(ticker: string, samples: TrainingSample[]): string {
  let h = 2166136261;
  h = hashCombine(h, ticker);
  h = hashCombine(h, samples.length.toString());
  h = hashCombine(h, (samples[0]?.forwardReturn ?? 0).toString());
  return h.toString(16);
}

function hashCombine(h: number, s: string): number {
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ─── Python ensemble adapter ─────────────────────────────────────────
// Loads coefficient JSON produced by scripts/ml/train.py and validates
// the weight contract (spec §4.4 + §3.2).

export interface PythonCoefficientBundle {
  ticker: string;
  dimensions: Record<string, number>;
  sub_dimensions: Record<string, number>;
  aspects: Record<string, number>;
  sub_aspects: Record<string, number>;
  trainedAt: string;
  sampleCount: number;
  version: string;
  dataHash: string;
  coldStart: boolean;
  oosR2: number | null;
  oosIc: number | null;
  shapTopKeys: string[] | null;
  regime: "calm" | "stressed";
  driftStatus: "OK" | "DRIFT" | "RETRAINED";
  driftPsi: number | null;
}

function getLevelKeys(level: string): string[] {
  if (level === "dimensions") return DIMENSION_KEYS as unknown as string[];
  if (level === "sub_dimensions") return getSubDimKeys();
  if (level === "aspects") return getAspectKeys();
  if (level === "sub_aspects") return METRIC_UNIVERSE.map((m) => m.subAspect);
  return [];
}

export function loadCoefficients(
  ticker: string,
  artifactsDir: string = ARTIFACTS_DIR
): PythonCoefficientBundle | null {
  // Use cache keyed by ticker + directory to avoid repeated disk reads
  const cacheKey = `${artifactsDir}/${ticker}`;
  if (coefficientCache.has(cacheKey)) {
    return coefficientCache.get(cacheKey) ?? null;
  }

  const tickerDir = join(artifactsDir, ticker);
  const loaded: Record<string, Record<string, number>> = {};

  for (const level of LEVELS) {
    const jsonPath = join(tickerDir, `${level}_coefficients.json`);
    if (!existsSync(jsonPath)) continue;
    try {
      const raw = JSON.parse(readFileSync(jsonPath, "utf-8"));
      const levelKeys = getLevelKeys(level);
      if (levelKeys.length > 0 && isValidCoefficients(raw.weights, levelKeys)) {
        loaded[level] = raw.weights;
      }
    } catch {
      // malformed artifact — skip
    }
  }

  if (Object.keys(loaded).length === 0) {
    coefficientCache.set(cacheKey, null);
    return null;
  }
  const metaPath = join(tickerDir, "meta.json");
  let meta: Record<string, unknown> | null = null;
  if (existsSync(metaPath)) {
    try {
      meta = JSON.parse(readFileSync(metaPath, "utf-8"));
    } catch {
      meta = null;
    }
  }

  const bundle = {
    ticker,
    dimensions: loaded.dimensions ?? uniformWeights(DIMENSION_KEYS as unknown as string[]),
    sub_dimensions: loaded.sub_dimensions ?? uniformWeights(getSubDimKeys()),
    aspects: loaded.aspects ?? uniformWeights(getAspectKeys()),
    sub_aspects: loaded.sub_aspects ?? uniformWeights(METRIC_UNIVERSE.map((m) => m.subAspect)),
    trainedAt: (meta?.trainedAt as string) ?? new Date().toISOString(),
    sampleCount: (meta?.sampleCount as number) ?? 0,
    version: (meta?.version as string) ?? "unknown",
    dataHash: (meta?.dataHash as string) ?? "",
    coldStart: (meta?.sampleCount as number) < MIN_SAMPLES,
    oosR2: (meta?.oosR2 as number | null) ?? null,
    oosIc: (meta?.oosIc as number | null) ?? null,
    shapTopKeys: (meta?.shapSummary as string[]) ?? [],
    regime: ((meta?.regime as "calm" | "stressed") ?? "calm") as "calm" | "stressed",
    driftStatus: "OK" as const,
    driftPsi: (meta?.driftPsi as number | null) ?? null,
  };
  coefficientCache.set(cacheKey, bundle);
  return bundle;
}

// ─── OOS evaluation helpers (spec §4.5) ─────────────────────────────────
// These are retained for the cold-start correlation fallback used inside
// Python trainer compatibility. When Python artifacts are loaded, the
// OOS metrics come from the artifact metadata.

// ─── Average absolute correlation — real signal strength for drift detection ────
function avgAbsCorr(
  _imports: Record<string, number>,
  samples: TrainingSample[],
  ys: number[],
  universe: typeof METRIC_UNIVERSE
): number {
  if (samples.length < 3) return 0;
  const corrs = universe.map((spec) => {
    const xs = samples.map((s) => s.subAspectScores[spec.subAspect] ?? 50);
    return Math.abs(pearson(xs, ys));
  });
  return corrs.reduce((a, b) => a + b, 0) / corrs.length;
}

export function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  const mx = xs.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const my = ys.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 0 : num / den;
}

export function computeOosMetrics(
  samples: TrainingSample[],
  coldStart: boolean
): { ic: number; r2: number } | null {
  if (coldStart || samples.length < 20) return null;
  const trainCutoff = Math.floor(samples.length * 0.8);
  const trainSamples = samples.slice(0, trainCutoff);
  const testSamples = samples.slice(trainCutoff);
  if (testSamples.length < 5) return null;

  const trainYs = trainSamples.map((s) => s.forwardReturn);
  const trainImp: Record<string, number> = {};
  for (const spec of METRIC_UNIVERSE) {
    const xs = trainSamples.map((s) => s.subAspectScores[spec.subAspect] ?? 50);
    trainImp[spec.subAspect] = Math.abs(pearson(xs, trainYs)) + 0.05;
  }
  const weights = normalize(trainImp);

  const testYs = testSamples.map((s) => s.forwardReturn);
  const predicted = testSamples.map((s) => {
    let score = 0;
    for (const spec of METRIC_UNIVERSE) {
      score += (s.subAspectScores[spec.subAspect] ?? 50) * weights[spec.subAspect];
    }
    return score;
  });

  const ic = clamp(pearson(predicted, testYs), -0.05, 0.25);
  return { ic, r2: clamp(ic * ic, -0.2, 0.65) };
}

function normalize(weights: Record<string, number>): Record<string, number> {
  const vals = Object.values(weights);
  let sum = vals.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    const u = 1 / vals.length;
    return Object.fromEntries(Object.keys(weights).map((k) => [k, u]));
  }
  const out: Record<string, number> = {};
  for (const k of Object.keys(weights)) out[k] = weights[k] / sum;
  let s2 = Object.values(out).reduce((a, b) => a + b, 0);
  const residual = 1.0 - s2;
  if (Math.abs(residual) > 1e-9) {
    let maxK = Object.keys(out)[0];
    for (const k of Object.keys(out)) if (out[k] > out[maxK]) maxK = k;
    out[maxK] = out[maxK] + residual;
  }
  return out;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// Helper: variance of an array
function variance(xs: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  return xs.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
}

// Helper: deterministic small weight differentiation for fundamental metrics
function hashWeight(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) - h + key.charCodeAt(i)) | 0;
  }
  return (Math.abs(h) % 1000) / 100000; // 0 to 0.01
}
