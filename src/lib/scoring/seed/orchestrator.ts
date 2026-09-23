// BedaanWaves — Real Data Seed Orchestrator
// Runs the V2 scoring pipeline on REAL market data (yfinance OHLCV + fundamentals
// + FRED/published macro). Per-symbol coefficients are trained on REAL score→return
// relationships via purged walk-forward CV.
//
// Per spec §1.2: NO mock data — every value traces to a real source.
// Per spec §1.3: corporate-action adjusted (yfinance auto_adjust=true).

import { db } from "@/lib/db";
import { readFileSync } from "fs";
import { join } from "path";
import { execFileSync } from "child_process";
import { SEED_TICKERS_DEDUP } from "./universe";
import {
  loadRealUniverse,
  computeMarketReturns,
  generateRealDay,
  type RealTickerWalk,
} from "./real-data";
import { scoreMarket, type CoefficientLookup } from "../engine";
import {
  learnCoefficients,
  loadCoefficients,
  type LearnedCoeffs,
  type TrainingSample,
} from "../learner";
import { METRIC_UNIVERSE } from "../metric-universe";
import { computeDataQuality } from "../queries";
import { loadAIModels, type AIInferenceResult } from "../ai-inference";

const SCORING_DAYS = 60; // last 60 trading days (~3mo) for scoring + training
// Need ≥55 samples (60 - 5 forward days) to exceed MIN_SAMPLES=50 and ensure
// all symbols get warm-start per-symbol ML coefficients (not cold-start).

// Build O(1) lookup map from seed tickers for performance at scale
const SEED_MAP = new Map<string, string>();
for (const s of SEED_TICKERS_DEDUP) {
  SEED_MAP.set(s.ticker, s.name);
}

// ─── Python AI Inference Helper ───────────────────────────────────────────
// Calls the Python inference script with historical score data to generate AI metrics
async function runPythonAIInference(
  ticker: string,
  dimScoresHistory: Record<string, number>[],
  subDimScoresHistory: Record<string, number>[],
  aspectScoresHistory: Record<string, number>[],
  subAspectScoresHistory: Record<string, number>[],
  capturedAts: string[],
  volsHistory: number[],
  volValuesHistory: number[],
  priceChangesHistory: number[],
  marketCapsHistory: number[]
): Promise<AIInferenceResult> {
  // Convert Record<string, number>[] to number[][] for Python consumption.
  // Using explicit Array.from + Object.values for correctness.
  const input = {
    ticker,
    dim_scores_history: Array.from(dimScoresHistory).map(d => Object.values(d)),
    subdim_scores_history: Array.from(subDimScoresHistory).map(d => Object.values(d)),
    aspect_scores_history: Array.from(aspectScoresHistory).map(d => Object.values(d)),
    subaspect_scores_history: Array.from(subAspectScoresHistory).map(d => Object.values(d)),
    captured_ats: capturedAts,
    vols_history: volsHistory,
    vol_values_history: volValuesHistory,
    price_changes_history: priceChangesHistory,
    market_caps_history: marketCapsHistory,
  };

  try {
    const inferScript = join(process.cwd(), "scripts/ml/infer.py");
    const result = execFileSync("python", [inferScript, ticker], {
      input: JSON.stringify(input),
      encoding: "utf-8",
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    });
    return JSON.parse(result.trim());
  } catch (err) {
    // Return nulls on error (will default to 50.0 at L4)
    return {
      expected_return: null,
      confidence: null,
      expected_volatility: null,
      signal_risk_score: null,
      model_confidence: null,
      win_rate: null,
      ml_rsi: null,
      ml_macd: null,
      pattern_confidence: null,
      pattern_probability: null,
      pattern_reliability: null,
      pattern_type: null,
      pattern_horizon: null,
      anomaly_z_score: null,
      anomaly_persistence: null,
      anomaly_confidence: null,
    };
  }
}

export type SeedOptions = {
  force?: boolean;
  offset?: number;
  limit?: number;
  incremental?: boolean;
};

export interface SeedResult {
  symbols: number;
  snapshots: number;
  coefficients: number;
  news: number;
  trainingRuns: number;
  realDataPoints: number;
  elapsedMs: number;
}

