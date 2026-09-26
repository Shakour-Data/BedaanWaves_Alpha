// BedaanWaves — V2 Scoring Engine
// Per spec §5. Implements the per-symbol dynamic weight resolution + hierarchical
// aggregation L4 → L3 → L2 → L1 → overall, plus grade / signals / CI / stability.

import {
  DIMENSION_KEYS,
  METRIC_UNIVERSE,
  SUB_ASPECTS,
  SUB_DIMENSIONS,
  SUB_ASPECT_PARENT,
  SUB_ASPECTS_BY_SUB_DIM,
  INDICATOR_VARIANT_REGISTRY,
  FEATURE_NAMES_BY_SUB_ASPECT,
  type DimensionKey,
} from "./metric-universe";
import {
  clamp,
  conformalCI,
  coverageWeightedMean,
  crossSectionalScore,
  gradeFor,
  normalizeIndicatorScore,
  signalsFor,
  stabilityIndex,
  subAspectScore,
  timeSeriesScore,
  uniformWeights,
  isValidCoefficients,
} from "./transforms";
import type { CoefficientBundle, HierarchicalScore } from "./types";
import { computeDataQuality } from "./queries";

// Asset metrics: ticker → dbField → value|null
export type AssetMetrics = Record<string, Record<string, number | null>>;

export interface CoefficientLookup {
  dimensions: Record<string, number>;
  sub_dimensions: Record<string, number>; // key: "dim/subDim"
  aspects: Record<string, number>; // key: "dim/subDim/aspect"
  sub_aspects: Record<string, number>; // key: subAspect
  version?: string;
}

// ─── Per-symbol dynamic weight resolution (spec §5.1) ──────────────────────
export function getDynamicWeights(
  ticker: string,
  level: "dimensions" | "sub_dimensions" | "aspects" | "sub_aspects",
  bundle: CoefficientBundle | null
): { weights: Record<string, number>; coldStart: boolean } {
  const keysForLevel = (() => {
    if (level === "dimensions") return DIMENSION_KEYS as unknown as string[];
    if (level === "sub_dimensions") {
      const keys: string[] = [];
      for (const dim of DIMENSION_KEYS)
        for (const sd of SUB_DIMENSIONS[dim]) keys.push(`${dim}/${sd}`);
      return keys;
    }
    if (level === "aspects") {
      const keys: string[] = [];
      for (const dim of DIMENSION_KEYS)
        for (const sd of SUB_DIMENSIONS[dim])
          for (const a of new Set(
            METRIC_UNIVERSE.filter(
              (m) => m.dim === dim && m.subDim === sd
            ).map((m) => m.aspect)
          ))
            keys.push(`${dim}/${sd}/${a}`);
      return keys;
    }
    // sub_aspects
    return METRIC_UNIVERSE.map((m) => m.subAspect);
  })();

  // Extract weights from the bundle. With proper CoefficientBundle construction
  // (scoreMarket passes { weights, level, coldStart }), bundle.weights is used.
  // Strip non-numeric metadata keys (e.g. `level`) before validation —
  // isValidCoefficients rejects any entry whose value is not a finite number.
  const raw = (bundle as any)?.weights ?? (bundle as any);
  const weights: Record<string, number> = {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === "number" && isFinite(v)) weights[k] = v;
    }
  }

  if (
    bundle &&
    !bundle.coldStart &&
    bundle.level === level &&
    Object.keys(weights).length > 0 &&
    isValidCoefficients(weights, keysForLevel)
  ) {
    return { weights, coldStart: false };
  }
  return { weights: uniformWeights(keysForLevel), coldStart: true };
}

// ─── score_market — spec §5.2 ───────────────────────────────────────────────
export interface ScoreMarketInput {
  assetMetrics: AssetMetrics;
  coefficients: Record<string, CoefficientLookup | null>; // ticker → bundle per level (flattened)
  recentOveralls?: Record<string, number[]>; // ticker → last N overall scores (for stability)
  capturedAt: string;
  prices?: Record<string, { price: number; priceChange: number; volume: number }>;
  macroHistory?: Record<string, number[]>; // dbField → full historical values up to capturedAt
  macroSensitivities?: Record<string, Record<string, number>>; // ticker → { dbField: beta }
}

