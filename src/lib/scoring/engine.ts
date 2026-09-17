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
  type DimensionKey,
} from "./metric-universe";
import {
  clamp,
  conformalCI,
  coverageWeightedMean,
  crossSectionalScore,
  gradeFor,
  signalsFor,
  stabilityIndex,
  subAspectScore,
  timeSeriesScore,
  uniformWeights,
  isValidCoefficients,
} from "./transforms";
import type { CoefficientBundle, HierarchicalScore } from "./types";

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

  // Support both CoefficientBundle (.weights nested) and flat weights records
  // (weights spread directly on the object with a `level` key, as passed from scoreMarket).
  const weights = (bundle as any)?.weights ?? (bundle as any);

  if (
    bundle &&
    !bundle.coldStart &&
    bundle.level === level &&
    weights &&
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
  const n = tickers.length;

    // Step 1 — compute sub-aspect scores per db_field
    // For macro dimension metrics (market-wide, same value for all tickers),
    // use time-series scoring then modulate by per-ticker macro sensitivity (beta)
    // so that different tickers get differentiated macro dimension scores.
    const subAspectScoreMap: Record<string, Record<string, number>> = {};
    for (const ticker of tickers) subAspectScoreMap[ticker] = {};
    for (const spec of METRIC_UNIVERSE) {
      if (spec.dim === "macro") {
        // Time-series scoring: score the current macro value relative to its
        // historical distribution. All tickers share the same base score.
        const hist = input.macroHistory?.[spec.dbField] ?? [];
        let baseScore = 50.0;
        for (let i = 0; i < n; i++) {
          const val = assetMetrics[tickers[i]]?.[spec.dbField] ?? null;
          baseScore = timeSeriesScore(val, hist, spec.lowerIsBetter);
          // Modulate by per-ticker sensitivity: positive beta amplifies the
          // deviation from 50 in the favorable direction; negative beta reverses it.
          const beta = clamp(input.macroSensitivities?.[tickers[i]]?.[spec.dbField] ?? 0, -1, 1);
          const adjusted = 50 + (baseScore - 50) * (1 + beta * 0.6);
          subAspectScoreMap[tickers[i]][spec.subAspect] = clamp(adjusted, 0, 100);
        }
      } else {
       // Cross-sectional scoring for per-ticker metrics (fundamental, technical, etc.)
       const col: (number | null)[] = tickers.map(
         (t) => assetMetrics[t]?.[spec.dbField] ?? null
       );
       const scores = crossSectionalScore(col, spec.lowerIsBetter);
       for (let i = 0; i < n; i++) {
         subAspectScoreMap[tickers[i]][spec.subAspect] = scores[i];
       }
     }
   }

  const out: HierarchicalScore[] = [];
  for (const ticker of tickers) {
    const coeffs = coefficients[ticker] ?? null;
    // Step 3 — L4 sub-aspect scores (already transformed; missing → 50.0)
    const l4: Record<string, number> = {};
    let present = 0;
    for (const spec of METRIC_UNIVERSE) {
      const s = subAspectScoreMap[ticker][spec.subAspect];
      l4[spec.subAspect] = s;
      if (s !== 50.0) present++;
    }
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
    const l4Lookup = getDynamicWeights(ticker, "sub_aspects", l4Weights ? { ...l4Weights, level: "sub_aspects" } as CoefficientBundle : null);
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
    const l3Lookup = getDynamicWeights(ticker, "aspects", l3Weights ? { ...l3Weights, level: "aspects" } as CoefficientBundle : null);
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
    const l2Lookup = getDynamicWeights(ticker, "sub_dimensions", l2Weights ? { ...l2Weights, level: "sub_dimensions" } as CoefficientBundle : null);
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
    const l1Lookup = getDynamicWeights(ticker, "dimensions", l1Weights ? { ...l1Weights, level: "dimensions" } as CoefficientBundle : null);
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
    const grade = gradeFor(overall);
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
      dataQuality: "VALIDATED",
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