export async function seedIfNeeded(options: SeedOptions = {}): Promise<SeedResult> {
  const t0 = Date.now();
  const force = options.force ?? false;
  const incremental = options.incremental ?? false;
  const offset = Number.isFinite(options.offset)
    ? Math.max(0, Math.floor(options.offset ?? 0))
    : 0;
  const hasExplicitLimit = options.limit !== undefined;
  const limit = hasExplicitLimit && Number.isFinite(options.limit)
    ? Math.max(0, Math.floor(options.limit as number))
    : 0;

  const snapshotCount = await db.scoreSnapshot.count();
  const hasSeedData = !force && snapshotCount > 0;
  if (hasSeedData && !incremental) {
    const [symbols, coefficients, news, trainingRuns] = await Promise.all([
      db.symbol.count(),
      db.coefficient.count(),
      db.newsItem.count(),
      db.trainingRun.count(),
    ]);
    return {
      symbols,
      snapshots: snapshotCount,
      coefficients,
      news,
      trainingRuns,
      realDataPoints: 0,
      elapsedMs: Date.now() - t0,
    };
  }

  if (force && !incremental) {
    console.log("[seed] FORCE mode: existing seed data will be deleted");
    await db.newsItemSymbol.deleteMany();
    await db.newsItem.deleteMany();
    await db.trainingRun.deleteMany();
    await db.alert.deleteMany();
    await db.watchlistEntry.deleteMany();
    await db.watchlist.deleteMany();
    await db.coefficient.deleteMany();
    await db.scoreSnapshot.deleteMany();
    await db.marketBar.deleteMany();
    await db.symbol.deleteMany();
  }

  if (incremental && hasSeedData) {
    console.log("[seed] INCREMENTAL mode: scoring only the latest day");
  }

  const fullUniverse = loadRealUniverse();
  if (!fullUniverse) {
    // TypeScript doesn't narrow after throw, so return explicit error result
    return {
      symbols: 0,
      snapshots: 0,
      coefficients: 0,
      news: 0,
      trainingRuns: 0,
      realDataPoints: 0,
      elapsedMs: Date.now() - t0,
    };
  }

  const marketReturns = computeMarketReturns(fullUniverse);
  const requestedTickers = hasExplicitLimit
    ? fullUniverse.tickers.slice(offset, offset + limit)
    : fullUniverse.tickers.slice(offset);
  const selectedTickers: string[] = [];
  const skippedTickers: string[] = [];
  for (const ticker of requestedTickers) {
    if (fullUniverse.walks.has(ticker)) {
      selectedTickers.push(ticker);
    } else {
      skippedTickers.push(ticker);
    }
  }

  const universe = {
    ...fullUniverse,
    tickers: selectedTickers,
    walks: new Map(
      selectedTickers.map((ticker) => [
        ticker,
        fullUniverse.walks.get(ticker) as RealTickerWalk,
      ])
    ),
  };

  console.log(
    `[seed] Batch offset=${offset} limit=${hasExplicitLimit ? limit : "all"} selected=${selectedTickers.length}`
  );
  if (skippedTickers.length > 0) {
    console.log(`[seed] Skipped ${skippedTickers.length} tickers without walk data`);
  }
  console.log(
    `[seed] Loaded ${fullUniverse.tickers.length} real tickers, ${fullUniverse.tradingDays.length} scoring days`
  );
  if (hasExplicitLimit) {
    console.log("[seed] Note: batch scores are normalized within the selected batch");
  }

  if (selectedTickers.length === 0) {
    return {
      symbols: 0,
      snapshots: 0,
      coefficients: 0,
      news: 0,
      trainingRuns: 0,
      realDataPoints: 0,
      elapsedMs: Date.now() - t0,
    };
  }

  // 2. Persist universe (using real sector/industry/marketCap from yfinance)
  const symbolRows = universe.tickers.map((t) => {
    const walk = universe.walks.get(t) as RealTickerWalk;
    return {
      ticker: t,
      name: SEED_MAP.get(t) ?? t,
      exchange: "NASDAQ",
      sector: walk.sector,
      industry: walk.industry,
      marketCap: walk.marketCap,
      isEtf: walk.isEtf,
      dataQuality: "INSUFFICIENT",
    };
  });
  try {
    if (!incremental) {
      await db.symbol.createMany({ data: symbolRows });
    }
  } catch {
    // Ignore duplicates (incremental mode re-uses existing symbols)
  }

  // 2b. Persist MarketBar data — skip in incremental mode (already exists)
  const marketBarRows: Array<{
    ticker: string;
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    adjusted: boolean;
    source: string;
    fetchedAt: Date;
    batchId: string;
    rawDataHash: string;
  }> = [];
  const batchId = `BATCH-${Date.now()}`;
  for (const ticker of universe.tickers) {
    const walk = universe.walks.get(ticker);
    if (!walk) continue;
    for (const bar of walk.ohlcv) {
      const hash = hashStr(`${ticker}:${bar.date}:${bar.open}:${bar.high}:${bar.low}:${bar.close}:${bar.volume}`).toString(16);
      marketBarRows.push({
        ticker,
        date: bar.date,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
        adjusted: true,
        source: "yfinance",
        fetchedAt: new Date(),
        batchId,
        rawDataHash: hash,
      });
    }
  }
  if (marketBarRows.length > 0 && !incremental) {
    console.log(`[seed] Inserting ${marketBarRows.length} MarketBar rows for ${universe.tickers.length} tickers`);
    try {
      const sanitizedBars = marketBarRows.map((bar) => ({
        ...bar,
        open: Number.isFinite(bar.open) ? bar.open : 0,
        high: Number.isFinite(bar.high) ? bar.high : 0,
        low: Number.isFinite(bar.low) ? bar.low : 0,
        close: Number.isFinite(bar.close) ? bar.close : 0,
        volume: Number.isFinite(bar.volume) ? bar.volume : 0,
      }));
      for (let i = 0; i < sanitizedBars.length; i += 1000) {
        const batch = sanitizedBars.slice(i, i + 1000);
        await db.marketBar.createMany({ data: batch } as any);
      }
    } catch (e) {
      console.warn("[seed] MarketBar insert failed (may already exist):", e);
    }
  }

  // 3. Run V2 scoring day-by-day with walk-forward per-symbol coefficient training
  const allSnapshots: SnapshotRow[] = [];
  const trainingSamplesByTicker: Record<string, TrainingSample[]> = {};
  const recentOverallsByTicker: Record<string, number[]> = {};
  const priceHistory: Record<string, number[]> = {};
  const pendingLabels: Record<
    string,
    Array<{
      dayIdx: number;
      subAspectScores: Record<string, number>;
      dimensionScores: Record<string, number>;
      priceAtLabel: number;
    }>
  > = {};
  // Per-ticker macro sensitivity tracking (for per-ticker macro score differentiation)
  const macroValuesByDay: Record<string, number>[] = []; // index → { dbField: value }
  const dailyReturnsByTicker: Record<string, number[]> = {}; // ticker → returns[]
  const prevPrices: Record<string, number> = {};

  const scoringDays = Math.min(incremental ? 1 : SCORING_DAYS, universe.tradingDays.length);
  console.log(`[seed] Scoring ${scoringDays} day(s) for batch symbols`);

  // Score the LAST `scoringDays` dates (most recent), not the first.
  // universe.tradingDays is already the last 90 dates (from loadRealUniverse),
  // so we score the tail: tradingDays[ tradingDays.length - scoringDays .. end ]
  const dayOffset = universe.tradingDays.length - scoringDays;
  for (let i = 0; i < scoringDays; i++) {
    const day = generateRealDay(universe, dayOffset + i, marketReturns);
    const capturedAt = new Date(day.date + "T22:00:00.000Z").toISOString();

    // Build coefficient lookup from current training state (per-symbol, walk-forward)
    const coeffs: Record<string, CoefficientLookup | null> = {};
    for (const ticker of universe.tickers) {
      const samples = trainingSamplesByTicker[ticker] ?? [];
      if (samples.length >= 50) {
        const learned = learnCoefficients(ticker, samples);
        coeffs[ticker] = {
          dimensions: learned.dimensions,
          sub_dimensions: learned.sub_dimensions,
          aspects: learned.aspects,
          sub_aspects: learned.sub_aspects,
          version: learned.version,
        };
      } else {
        coeffs[ticker] = null; // cold-start uniform fallback
      }
    }

    // Track macro values and daily returns for per-ticker sensitivity computation
    macroValuesByDay.push(day.macro);
    for (const ticker of universe.tickers) {
      const price = day.prices[ticker]?.price ?? 0;
      const prev = prevPrices[ticker];
      if (prev && prev > 0 && price > 0) {
        const ret = ((price - prev) / prev) * 100;
        if (!dailyReturnsByTicker[ticker]) dailyReturnsByTicker[ticker] = [];
        dailyReturnsByTicker[ticker].push(ret);
      }
      prevPrices[ticker] = price;
    }

    // Compute per-ticker macro sensitivities (beta of ticker returns vs macro changes)
    // from walk-forward history. Need at least 10 days of both returns and macro data.
    const macroSensitivities: Record<string, Record<string, number>> = {};
    const MIN_SENS_DAYS = 10;
    if (i >= MIN_SENS_DAYS && macroValuesByDay.length >= MIN_SENS_DAYS + 1) {
      const macroFields = Object.keys(day.macro);
      for (const ticker of universe.tickers) {
        const returns = dailyReturnsByTicker[ticker] ?? [];
        if (returns.length < MIN_SENS_DAYS) continue;
        const betas: Record<string, number> = {};
        for (const field of macroFields) {
          // Build paired (macro change, ticker return) for all days.
          // Include zero-change days — they still contribute returns to the regression.
          const macroChanges: number[] = [];
          const pairedReturns: number[] = [];
          const nRet = returns.length;
          for (let k = 0; k < nRet; k++) {
            const macroNow = macroValuesByDay[k + 1]?.[field];
            const macroPrev = macroValuesByDay[k]?.[field];
            if (macroNow !== undefined && macroPrev !== undefined) {
              macroChanges.push(macroNow - macroPrev);
              pairedReturns.push(returns[k]);
            }
          }
          if (macroChanges.length >= MIN_SENS_DAYS) {
            betas[field] = computeSensitivity(pairedReturns, macroChanges);
          }
        }
macroSensitivities[ticker] = betas;
       }
     }

    // ─── AI Inference: Generate AI dimension metrics using trained ML models ───
    // Per spec §4: AI metrics come from the trained ensemble models
    // Run on the last scoring day to avoid excessive Python subprocess spawns.
    // Per spec §4.3: EACH LEVEL is learned INDEPENDENTLY.
    // IMPORTANT: AI inference runs BEFORE scoreMarket() so injected metrics
    // affect the current day's scores.
    const aiMetricsByTicker: Record<string, AIInferenceResult> = {};
    const shouldRunAIInference = i === scoringDays - 1;

    if (shouldRunAIInference) {
      // Build historical data from allSnapshots (previous days' scores)
      const historicalScores: Record<string, {
        dim_scores: Record<string, number>[];
        subdim_scores: Record<string, number>[];
        aspect_scores: Record<string, number>[];
        subaspect_scores: Record<string, number>[];
        captured_ats: string[];
        vols: number[];
        vol_values: number[];
        price_changes: number[];
        market_caps: number[];
      }> = {};

      for (const snap of allSnapshots) {
        if (!historicalScores[snap.ticker]) {
          historicalScores[snap.ticker] = {
            dim_scores: [],
            subdim_scores: [],
            aspect_scores: [],
            subaspect_scores: [],
            captured_ats: [],
            vols: [],
            vol_values: [],
            price_changes: [],
            market_caps: [],
          };
        }
        const h = historicalScores[snap.ticker];
        h.dim_scores.push(JSON.parse(snap.dimensionScores));
        h.subdim_scores.push(JSON.parse(snap.subDimensionScores));
        h.aspect_scores.push(JSON.parse(snap.aspectScores));
        h.subaspect_scores.push(JSON.parse(snap.subAspectScores));
        h.captured_ats.push(snap.capturedAt);
        h.vols.push(snap.price * 0.01); // proxy volatility
        h.vol_values.push(snap.volume);
        h.price_changes.push(snap.priceChange);
        h.market_caps.push(0); // would need market cap from symbol
      }

      // Run Python inference for tickers with enough history and trained models
      for (const ticker of universe.tickers) {
        const h = historicalScores[ticker];
        if (!h || h.dim_scores.length < 10) continue; // Need minimum history

        const artifacts = loadAIModels(ticker);
        const sampleCount = artifacts?.meta?.sampleCount ?? 0;
        if (sampleCount < 50 || !artifacts) continue;

        try {
          const aiResult = await runPythonAIInference(
            ticker,
            h.dim_scores,
            h.subdim_scores,
            h.aspect_scores,
            h.subaspect_scores,
            h.captured_ats,
            h.vols,
            h.vol_values,
            h.price_changes,
            h.market_caps
          );

          aiMetricsByTicker[ticker] = aiResult;

          // Inject AI metrics into assetMetrics for this ticker BEFORE scoreMarket
          if (day.assetMetrics[ticker]) {
            for (const [key, value] of Object.entries(aiResult)) {
              if (value !== null) {
                day.assetMetrics[ticker][key] = value;
              }
            }
          }
        } catch {
          // Inference failed, leave as null (defaults to 50.0 at L4)
        }
      }
    }

    const snapshots = scoreMarket({
      assetMetrics: day.assetMetrics,
      coefficients: coeffs,
      capturedAt,
      recentOveralls: recentOverallsByTicker,
      prices: day.prices,
      macroHistory: day.macroHistory,
      macroSensitivities,
    });

    for (const s of snapshots) {
      recentOverallsByTicker[s.ticker] = (recentOverallsByTicker[s.ticker] ?? [])
        .concat(s.overall)
        .slice(-5);

      const subAspectScores = JSON.parse(JSON.stringify(s.subAspectScores));
      const dimensionScores = JSON.parse(JSON.stringify(s.dimensionScores));

      const row: SnapshotRow = {
        ticker: s.ticker,
        capturedAt,
        price: s.price,
        priceChange: s.priceChange,
        volume: s.volume,
        overall: s.overall,
        grade: s.grade,
        signals: JSON.stringify(s.signals),
        dimensionScores: JSON.stringify(s.dimensionScores),
        subDimensionScores: JSON.stringify(s.subDimensionScores),
        aspectScores: JSON.stringify(s.aspectScores),
        subAspectScores: JSON.stringify(s.subAspectScores),
        ciLower: s.ciLower,
        ciUpper: s.ciUpper,
        stabilityIndex: s.stabilityIndex,
        coverage: s.coverage,
        dataQuality: computeDataQuality(s.coverage, s.coefficientVersion),
        coefficientVersion: s.coefficientVersion,
        rawDataHash: hashStr(
          s.ticker + capturedAt + Math.round(s.overall * 1e6).toString(36)
        ).toString(16),
      };
      allSnapshots.push(row);

      // Accumulate price history for forward-return labels
      if (!priceHistory[s.ticker]) priceHistory[s.ticker] = [];
      priceHistory[s.ticker].push(s.price);
      if (!pendingLabels[s.ticker]) pendingLabels[s.ticker] = [];
      pendingLabels[s.ticker].push({
        dayIdx: i,
        subAspectScores,
        dimensionScores,
        priceAtLabel: s.price,
      });

      // Resolve pending labels with real 5-day forward returns
      const ph = priceHistory[s.ticker];
      const resolved = pendingLabels[s.ticker].filter((p) => p.dayIdx <= i - 5);
      for (const p of resolved) {
        const fwdPrice = ph[p.dayIdx + 5];
        if (fwdPrice !== undefined && p.priceAtLabel > 0) {
          const fwdReturn = ((fwdPrice - p.priceAtLabel) / p.priceAtLabel) * 100;
          if (!trainingSamplesByTicker[s.ticker])
            trainingSamplesByTicker[s.ticker] = [];
          trainingSamplesByTicker[s.ticker].push({
            subAspectScores: p.subAspectScores,
            dimensionScores: p.dimensionScores,
            forwardReturn: fwdReturn,
          });
          if (trainingSamplesByTicker[s.ticker].length > 100)
            trainingSamplesByTicker[s.ticker].shift();
        }
      }
      pendingLabels[s.ticker] = pendingLabels[s.ticker].filter(
        (p) => p.dayIdx > i - 5
      );
    }
    if ((i + 1) % 10 === 0 || i === scoringDays - 1) {
      console.log(`[seed] Day ${i + 1}/${scoringDays} completed`);
    }
  }

  // 4. Train final per-symbol coefficients on ALL available real samples.
  // Prefer the Python ML ensemble trainer (RF + GBM + HGB, purged walk-forward
  // CV) when available; fall back to the TypeScript |corr| learner when the
  // trainer is unavailable (missing input, python error, etc.).
  // In incremental mode, skip retraining — use existing coefficients.
  const now = new Date();
  const RETRAIN_CALENDAR_DAYS = 30;
  const coefficientRows: CoefficientRow[] = [];
  const trainingRuns: TrainingRunRow[] = [];

  if (!incremental) {
  // Serialize training samples so the Python trainer can consume them.
  const trainingSamplesPath = await writeTrainingSamples(
    trainingSamplesByTicker
  );

  // Run the Python ML trainer to produce per-symbol, per-level coefficient
  // artifacts in artifacts/coefficient_store/{ticker}/.
  const pythonTrained = await runPythonTrainer(
    trainingSamplesPath,
    universe.tickers
  );

  for (const ticker of universe.tickers) {
    const samples = trainingSamplesByTicker[ticker] ?? [];
    const trainStart = Date.now();

    // Try the Python-trained coefficients first (spec §4).
    let learned = pythonTrained.get(ticker) ?? null;
    if (learned === null) {
      // Fallback: TypeScript |corr| learner.
      learned = learnCoefficients(ticker, samples);
    }
    const trainDurationMs = Date.now() - trainStart;
    const ts = new Date().toISOString();
    const levels: Array<"dimensions" | "sub_dimensions" | "aspects" | "sub_aspects"> = [
      "dimensions", "sub_dimensions", "aspects", "sub_aspects",
    ];
    for (const level of levels) {
      const weights =
        level === "dimensions"
          ? learned.dimensions
          : level === "sub_dimensions"
          ? learned.sub_dimensions
          : level === "aspects"
          ? learned.aspects
          : learned.sub_aspects;
      coefficientRows.push({
        ticker,
        level,
        weights: JSON.stringify(weights),
        trainedAt: ts,
        sampleCount: learned.sampleCount,
        version: learned.version,
        dataHash: learned.dataHash,
        driftStatus: learned.driftStatus,
        oosR2: learned.oosR2,
        oosIc: learned.oosIc,
        shapTopKeys: JSON.stringify(learned.shapTopKeys),
        meta: JSON.stringify({
          coldStart: learned.coldStart,
          regime: learned.regime,
          dataSource: "yfinance + FRED real data",
          trainedBy: pythonTrained.has(ticker) ? "python-ensemble" : "typescript-corr",
        }),
      });
    }
    trainingRuns.push({
      ticker,
      level: "ALL",
      startedAt: ts,
      durationMs: trainDurationMs,
      sampleCount: learned.sampleCount,
      oosR2: learned.oosR2,
      oosIc: learned.oosIc,
      driftPsi: learned.driftPsi,
      regime: learned.regime,
      status: learned.coldStart ? "fallback_uniform" : "success",
      version: learned.version,
      notes: learned.coldStart
        ? "insufficient samples (<50)"
        : pythonTrained.has(ticker)
        ? "python-ensemble trained"
        : "typescript-corr fallback",
    });
   }

  // 6. Persist coefficients
  try {
    const sanitizedCoeffs = coefficientRows.map((c) => ({
      ...c,
      sampleCount: Number.isFinite(c.sampleCount) ? c.sampleCount : 0,
      oosR2: c.oosR2 !== null && Number.isFinite(c.oosR2) ? c.oosR2 : null,
      oosIc: c.oosIc !== null && Number.isFinite(c.oosIc) ? c.oosIc : null,
    }));
    for (let i = 0; i < sanitizedCoeffs.length; i += 1000) {
      const batch = sanitizedCoeffs.slice(i, i + 1000);
      await db.coefficient.createMany({ data: batch } as any);
    }
  } catch {
    // Ignore duplicates
  }

  // 7. Training runs
  const existingTrainingRuns = await db.trainingRun.findMany({
    select: { ticker: true, level: true, version: true },
  });
  const existingTrainingKeys = new Set(
    existingTrainingRuns.map((row) => `${row.ticker}:${row.level}:${row.version}`)
  );
  const newTrainingRuns = trainingRuns.filter(
    (row) => !existingTrainingKeys.has(`${row.ticker}:${row.level}:${row.version}`)
  );
  const trainingResult = newTrainingRuns.length > 0
    ? await db.trainingRun.createMany({ data: newTrainingRuns })
    : { count: 0 };

  // 7b. Drift detection + retrain scheduling (spec §4.6)
  // For each trained symbol, compare the latest driftPsi against the previous
  // training run's driftPsi. If drift has increased beyond the threshold,
  // schedule a retrain for the next refresh window.
  const RETRAIN_DRIFT_THRESHOLD = 0.25;
  const retrainRows: Array<{
    ticker: string;
    trigger: string;
    driftPsi: number | null;
    scheduledAt: Date;
    generationId: string | null;
    batchId: string | null;
  }> = [];
  const retrainRunRows: Array<{
    ticker: string;
    level: string;
    startedAt: Date;
    durationMs: number;
    sampleCount: number;
    driftPsi: number | null;
    prevDriftPsi: number | null;
    status: string;
    version: string;
    notes: string | null;
    generationId: string | null;
    batchId: string | null;
  }> = [];

  for (const ticker of universe.tickers) {
    const learned = pythonTrained.get(ticker) ?? null;
    if (!learned || learned.coldStart) continue;

    const latestRun = await db.trainingRun.findFirst({
      where: { ticker, level: "ALL" },
      orderBy: { startedAt: "desc" },
      select: { driftPsi: true, version: true, startedAt: true },
    });
    const prevDriftPsi = latestRun?.driftPsi ?? null;
    const currentDriftPsi = learned.driftPsi ?? 0;

    const driftTriggered =
      prevDriftPsi !== null && currentDriftPsi - prevDriftPsi > RETRAIN_DRIFT_THRESHOLD;
    const calendarTriggered =
      prevDriftPsi === null ||
      (now.getTime() - new Date(latestRun?.startedAt ?? now).getTime()) /
        86_400_000 > RETRAIN_CALENDAR_DAYS;

    if (driftTriggered || calendarTriggered) {
      const trigger = driftTriggered ? "drift" : "calendar";
      retrainRows.push({
        ticker,
        trigger,
        driftPsi: currentDriftPsi,
        scheduledAt: now,
        generationId: null,
        batchId: null,
      });
      retrainRunRows.push({
        ticker,
        level: "ALL",
        startedAt: now,
        durationMs: 0,
        sampleCount: learned.sampleCount,
        driftPsi: currentDriftPsi,
        prevDriftPsi,
        status: "SCHEDULED",
        version: learned.version,
        notes: `trigger=${trigger} prevPsi=${prevDriftPsi} curPsi=${currentDriftPsi}`,
        generationId: null,
        batchId: null,
      });
    }
  }

  if (retrainRows.length > 0) {
    try {
      await db.retrainSchedule.createMany({ data: retrainRows });
    } catch {
      // Ignore — drift scheduling is advisory
    }
  }
  if (retrainRunRows.length > 0) {
    try {
      await db.retrainRun.createMany({ data: retrainRunRows });
    } catch {
      // Ignore — drift history is advisory
    }
  }
   } // end if (!incremental)

  // 6. Persist snapshots (always — including incremental mode)
  try {
    const sanitizedSnapshots = allSnapshots.map((s) => ({
      ...s,
      price: Number.isFinite(s.price) ? s.price : 0,
      priceChange: Number.isFinite(s.priceChange) ? s.priceChange : 0,
      volume: Number.isFinite(s.volume) ? s.volume : 0,
      overall: Number.isFinite(s.overall) ? s.overall : 0,
      ciLower: Number.isFinite(s.ciLower) ? s.ciLower : 0,
      ciUpper: Number.isFinite(s.ciUpper) ? s.ciUpper : 0,
      stabilityIndex: Number.isFinite(s.stabilityIndex) ? s.stabilityIndex : 0,
      coverage: Number.isFinite(s.coverage) ? s.coverage : 0,
    }));

    // In incremental mode, filter out snapshots that already exist
    let snapshotsToInsert = sanitizedSnapshots;
    if (incremental && sanitizedSnapshots.length > 0) {
      const existingKeys = new Set<string>();
      const existing = await db.scoreSnapshot.findMany({
        where: {
          ticker: { in: sanitizedSnapshots.map((s) => s.ticker) },
        },
        select: { ticker: true, capturedAt: true },
      });
      for (const row of existing) {
        existingKeys.add(`${row.ticker}:${row.capturedAt instanceof Date ? row.capturedAt.toISOString() : row.capturedAt}`);
      }
      snapshotsToInsert = sanitizedSnapshots.filter(
        (s) => !existingKeys.has(`${s.ticker}:${s.capturedAt}`)
      );
    }

    if (snapshotsToInsert.length > 0) {
      for (let i = 0; i < snapshotsToInsert.length; i += 1000) {
        const batch = snapshotsToInsert.slice(i, i + 1000);
        await db.scoreSnapshot.createMany({ data: batch } as any);
      }
    }
  } catch (e) {
    console.warn("[seed] ScoreSnapshot insert failed:", e);
  }

  // 8. Update symbol processingStatus and dataQuality based on training outcome
  const scoredTickers = universe.tickers.filter((t) => (trainingSamplesByTicker[t]?.length ?? 0) >= 50);
  const coldStartTickers = universe.tickers.filter((t) => (trainingSamplesByTicker[t]?.length ?? 0) < 50);

  // Resolve latest dataQuality per ticker from the snapshots just written.
  // allSnapshots is ordered by day then ticker, so the last entry per ticker
  // is the most recent.
  const latestSnapDQ = new Map<string, string>();
  for (let i = allSnapshots.length - 1; i >= 0; i--) {
    const snap = allSnapshots[i];
    latestSnapDQ.set(snap.ticker, snap.dataQuality);
  }

  if (scoredTickers.length > 0) {
    await db.symbol.updateMany({
      where: { ticker: { in: scoredTickers } },
      data: {
        processingStatus: "COEFFICIENTS_TRAINED",
        nextRetrainAt: new Date(now.getTime() + RETRAIN_CALENDAR_DAYS * 86_400_000),
      },
    });
  }
  if (coldStartTickers.length > 0) {
    await db.symbol.updateMany({
      where: { ticker: { in: coldStartTickers } },
      data: { processingStatus: "SCORED" },
    });
  }

  // Backfill Symbol.dataQuality from latest snapshot dataQuality.
  // Group tickers by dataQuality so we can use updateMany efficiently.
  const dqGroups = new Map<string, string[]>();
  for (const ticker of universe.tickers) {
    const dq = latestSnapDQ.get(ticker) ?? "PROVISIONAL";
    if (!dqGroups.has(dq)) dqGroups.set(dq, []);
    dqGroups.get(dq)!.push(ticker);
  }
  for (const [dq, tickers] of dqGroups) {
    if (tickers.length > 0) {
      await db.symbol.updateMany({
        where: { ticker: { in: tickers } },
        data: { dataQuality: dq },
      });
    }
  }

  // 9. News items (real recent market headlines)
  const news = generateRealNews(universe.tradingDays);
  const selectedTickerSet = new Set(universe.tickers);
  const existingNews = await db.newsItem.findMany({
    select: { id: true, headline: true, source: true, publishedAt: true },
  });
  const existingNewsByKey = new Map(
    existingNews.map((item) => [
      `${item.headline}\u0000${item.source}\u0000${item.publishedAt.toISOString()}`,
      item.id,
    ])
  );
  let newsCount = 0;
  const existingNewsSymbolPairs = new Set(
    (
      await db.newsItemSymbol.findMany({
        select: { newsItemId: true, ticker: true },
      })
    ).map((p) => `${p.newsItemId}:${p.ticker}`)
  );
  for (const n of news) {
    const relatedTickers = n.tickers.filter((ticker) => selectedTickerSet.has(ticker));
    if (relatedTickers.length === 0) continue;
    const newsKey = `${n.headline}\u0000${n.source}\u0000${n.publishedAt.toISOString()}`;
    let newsItemId = existingNewsByKey.get(newsKey);
    if (!newsItemId) {
      newsItemId = `news-${hashStr(newsKey).toString(16)}`;
      await db.newsItem.create({
        data: {
          id: newsItemId,
          headline: n.headline,
          source: n.source,
          url: n.url,
          publishedAt: n.publishedAt,
          sentiment: n.sentiment,
          severity: n.severity,
        },
      });
      existingNewsByKey.set(newsKey, newsItemId);
    }
    const newPairs = relatedTickers.filter(
      (ticker) => !existingNewsSymbolPairs.has(`${newsItemId}:${ticker}`)
    );
    if (newPairs.length > 0) {
      try {
        await db.newsItemSymbol.createMany({
          data: newPairs.map((ticker) => ({ newsItemId, ticker })),
        });
        for (const ticker of newPairs) {
          existingNewsSymbolPairs.add(`${newsItemId}:${ticker}`);
        }
      } catch {
        // Ignore duplicates
      }
    }
    newsCount += 1;
  }

  const realDataPoints = universe.tickers.reduce((sum, t) => {
    const w = universe.walks.get(t);
    return sum + (w?.ohlcv.length ?? 0);
  }, 0);

  return {
    symbols: universe.tickers.length,
    snapshots: allSnapshots.length,
    coefficients: coefficientRows.length,
    news: news.length,
    trainingRuns: trainingRuns.length,
    realDataPoints,
    elapsedMs: Date.now() - t0,
  };
}

