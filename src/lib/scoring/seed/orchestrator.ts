// BedaanWaves — seed orchestrator.
// Runs the full V2 scoring pipeline over 90 trading days for the NASDAQ
// universe and persists Symbol, ScoreSnapshot, Coefficient, NewsItem, TrainingRun.
// Idempotent: skips if symbols already exist.

import { db } from "@/lib/db";
import { SEED_TICKERS_DEDUP } from "./universe";
import {
  generateDay,
  newGenState,
  tradingDays,
} from "./generator";
import { scoreMarket, type CoefficientLookup } from "../engine";
import { learnCoefficients, type TrainingSample } from "../learner";
import { METRIC_UNIVERSE, DIMENSION_KEYS, SUB_DIMENSIONS } from "../metric-universe";

const HISTORY_DAYS = 90;

export interface SeedResult {
  symbols: number;
  snapshots: number;
  coefficients: number;
  news: number;
  trainingRuns: number;
  elapsedMs: number;
}

export async function seedIfNeeded(force = false): Promise<SeedResult> {
  const t0 = Date.now();
  const existing = await db.symbol.count();
  if (existing > 0 && !force) {
    return {
      symbols: existing,
      snapshots: await db.scoreSnapshot.count(),
      coefficients: await db.coefficient.count(),
      news: await db.newsItem.count(),
      trainingRuns: await db.trainingRun.count(),
      elapsedMs: Date.now() - t0,
    };
  }

  if (force) {
    await db.newsItemSymbol.deleteMany();
    await db.newsItem.deleteMany();
    await db.trainingRun.deleteMany();
    await db.alert.deleteMany();
    await db.watchlistEntry.deleteMany();
    await db.watchlist.deleteMany();
    await db.coefficient.deleteMany();
    await db.scoreSnapshot.deleteMany();
    await db.symbol.deleteMany();
  }

  // 1. Persist universe
  await db.symbol.createMany({
    data: SEED_TICKERS_DEDUP.map((t) => ({
      ticker: t.ticker,
      name: t.name,
      exchange: "NASDAQ",
      sector: t.sector,
      industry: t.industry,
      marketCap: t.marketCap * 1e9,
      isEtf: t.isEtf,
    })),
  });

  // 2. Generate day-by-day metrics + scores
  const days = tradingDays(HISTORY_DAYS);
  const state = newGenState();
  const allSnapshots: HierarchicalSnapshotRow[] = [];
  // Accumulate training samples as we go (purged walk-forward, 5-day gap).
  // By day ~55 we have 50 samples → per-symbol ML weights kick in.
  const trainingSamplesByTicker: Record<string, TrainingSample[]> = {};
  const recentOverallsByTicker: Record<string, number[]> = {};
  // Per-ticker price history (for forward returns)
  const priceHistory: Record<string, number[]> = {};
  // Track each ticker's sub-aspect scores by day to compute forward returns
  // once enough price history is available.
  const pendingLabels: Record<
    string,
    Array<{ dayIdx: number; subAspectScores: Record<string, number>; dimensionScores: Record<string, number>; priceAtLabel: number }>
  > = {};

  for (let i = 0; i < days.length; i++) {
    const day = generateDay(state, i);
    const capturedAt = days[i].toISOString();
    // Build coefficient lookup from current training state (per-symbol).
    const coeffs: Record<string, CoefficientLookup | null> = {};
    for (const t of SEED_TICKERS_DEDUP) {
      const samples = trainingSamplesByTicker[t.ticker] ?? [];
      if (samples.length >= 50) {
        const learned = learnCoefficients(t.ticker, samples);
        coeffs[t.ticker] = {
          dimensions: learned.dimensions,
          sub_dimensions: learned.sub_dimensions,
          aspects: learned.aspects,
          sub_aspects: learned.sub_aspects,
          version: learned.version,
        };
      } else {
        coeffs[t.ticker] = null; // cold-start uniform fallback in engine
      }
    }

    const snapshots = scoreMarket({
      assetMetrics: day.assetMetrics,
      coefficients: coeffs,
      capturedAt,
      recentOveralls: recentOverallsByTicker,
      prices: Object.fromEntries(
        SEED_TICKERS_DEDUP.map((t) => [
          t.ticker,
          {
            price: day.prices[t.ticker].close,
            priceChange: day.prices[t.ticker].priceChange,
            volume: day.prices[t.ticker].volume,
          },
        ])
      ),
    });

    for (const s of snapshots) {
      recentOverallsByTicker[s.ticker] = (
        recentOverallsByTicker[s.ticker] ?? []
      )
        .concat(s.overall)
        .slice(-5);
      const subAspectScores = JSON.parse(JSON.stringify(s.subAspectScores));
      const dimensionScores = JSON.parse(JSON.stringify(s.dimensionScores));
      const row: HierarchicalSnapshotRow = {
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
        dataQuality: s.dataQuality,
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
      // Resolve any pending label whose 5-day-forward price is now available
      const ph = priceHistory[s.ticker];
      const resolved = pendingLabels[s.ticker].filter(
        (p) => p.dayIdx <= i - 5
      );
      for (const p of resolved) {
        const fwdPrice = ph[p.dayIdx + 5];
        if (fwdPrice !== undefined) {
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
  }

  // After the loop, the LAST day's snapshots used coefficients trained on
  // samples up to day (lastDay-5). The Coefficient table stores the final
  // per-symbol coefficients trained on ALL available samples (for UI display).
  const coefficientRows: CoefficientRow[] = [];
  const trainingRuns: TrainingRunRow[] = [];
  for (const t of SEED_TICKERS_DEDUP) {
    const samples = trainingSamplesByTicker[t.ticker] ?? [];
    const learned = learnCoefficients(t.ticker, samples);
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
        ticker: t.ticker,
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
        meta: JSON.stringify({ coldStart: learned.coldStart, regime: learned.regime }),
      });
    }
    trainingRuns.push({
      ticker: t.ticker,
      level: "ALL",
      startedAt: ts,
      durationMs: 100 + Math.floor(Math.random() * 400),
      sampleCount: learned.sampleCount,
      oosR2: learned.oosR2,
      oosIc: learned.oosIc,
      driftPsi: learned.coldStart ? 0 : Math.random() * 0.3,
      regime: learned.regime,
      status: learned.coldStart ? "fallback_uniform" : "success",
      version: learned.version,
      notes: learned.coldStart ? "insufficient samples (<50)" : null,
    });
  }

  // 5. Bulk persist snapshots (batch in chunks to avoid SQLite param limits)
  const CHUNK = 200;
  for (let i = 0; i < allSnapshots.length; i += CHUNK) {
    await db.scoreSnapshot.createMany({
      data: allSnapshots.slice(i, i + CHUNK).map((r) => ({
        ...r,
        signals: r.signals,
        dimensionScores: r.dimensionScores,
        subDimensionScores: r.subDimensionScores,
        aspectScores: r.aspectScores,
        subAspectScores: r.subAspectScores,
      })),
    });
  }

  // 6. Persist coefficients
  for (let i = 0; i < coefficientRows.length; i += CHUNK) {
    await db.coefficient.createMany({
      data: coefficientRows.slice(i, i + CHUNK),
    });
  }

  // 7. Training runs
  await db.trainingRun.createMany({ data: trainingRuns });

  // 8. News items
  const news = generateNews(days);
  for (const n of news) {
    const created = await db.newsItem.create({
      data: {
        headline: n.headline,
        source: n.source,
        url: n.url,
        publishedAt: n.publishedAt,
        sentiment: n.sentiment,
        severity: n.severity,
        tickers: {
          create: n.tickers.map((t) => ({ ticker: t })),
        },
      },
    });
    void created;
  }

  return {
    symbols: SEED_TICKERS_DEDUP.length,
    snapshots: allSnapshots.length,
    coefficients: coefficientRows.length,
    news: news.length,
    trainingRuns: trainingRuns.length,
    elapsedMs: Date.now() - t0,
  };
}

interface HierarchicalSnapshotRow {
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

function generateNews(days: Date[]) {
  const headlines = [
    { h: "Fed holds rates steady; signals patience on cuts", s: "Reuters", sent: "neutral", sev: "critical", tickers: ["QQQ", "SPY", "TLT"] },
    { h: "NVIDIA beats Q3 estimates; data center revenue up 112% YoY", s: "Bloomberg", sent: "bullish", sev: "critical", tickers: ["NVDA", "AMD", "AVGO", "ARM"] },
    { h: "Apple unveils new AI-powered iPhone lineup", s: "CNBC", sent: "bullish", sev: "notable", tickers: ["AAPL", "AVGO", "QCOM"] },
    { h: "Microsoft Azure cloud growth accelerates to 33%", s: "Bloomberg", sent: "bullish", sev: "notable", tickers: ["MSFT", "ANET"] },
    { h: "CPI comes in cooler than expected at 2.4% YoY", s: "Reuters", sent: "bullish", sev: "critical", tickers: ["QQQ", "SPY", "GLD"] },
    { h: "Tesla deliveries miss estimates; shares slide 5%", s: "CNBC", sent: "bearish", sev: "critical", tickers: ["TSLA"] },
    { h: "Semiconductor sector rallies on AI capex outlook", s: "Bloomberg", sent: "bullish", sev: "notable", tickers: ["NVDA", "AMD", "AVGO", "ASML", "MRVL", "NXPI"] },
    { h: "Alphabet launches new Gemini model; ad revenue beats", s: "Reuters", sent: "bullish", sev: "notable", tickers: ["GOOGL", "GOOG"] },
    { h: "Amazon AWS reaccelerates; retail margin expands", s: "CNBC", sent: "bullish", sev: "notable", tickers: ["AMZN"] },
    { h: "Meta Reality Labs loss narrows; ad impressions up 12%", s: "Bloomberg", sent: "bullish", sev: "notable", tickers: ["META"] },
    { h: "Oil prices spike 4% on OPEC+ supply cut extension", s: "Reuters", sent: "bearish", sev: "critical", tickers: ["USO", "XLE"] },
    { h: "Gold hits record high on geopolitical tensions", s: "Bloomberg", sent: "neutral", sev: "notable", tickers: ["GLD"] },
    { h: "Dollar index weakens; euro strengthens", s: "Reuters", sent: "neutral", sev: "informational", tickers: ["TLT", "GLD"] },
    { h: "Netflix ad-tier subscribers cross 80M", s: "CNBC", sent: "bullish", sev: "notable", tickers: ["NFLX"] },
    { h: "Broadcom guidance raises AI revenue forecast to $12B", s: "Bloomberg", sent: "bullish", sev: "critical", tickers: ["AVGO", "NVDA", "AMD"] },
    { h: "Costco same-store sales beat; traffic up 7%", s: "Reuters", sent: "bullish", sev: "notable", tickers: ["COST"] },
    { h: "AMD MI400 roadmap impresses at analyst day", s: "CNBC", sent: "bullish", sev: "notable", tickers: ["AMD", "NVDA"] },
    { h: "Nonfarm payrolls disappoint at 142K; unemployment ticks up", s: "Bloomberg", sent: "bearish", sev: "critical", tickers: ["QQQ", "SPY", "TLT"] },
    { h: "CrowdStrike outage report highlights platform risks", s: "Reuters", sent: "bearish", sev: "notable", tickers: ["CRWD", "PANW", "FTNT"] },
    { h: "DoorDash gross order value grows 24%", s: "CNBC", sent: "bullish", sev: "notable", tickers: ["DASH", "UBER"] },
    { h: "Palantir wins $480M DoD contract extension", s: "Bloomberg", sent: "bullish", sev: "critical", tickers: ["PLTR"] },
    { h: "Shopify gross merchandise volume beats", s: "Reuters", sent: "bullish", sev: "notable", tickers: ["SHOP"] },
    { h: "Snowflake product revenue accelerates to 30%", s: "CNBC", sent: "bullish", sev: "notable", tickers: ["SNOW", "DDOG", "MDB", "NET"] },
    { h: "Bitcoin reclaims $70K; Coinbase volume surges", s: "Bloomberg", sent: "bullish", sev: "notable", tickers: ["COIN", "MSTR"] },
    { h: "Tesla robotaxi unveiling set for August", s: "Reuters", sent: "bullish", sev: "critical", tickers: ["TSLA"] },
    { h: "Moderna COVID franchise guidance lowered", s: "CNBC", sent: "bearish", sev: "notable", tickers: ["MRNA", "BNTX"] },
    { h: "ASML book-to-bill exceeds 1.5; EUV demand strong", s: "Bloomberg", sent: "bullish", sev: "critical", tickers: ["ASML", "AMAT", "LRCX", "KLAC"] },
    { h: "Starbucks Q4 same-store sales miss; CEO change", s: "Reuters", sent: "bearish", sev: "notable", tickers: ["SBUX"] },
    { h: "Honeywell reiterates guidance; aerospace strong", s: "CNBC", sent: "bullish", sev: "informational", tickers: ["HON"] },
    { h: "Intel foundry losses widen; strategic review launched", s: "Bloomberg", sent: "bearish", sev: "critical", tickers: ["INTC", "AMD", "NVDA"] },
  ];
  const out: Array<{
    headline: string;
    source: string;
    url: string;
    publishedAt: Date;
    sentiment: string;
    severity: string;
    tickers: string[];
  }> = [];
  // Distribute headlines across recent days; repeat some with date offsets.
  let i = 0;
  for (let d = Math.max(0, days.length - 30); d < days.length; d++) {
    const base = headlines[i % headlines.length];
    const publishedAt = new Date(days[d].getTime() + (i % 6) * 3600_000);
    out.push({
      headline: base.h,
      source: base.s,
      url: `https://example.com/news/${i}`,
      publishedAt,
      sentiment: base.sent,
      severity: base.sev,
      tickers: base.tickers.filter((tk) =>
        SEED_TICKERS_DEDUP.some((s) => s.ticker === tk)
      ),
    });
    i++;
    if (out.length >= 60) break;
  }
  return out;
}

// Export DIMENSION_KEYS for clarity
export { DIMENSION_KEYS, SUB_DIMENSIONS, METRIC_UNIVERSE };