export function scoreMarket(input: ScoreMarketInput): HierarchicalScore[] {
  const { assetMetrics, coefficients, capturedAt, recentOveralls, prices } =
    input;
  const tickers = Object.keys(assetMetrics);

  // Step 1 — score every registered indicator variant, then combine the
  // available variants into the canonical L4 sub-aspect score. This keeps the
  // hierarchy stable while letting raw, peer-normalized, rolling, volatility,
  // and lag features contribute to the score.
  const SENTIMENT_DIM = "sentiment";
  const AI_DIM = "ai";
  const variantScoreMap: Record<string, Record<string, number | null>> = {};
  const presentMetrics = new Map<string, Set<string>>();
  for (const ticker of tickers) {
    variantScoreMap[ticker] = {};
    presentMetrics.set(ticker, new Set());
  }

  const rawColumns = new Map<string, (number | null)[]>();
  for (const spec of METRIC_UNIVERSE) {
    rawColumns.set(
      spec.subAspect,
      tickers.map((ticker) => {
        const raw = assetMetrics[ticker]?.[spec.dbField] ?? null;
        return raw !== null && Number.isFinite(raw) ? raw : null;
      })
    );
  }

  for (const variantSpec of INDICATOR_VARIANT_REGISTRY) {
    const base = variantSpec.subAspect;
    const parent = SUB_ASPECT_PARENT[base];
    const variant = variantSpec.variant;
    const lower = variant === "rolling_volatility" || variantSpec.lowerIsBetter;
    const directNormalized = variant === "normalized"
      ? tickers.map((ticker) => {
          const value = assetMetrics[ticker]?.[variantSpec.featureName] ?? null;
          return value !== null && Number.isFinite(value) ? value : null;
        })
      : null;
    const column: (number | null)[] = tickers.map((ticker, i) => {
      const metrics = assetMetrics[ticker] ?? {};
      let value: number | null = null;
      if (variant === "raw") {
        value = metrics[base] ?? null;
      } else {
        value = metrics[variantSpec.featureName] ?? null;
      }
      if (value !== null && !Number.isFinite(value)) value = null;
      if (value === null && variant === "normalized") {
        value = (rawColumns.get(base) ?? [])[i] ?? null;
      }
      return value;
    });

    let scores: number[];
    if (variant === "normalized" && directNormalized !== null && (parent.dim === SENTIMENT_DIM || parent.dim === AI_DIM)) {
      scores = column.map((value) => value === null ? 50 : clamp(value, 0, 100));
    } else if (variant === "normalized" && directNormalized !== null) {
      const fallbackColumn = column.map((value, i) => directNormalized[i] === null ? value : null);
      const fallbackScores = crossSectionalScore(
        fallbackColumn.map((value) => value === null ? null : normalizeIndicatorScore(variantSpec.featureName, value, lower)),
        lower
      );
      scores = column.map((_, i) => directNormalized[i] !== null
        ? clamp(directNormalized[i] as number, 0, 100)
        : fallbackScores[i]);
    } else if (parent.dim === "macro") {
      const hist = input.macroHistory?.[base] ?? [];
      scores = column.map((value, i) => {
        const baseScore = timeSeriesScore(value, hist, lower);
        const beta = clamp(input.macroSensitivities?.[tickers[i]]?.[base] ?? 0, -1, 1);
        // Primary: beta-scaled deviation from neutral
        const betaComponent = (baseScore - 50) * (1 + beta * 0.6);
        // Secondary: even when baseScore is neutral (sparse history), use the
        // macro indicator's absolute level relative to its history midpoint
        // combined with the ticker's beta to produce differentiation.
        // This ensures macro scores are NOT flat 50 for all tickers.
        let levelComponent = 0;
        if (Math.abs(baseScore - 50) < 0.5 && hist.length >= 2) {
          const midPoint = (Math.min(...hist) + Math.max(...hist)) / 2;
          const range = Math.max(...hist) - Math.min(...hist);
          if (range > 1e-12 && value !== null) {
            // Where does the current value sit relative to midpoint? [-1, 1]
            const levelPos = clamp((value - midPoint) / (range / 2), -1, 1);
            // Beta tells us how the ticker responds to this indicator.
            // If beta > 0, ticker moves WITH the indicator → amplify level effect.
            // If beta < 0, ticker moves AGAINST → reverse level effect.
            // Scale: ±20 points max for extreme level + strong beta.
            levelComponent = levelPos * beta * 20;
          }
        }
        return clamp(50 + betaComponent + levelComponent, 0, 100);
      });
    } else if (parent.dim === SENTIMENT_DIM || parent.dim === AI_DIM) {
      scores = column.map((value) => value === null ? 50 : clamp(value, 0, 100));
    } else {
      const normalizedColumn = column.map((value) =>
        value === null ? null : normalizeIndicatorScore(`${base}__${variant}`, value, lower)
      );
      scores = crossSectionalScore(normalizedColumn, lower);
    }

    for (let i = 0; i < tickers.length; i++) {
      if (column[i] !== null) {
        variantScoreMap[tickers[i]][variantSpec.featureName] = scores[i];
        presentMetrics.get(tickers[i])!.add(base);
      } else {
        variantScoreMap[tickers[i]][variantSpec.featureName] = null;
      }
    }
  }

  const out: HierarchicalScore[] = [];
  for (const ticker of tickers) {
    const coeffs = coefficients[ticker] ?? null;
    // Step 3 — L4 sub-aspect scores (already transformed; missing → 50.0)
    const l4: Record<string, number> = {};
    for (const spec of METRIC_UNIVERSE) {
      const featureNames = FEATURE_NAMES_BY_SUB_ASPECT[spec.subAspect] ?? [];
      const variantScores = featureNames
        .map((featureName) => variantScoreMap[ticker]?.[featureName])
        .filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
      l4[spec.subAspect] = variantScores.length > 0
        ? variantScores.reduce((sum, value) => sum + value, 0) / variantScores.length
        : 50;
    }
    const present = presentMetrics.get(ticker)?.size ?? 0;
    const coverage = present / METRIC_UNIVERSE.length;

    // Step 4 — L3 aspects: weighted mean of child sub-aspects using per-symbol
    // sub-aspect weights (spec §5 Step 4: w_symbol[sa] — each sub-aspect gets
    // its own weight, so sub_aspt coefficients actually differentiate children).
    const l3: Record<string, number> = {};
    const aspectsByParent = new Map<string, string[]>();
    for (const spec of METRIC_UNIVERSE) {
      const key = `${spec.dim}/${spec.subDim}/${spec.aspect}`;
      if (!aspectsByParent.has(key)) aspectsByParent.set(key, []);
      aspectsByParent.get(key)!.push(spec.subAspect);
    }
    const l4Weights = coeffs?.sub_aspects ?? null;
    const l4Bundle: CoefficientBundle | null = l4Weights
      ? { weights: l4Weights, level: "sub_aspects", coldStart: false,
          ticker, trainedAt: "", sampleCount: 0, version: coeffs?.version ?? "unknown",
          dataHash: "", driftStatus: "OK", oosR2: null, oosIc: null,
          shapTopKeys: null, regime: "calm" }
      : null;
    const l4Lookup = getDynamicWeights(ticker, "sub_aspects", l4Bundle);
    for (const [aspectKey, childSubs] of aspectsByParent) {
      const w = childSubs.map((sa) => l4Lookup.weights[sa] ?? 1 / childSubs.length);
      l3[aspectKey] = coverageWeightedMean(
        childSubs.map((sa) => l4[sa]),
        w
      );
    }

    // Step 5 — L2 sub-dimensions: weighted mean of child aspects using per-symbol
    // aspect weights (each aspect gets its own weight → aspect coefficients matter).
    const l2: Record<string, number> = {};
    const l3Weights = coeffs?.aspects ?? null;
    const l3Bundle: CoefficientBundle | null = l3Weights
      ? { weights: l3Weights, level: "aspects", coldStart: false,
          ticker, trainedAt: "", sampleCount: 0, version: coeffs?.version ?? "unknown",
          dataHash: "", driftStatus: "OK", oosR2: null, oosIc: null,
          shapTopKeys: null, regime: "calm" }
      : null;
    const l3Lookup = getDynamicWeights(ticker, "aspects", l3Bundle);
    for (const dim of DIMENSION_KEYS) {
      for (const sd of SUB_DIMENSIONS[dim]) {
        const key = `${dim}/${sd}`;
        const childAspects = Array.from(
          new Set(
            METRIC_UNIVERSE.filter(
              (m) => m.dim === dim && m.subDim === sd
            ).map((m) => m.aspect)
          )
        ).map((a) => `${dim}/${sd}/${a}`);
        const w = childAspects.map((a) => l3Lookup.weights[a] ?? 1 / childAspects.length);
        l2[key] = coverageWeightedMean(
          childAspects.map((a) => l3[a] ?? 50),
          w
        );
      }
    }

    // Step 6 — L1 dimensions: weighted mean of child sub-dims using per-symbol
    // sub-dimension weights (each sub-dim gets its own weight → sub_dim coeffs matter).
    const l1: Record<DimensionKey, number> = {} as Record<DimensionKey, number>;
    const l2Weights = coeffs?.sub_dimensions ?? null;
    const l2Bundle: CoefficientBundle | null = l2Weights
      ? { weights: l2Weights, level: "sub_dimensions", coldStart: false,
          ticker, trainedAt: "", sampleCount: 0, version: coeffs?.version ?? "unknown",
          dataHash: "", driftStatus: "OK", oosR2: null, oosIc: null,
          shapTopKeys: null, regime: "calm" }
      : null;
    const l2Lookup = getDynamicWeights(ticker, "sub_dimensions", l2Bundle);
    for (const dim of DIMENSION_KEYS) {
      const childKeys = SUB_DIMENSIONS[dim].map((sd) => `${dim}/${sd}`);
      const w = childKeys.map((k) => l2Lookup.weights[k] ?? 1 / childKeys.length);
      l1[dim] = coverageWeightedMean(
        childKeys.map((k) => l2[k] ?? 50),
        w
      );
    }

    // Step 7 — overall: Σ dim·w / Σ w  (per-symbol dynamic, uses dimension weights)
    const dimValues = DIMENSION_KEYS.map((d) => l1[d]);
    const l1Weights = coeffs?.dimensions ?? null;
    const l1Bundle: CoefficientBundle | null = l1Weights
      ? { weights: l1Weights, level: "dimensions", coldStart: false,
          ticker, trainedAt: "", sampleCount: 0, version: coeffs?.version ?? "unknown",
          dataHash: "", driftStatus: "OK", oosR2: null, oosIc: null,
          shapTopKeys: null, regime: "calm" }
      : null;
    const l1Lookup = getDynamicWeights(ticker, "dimensions", l1Bundle);
    const dimW = DIMENSION_KEYS.map((d) => l1Lookup.weights[d]);
    let overall = 0;
    let wsum = 0;
    for (let i = 0; i < DIMENSION_KEYS.length; i++) {
      overall += dimValues[i] * dimW[i];
      wsum += dimW[i];
    }
    if (wsum === 0) overall = 50;
    else overall = overall / wsum;
    overall = clamp(overall, 0, 100);

    // Step 8 — grade & signals
    const grade = gradeFor(overall, coverage);
    const signals = signalsFor(l1 as Record<string, number>, overall);

    // Step 9 — uncertainty & stability
    const ci = conformalCI(
      overall,
      coverage,
      recentOveralls?.[ticker]?.length ?? 0
    );
    const stab = stabilityIndex(recentOveralls?.[ticker] ?? []);

    const px = prices?.[ticker];

    out.push({
      ticker,
      capturedAt,
      overall,
      grade,
      signals,
      coverage,
      ciLower: ci.lo,
      ciUpper: ci.hi,
      stabilityIndex: stab,
      price: px?.price ?? 0,
      priceChange: px?.priceChange ?? 0,
      volume: px?.volume ?? 0,
      dimensionScores: l1,
      subDimensionScores: l2,
      aspectScores: l3,
      subAspectScores: l4,
      coefficientVersion: coeffs?.version ?? "uniform-cold-start",
      dataQuality: computeDataQuality(coverage, coeffs?.version ?? "uniform-cold-start"),
    });
  }

  return out;
}