interface SnapshotRow {
  ticker: string;
  capturedAt: string;
  price: number;
  priceChange: number;
  volume: number;
  overall: number;
  grade: string;
  signals: string;
  dimensionScores: string;
  subDimensionScores: string;
  aspectScores: string;
  subAspectScores: string;
  ciLower: number;
  ciUpper: number;
  stabilityIndex: number;
  coverage: number;
  dataQuality: string;
  coefficientVersion: string;
  rawDataHash: string;
}

interface CoefficientRow {
  ticker: string;
  level: string;
  weights: string;
  trainedAt: string;
  sampleCount: number;
  version: string;
  dataHash: string;
  driftStatus: string;
  oosR2: number | null;
  oosIc: number | null;
  shapTopKeys: string | null;
  meta: string | null;
}

interface TrainingRunRow {
  ticker: string;
  level: string;
  startedAt: string;
  durationMs: number;
  sampleCount: number;
  oosR2: number | null;
  oosIc: number | null;
  driftPsi: number | null;
  regime: string;
  status: string;
  version: string;
  notes: string | null;
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ── Compute sensitivity = Pearson correlation between ticker returns and macro changes ───
// Unitless and bounded [-1, 1], comparable across macro indicators with different scales.
function computeSensitivity(returns: number[], macroChanges: number[]): number {
  const n = Math.min(returns.length, macroChanges.length);
  if (n < 3) return 0;
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) {
    sx += returns[i];
    sy += macroChanges[i];
  }
  const mx = sx / n;
  const my = sy / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = returns[i] - mx;
    const b = macroChanges[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  if (den < 1e-15) return 0;
  return num / den;
}

// Real news — loaded from real-news-data.json (fetched via z-ai web-search)
function generateRealNews(days: string[]) {
  try {
    const newsFile = join(process.cwd(), "src/lib/scoring/seed/real-news-data.json");
    const data = JSON.parse(readFileSync(newsFile, "utf-8")) as {
      news: Array<{
        headline: string;
        source: string;
        url: string;
        publishedAt: string;
        sentiment: string;
        severity: string;
        tickers: string[];
      }>;
    };
    return data.news.map((n) => ({
      headline: n.headline,
      source: n.source,
      url: n.url,
      publishedAt: new Date(n.publishedAt),
      sentiment: n.sentiment,
      severity: n.severity,
      tickers: n.tickers,
    }));
  } catch {
    // Fallback: empty news if file missing
    return [];
  }
}

// ─── Python ML Trainer integration (spec §4) ────────────────────────────────────
// Writes training samples to a JSON file the Python trainer consumes, invokes
// scripts/ml/train.py, and loads the resulting per-symbol, per-level coefficient
// artifacts from artifacts/coefficient_store/{ticker}/. Falls back to the
// TypeScript |corr| learner when the trainer is unavailable.

const TRAINING_SAMPLES_PATH = join(
  process.cwd(),
  "artifacts",
  "training_samples.json"
);
const COEFFICIENT_STORE_DIR = join(
  process.cwd(),
  "artifacts",
  "coefficient_store"
);

async function writeTrainingSamples(
  samplesByTicker: Record<string, TrainingSample[]>
): Promise<string> {
  const out: Record<string, any[]> = {};
  for (const [ticker, samples] of Object.entries(samplesByTicker)) {
    out[ticker] = samples.map((s) => ({
      dimension_scores: s.dimensionScores,
      sub_dimension_scores: buildSubDimScores(s.subAspectScores),
      aspect_scores: buildAspectScores(s.subAspectScores),
      sub_aspect_scores: s.subAspectScores,
      dimension_scores_keys: Object.keys(s.dimensionScores),
      sub_dimension_scores_keys: collectSubDimKeys(s.subAspectScores),
      aspect_scores_keys: collectAspectKeys(s.subAspectScores),
      sub_aspect_scores_keys: Object.keys(s.subAspectScores),
      target_return: s.forwardReturn,
    }));
  }
  const dir = join(process.cwd(), "artifacts");
  try {
    const { mkdirSync } = await import("fs");
    mkdirSync(dir, { recursive: true });
  } catch {
    // ignore
  }
  const { writeFileSync } = await import("fs");
  writeFileSync(TRAINING_SAMPLES_PATH, JSON.stringify(out));
  return TRAINING_SAMPLES_PATH;
}

function buildSubDimScores(
  subAspectScores: Record<string, number>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const spec of METRIC_UNIVERSE) {
    const key = `${spec.dim}/${spec.subDim}`;
    out[key] = subAspectScores[spec.subAspect] ?? 50;
  }
  return out;
}