// ─── Score decomposition (waterfall) for UI: L1 contributions ──────────────
export function decomposeOverall(
  scores: Pick<
    HierarchicalScore,
    "dimensionScores" | "overall"
  >,
  weights: Record<string, number>
): Array<{ key: string; score: number; weight: number; contribution: number }> {
  const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  return DIMENSION_KEYS.map((d) => {
    const s = scores.dimensionScores[d] ?? 50;
    const w = (weights[d] ?? 1 / DIMENSION_KEYS.length) / total;
    return { key: d, score: s, weight: w, contribution: s * w };
  });
}

// ─── Decompose a dimension into its sub-dimensions ───────────────────────────
export function decomposeDimension(
  dim: DimensionKey,
  subDimScores: Record<string, number>,
  weights: Record<string, number>
): Array<{ key: string; score: number; weight: number; contribution: number }> {
  const children = SUB_DIMENSIONS[dim].map((sd) => `${dim}/${sd}`);
  const total = children.reduce(
    (a, k) => a + (weights[k] ?? 0),
    0
  ) || children.length;
  return children.map((k) => {
    const s = subDimScores[k] ?? 50;
    const w = (weights[k] ?? 1 / children.length) / total;
    return { key: k, score: s, weight: w, contribution: s * w };
  });
}