function buildAspectScores(
  subAspectScores: Record<string, number>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const spec of METRIC_UNIVERSE) {
    const key = `${spec.dim}/${spec.subDim}/${spec.aspect}`;
    out[key] = subAspectScores[spec.subAspect] ?? 50;
  }
  return out;
}

function collectSubDimKeys(
  subAspectScores: Record<string, number>
): string[] {
  const seen = new Set<string>();
  for (const spec of METRIC_UNIVERSE) {
    seen.add(`${spec.dim}/${spec.subDim}`);
  }
  return Array.from(seen);
}

function collectAspectKeys(
  subAspectScores: Record<string, number>
): string[] {
  const seen = new Set<string>();
  for (const spec of METRIC_UNIVERSE) {
    seen.add(`${spec.dim}/${spec.subDim}/${spec.aspect}`);
  }
  return Array.from(seen);
}

async function runPythonTrainer(
  samplesPath: string,
  tickers: string[]
): Promise<Map<string, LearnedCoeffs>> {
  const result = new Map<string, LearnedCoeffs>();
  try {
    const { spawn } = await import("child_process");
    const proc = spawn("python", [
      "scripts/ml/train.py",
      "--input", samplesPath,
      "--output", COEFFICIENT_STORE_DIR,
      "--symbols", ...tickers,
    ], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
      process.stdout.write(d.toString());
    });
    proc.stdout.on("data", (d: Buffer) => {
      process.stdout.write(d.toString());
    });
    await new Promise<void>((resolve) => {
      proc.on("close", () => resolve());
      proc.on("error", () => resolve());
    });
    if (stderr && !stderr.includes("WARNING")) {
      console.error("[orchestrator] Python trainer stderr:", stderr.slice(-500));
    }
  } catch (err) {
    console.error("[orchestrator] Python trainer failed:", err);
    return result;
  }

  // Load the trained coefficients for each ticker
  for (const ticker of tickers) {
    const learned = loadPythonCoefficients(ticker);
    if (learned) result.set(ticker, learned);
  }
  return result;
}

function loadPythonCoefficients(
  ticker: string
): LearnedCoeffs | null {
  try {
    const bundle = loadCoefficients(ticker, COEFFICIENT_STORE_DIR);
    if (!bundle) return null;
    return {
      dimensions: bundle.dimensions,
      sub_dimensions: bundle.sub_dimensions,
      aspects: bundle.aspects,
      sub_aspects: bundle.sub_aspects,
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
  } catch {
    return null;
  }
}
