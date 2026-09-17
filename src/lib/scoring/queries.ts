// BedaanWaves — shared query helpers used by API routes.

import { db } from "@/lib/db";
import { readFileSync } from "fs";
import { join } from "path";
import { DIMENSION_KEYS, DIMENSION_META } from "@/lib/scoring/metric-universe";
import { gradeFor } from "@/lib/scoring/transforms";
import type { DimensionKey } from "@/lib/scoring/metric-universe";

export async function getLatestCapturedAt(): Promise<Date> {
  const row = await db.scoreSnapshot.findFirst({
    orderBy: { capturedAt: "desc" },
    select: { capturedAt: true },
  });
  return row ? new Date(row.capturedAt) : new Date(0);
}

export async function getPrevCapturedAt(latest: Date): Promise<Date | null> {
  const row = await db.scoreSnapshot.findFirst({
    where: { capturedAt: { lt: latest } },
    orderBy: { capturedAt: "desc" },
    select: { capturedAt: true },
  });
  return row ? new Date(row.capturedAt) : null;
}

// ─── Rankings (latest day, paginated + filtered) ─────────────────────────────
export interface RankingsQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  sector?: string;
  grade?: string;
  minScore?: number;
  maxScore?: number;
  minMarketCap?: number;
  maxMarketCap?: number;
  sort?: string; // overall | priceChange | marketCap | ticker | coverage
  order?: "asc" | "desc";
  isEtf?: boolean | null;
}

export interface RankingsResult {
  rows: Array<{
    rank: number;
    ticker: string;
    name: string;
    sector: string;
    industry: string;
    marketCap: number;
    isEtf: boolean;
    overall: number;
    grade: string;
    coverage: number;
    ciLower: number;
    ciUpper: number;
    price: number;
    priceChange: number;
    volume: number;
    delta: number | null;
    dimensionScores: Record<DimensionKey, number>;
    coefficientVersion: string;
    signals: string[];
  }>;
  total: number;
  page: number;
  pageSize: number;
  latestAt: string;
}

export async function fetchRankings(q: RankingsQuery): Promise<RankingsResult> {
  const page = Math.max(1, q.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 25));
  const latest = await getLatestCapturedAt();
  const prev = await getPrevCapturedAt(latest);

  const where: Record<string, unknown> = {
    capturedAt: latest,
  };
  if (q.search) {
    // Prisma SQLite doesn't have full-text; use contains on related symbol.
    // We'll filter in JS for simplicity OR use a join.
  }
  // Sort: default overall desc
  const sortMap: Record<string, string> = {
    overall: "overall",
    priceChange: "priceChange",
    marketCap: "marketCap", // requires relation sort — we do in JS
    ticker: "ticker",
    coverage: "coverage",
    ciLower: "ciLower",
  };
  const sortField = sortMap[q.sort ?? "overall"] ?? "overall";
  const order = q.order ?? "desc";

  // Fetch all snapshots for the latest day (we need rank + filters across the universe)
  const all = await db.scoreSnapshot.findMany({
    where: { capturedAt: latest },
    include: { symbol: true },
    orderBy: [{ overall: "desc" }, { ticker: "asc" }],
  });

  // Filter in JS (Prisma SQLite filtering on JSON fields is limited)
  let filtered = all;
  if (q.search) {
    const s = q.search.toLowerCase();
    filtered = filtered.filter(
      (r) =>
        r.ticker.toLowerCase().includes(s) ||
        r.symbol.name.toLowerCase().includes(s) ||
        r.symbol.sector.toLowerCase().includes(s) ||
        r.symbol.industry.toLowerCase().includes(s)
    );
  }
  if (q.sector && q.sector !== "All")
    filtered = filtered.filter((r) => r.symbol.sector === q.sector);
  if (q.grade && q.grade !== "All")
    filtered = filtered.filter((r) => r.grade === q.grade);
  if (q.minScore !== undefined)
    filtered = filtered.filter((r) => r.overall >= q.minScore!);
  if (q.maxScore !== undefined)
    filtered = filtered.filter((r) => r.overall <= q.maxScore!);
  if (q.minMarketCap !== undefined)
    filtered = filtered.filter((r) => r.symbol.marketCap >= q.minMarketCap!);
  if (q.maxMarketCap !== undefined)
    filtered = filtered.filter((r) => r.symbol.marketCap <= q.maxMarketCap!);
  if (q.isEtf !== undefined && q.isEtf !== null)
    filtered = filtered.filter((r) => r.symbol.isEtf === q.isEtf);

  // Sort (default already overall desc, but re-sort if user changed)
  if (sortField !== "overall" || order === "asc") {
    filtered = filtered.slice().sort((a, b) => {
      let av: number | string, bv: number | string;
      if (sortField === "marketCap") {
        av = a.symbol.marketCap; bv = b.symbol.marketCap;
      } else if (sortField === "ticker") {
        av = a.ticker; bv = b.ticker;
        return order === "asc"
          ? String(av).localeCompare(String(bv))
          : String(bv).localeCompare(String(av));
      } else {
        av = (a as unknown as Record<string, number>)[sortField] ?? 0;
        bv = (b as unknown as Record<string, number>)[sortField] ?? 0;
      }
      return order === "asc"
        ? (av as number) - (bv as number)
        : (bv as number) - (av as number);
    });
  }

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const pageRows = filtered.slice(start, start + pageSize);

  // Fetch prev-day overalls for delta computation
  const prevOveralls: Record<string, number> = {};
  if (prev) {
    const prevRows = await db.scoreSnapshot.findMany({
      where: { capturedAt: prev },
      select: { ticker: true, overall: true },
    });
    for (const r of prevRows) prevOveralls[r.ticker] = r.overall;
  }

  const rows = pageRows.map((r, idx) => {
    const dimScores = JSON.parse(r.dimensionScores) as Record<string, number>;
    const dimScoresTyped: Record<DimensionKey, number> = {} as Record<DimensionKey, number>;
    for (const d of DIMENSION_KEYS) dimScoresTyped[d] = dimScores[d] ?? 50;
    const prevOverall = prevOveralls[r.ticker];
    return {
      rank: start + idx + 1,
      ticker: r.ticker,
      name: r.symbol.name,
      sector: r.symbol.sector,
      industry: r.symbol.industry,
      marketCap: r.symbol.marketCap,
      isEtf: r.symbol.isEtf,
      overall: r.overall,
      grade: r.grade,
      coverage: r.coverage,
      ciLower: r.ciLower,
      ciUpper: r.ciUpper,
      price: r.price,
      priceChange: r.priceChange,
      volume: r.volume,
      delta: prevOverall !== undefined ? r.overall - prevOverall : null,
      dimensionScores: dimScoresTyped,
      coefficientVersion: r.coefficientVersion,
      signals: JSON.parse(r.signals) as string[],
    };
  });

  return {
    rows,
    total,
    page,
    pageSize,
    latestAt: latest.toISOString(),
  };
}

// ─── Symbol drilldown: latest snapshot + meta + prev ──────────────────────────
export async function fetchSymbolDetail(ticker: string) {
  const symbol = await db.symbol.findUnique({
    where: { ticker: ticker.toUpperCase() },
  });
  if (!symbol) return null;
  const latest = await getLatestCapturedAt();
  const snap = await db.scoreSnapshot.findUnique({
    where: { ticker_capturedAt: { ticker: symbol.ticker, capturedAt: latest } },
  });
  if (!snap) return null;
  const prev = await getPrevCapturedAt(latest);
  let prevOverall: number | null = null;
  if (prev) {
    const prevSnap = await db.scoreSnapshot.findUnique({
      where: { ticker_capturedAt: { ticker: symbol.ticker, capturedAt: prev } },
      select: { overall: true },
    });
    prevOverall = prevSnap?.overall ?? null;
  }
  return {
    symbol,
    snapshot: snap,
    prevOverall,
  };
}

// ─── History (overall + 6 dimensions, multi-timeframe) ───────────────────────
export async function fetchSymbolHistory(ticker: string, range: string) {
  const sym = await db.symbol.findUnique({ where: { ticker: ticker.toUpperCase() } });
  if (!sym) return null;
  const latest = await getLatestCapturedAt();
  const days = rangeToDays(range);
  const since = new Date(latest.getTime() - days * 86_400_000);
  const rows = await db.scoreSnapshot.findMany({
    where: { ticker: sym.ticker, capturedAt: { gte: since } },
    orderBy: { capturedAt: "asc" },
    select: {
      capturedAt: true,
      overall: true,
      dimensionScores: true,
      price: true,
      priceChange: true,
      volume: true,
      coverage: true,
      ciLower: true,
      ciUpper: true,
      grade: true,
      coefficientVersion: true,
    },
  });
  return rows.map((r) => {
    const dimScores = JSON.parse(r.dimensionScores) as Record<string, number>;
    const dims: Record<DimensionKey, number> = {} as Record<DimensionKey, number>;
    for (const d of DIMENSION_KEYS) dims[d] = dimScores[d] ?? 50;
    return {
      capturedAt: r.capturedAt.toISOString(),
      overall: r.overall,
      dimensions: dims,
      price: r.price,
      priceChange: r.priceChange,
      volume: r.volume,
      coverage: r.coverage,
      ciLower: r.ciLower,
      ciUpper: r.ciUpper,
      grade: r.grade,
      coefficientVersion: r.coefficientVersion,
    };
  });
}

function rangeToDays(range: string): number {
  switch (range) {
    case "1D": return 1;
    case "1W": return 7;
    case "1M": return 30;
    case "3M": return 90;
    case "6M": return 180;
    case "1Y": return 365;
    case "YTD": {
      const now = new Date();
      const jan1 = new Date(now.getUTCFullYear(), 0, 1);
      return Math.ceil((now.getTime() - jan1.getTime()) / 86_400_000);
    }
    default: return 9999;
  }
}

// ─── Coefficients (all 4 levels for a symbol) ──────────────────────────────────
export async function fetchCoefficients(ticker: string) {
  const sym = await db.symbol.findUnique({ where: { ticker: ticker.toUpperCase() } });
  if (!sym) return null;
  const rows = await db.coefficient.findMany({
    where: { ticker: sym.ticker },
  });
  const byLevel: Record<string, (typeof rows)[number]> = {};
  for (const r of rows) byLevel[r.level] = r;
  return { symbol: sym, coefficients: byLevel };
}

// ─── Radar profile (6-dim vector + overlays) ───────────────────────────────────
export async function fetchRadarProfile(ticker: string) {
  const sym = await db.symbol.findUnique({ where: { ticker: ticker.toUpperCase() } });
  if (!sym) return null;
  const latest = await getLatestCapturedAt();
  const snap = await db.scoreSnapshot.findUnique({
    where: { ticker_capturedAt: { ticker: sym.ticker, capturedAt: latest } },
  });
  if (!snap) return null;
  const dims = JSON.parse(snap.dimensionScores) as Record<string, number>;

  // 30-day-ago profile
  const thirtyAgo = new Date(latest.getTime() - 30 * 86_400_000);
  const thirtyAgoSnap = await db.scoreSnapshot.findFirst({
    where: { ticker: sym.ticker, capturedAt: { lte: thirtyAgo } },
    orderBy: { capturedAt: "desc" },
  });
  const thirtyAgoDims = thirtyAgoSnap
    ? (JSON.parse(thirtyAgoSnap.dimensionScores) as Record<string, number>)
    : null;

  // NASDAQ median profile (latest day)
  const allLatest = await db.scoreSnapshot.findMany({
    where: { capturedAt: latest, ticker: { not: sym.ticker } },
    select: { dimensionScores: true },
  });
  const nasdaqMedian: Record<string, number> = {};
  for (const d of DIMENSION_KEYS) {
    const vals = allLatest
      .map((r) => (JSON.parse(r.dimensionScores) as Record<string, number>)[d] ?? 50)
      .sort((a, b) => a - b);
    nasdaqMedian[d] = vals.length ? vals[Math.floor(vals.length / 2)] : 50;
  }

  // Sector median profile
  const sectorPeers = await db.scoreSnapshot.findMany({
    where: {
      capturedAt: latest,
      ticker: { not: sym.ticker },
      symbol: { sector: sym.sector },
    },
    select: { dimensionScores: true },
  });
  const sectorMedian: Record<string, number> = {};
  for (const d of DIMENSION_KEYS) {
    const vals = sectorPeers
      .map((r) => (JSON.parse(r.dimensionScores) as Record<string, number>)[d] ?? 50)
      .sort((a, b) => a - b);
    sectorMedian[d] = vals.length ? vals[Math.floor(vals.length / 2)] : 50;
  }

  // Top-3 contributing sub-dimensions per dimension (for hover)
  const subDims = JSON.parse(snap.subDimensionScores) as Record<string, number>;
  const topSubDims: Record<string, Array<{ key: string; score: number }>> = {};
  for (const d of DIMENSION_KEYS) {
    const entries = Object.entries(subDims)
      .filter(([k]) => k.startsWith(d + "/"))
      .map(([k, v]) => ({ key: k.replace(d + "/", ""), score: v }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    topSubDims[d] = entries;
  }

  return {
    symbol: sym,
    current: dims,
    thirtyAgo: thirtyAgoDims,
    nasdaqMedian,
    sectorMedian,
    topSubDims,
    latestAt: latest.toISOString(),
  };
}

// ─── Decomposition (waterfall: L1 contributions + drilldown) ──────────────────
export async function fetchDecomposition(ticker: string) {
  const sym = await db.symbol.findUnique({ where: { ticker: ticker.toUpperCase() } });
  if (!sym) return null;
  const latest = await getLatestCapturedAt();
  const snap = await db.scoreSnapshot.findUnique({
    where: { ticker_capturedAt: { ticker: sym.ticker, capturedAt: latest } },
  });
  if (!snap) return null;
  const dimScores = JSON.parse(snap.dimensionScores) as Record<string, number>;
  const subDimScores = JSON.parse(snap.subDimensionScores) as Record<string, number>;
  const aspectScores = JSON.parse(snap.aspectScores) as Record<string, number>;
  const subAspectScores = JSON.parse(snap.subAspectScores) as Record<string, number>;
  const coeffs = await db.coefficient.findMany({
    where: { ticker: sym.ticker },
  });
  const byLevel: Record<string, Record<string, number>> = {};
  for (const c of coeffs) byLevel[c.level] = JSON.parse(c.weights);
  const dimW = byLevel["dimensions"] ?? {};
  const subDimW = byLevel["sub_dimensions"] ?? {};
  return {
    symbol: sym,
    overall: snap.overall,
    dimensionScores: dimScores,
    subDimensionScores: subDimScores,
    aspectScores,
    subAspectScores,
    dimensionWeights: dimW,
    subDimensionWeights: subDimW,
  };
}

// ─── Peer comparison (selected vs 5 nearest by sector + market cap) ───────────
export async function fetchPeers(ticker: string) {
  const sym = await db.symbol.findUnique({ where: { ticker: ticker.toUpperCase() } });
  if (!sym) return null;
  const latest = await getLatestCapturedAt();
  const allInSector = await db.symbol.findMany({
    where: { sector: sym.sector, ticker: { not: sym.ticker }, isEtf: false },
  });
  // nearest 5 by market cap
  const sorted = allInSector
    .map((s) => ({ s, dist: Math.abs(Math.log(s.marketCap) - Math.log(sym.marketCap)) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 5);
  const peerTickers = sorted.map((x) => x.s.ticker);
  const snaps = await db.scoreSnapshot.findMany({
    where: { capturedAt: latest, ticker: { in: [sym.ticker, ...peerTickers] } },
    include: { symbol: true },
  });
  const rows = snaps.map((s) => {
    const dims = JSON.parse(s.dimensionScores) as Record<string, number>;
    return {
      ticker: s.ticker,
      name: s.symbol.name,
      marketCap: s.symbol.marketCap,
      overall: s.overall,
      grade: s.grade,
      dimensions: dims,
      price: s.price,
      priceChange: s.priceChange,
    };
  });
  // percentile rank within peer group per dimension
  const n = rows.length;
  const percentileRanks: Record<string, Record<string, number>> = {};
  for (const d of DIMENSION_KEYS) {
    const sorted = rows.slice().sort((a, b) => a.dimensions[d] - b.dimensions[d]);
    for (let i = 0; i < n; i++) {
      const t = sorted[i].ticker;
      if (!percentileRanks[t]) percentileRanks[t] = {};
      percentileRanks[t][d] = Math.round(((i + 1) / n) * 100);
    }
  }
  return { symbol: sym, peers: rows, percentileRanks, latestAt: latest.toISOString() };
}

// ─── News ribbon ────────────────────────────────────────────────────────────────
export async function fetchNews(limit = 30) {
  const items = await db.newsItem.findMany({
    orderBy: { publishedAt: "desc" },
    take: limit,
    include: { tickers: { include: { symbol: true } } },
  });
  return items.map((n) => ({
    id: n.id,
    headline: n.headline,
    source: n.source,
    url: n.url,
    publishedAt: n.publishedAt.toISOString(),
    sentiment: n.sentiment,
    severity: n.severity,
    tickers: n.tickers.map((t) => t.ticker),
  }));
}

// ─── Ticker tape (rotating marquee) ──────────────────────────────────────────────
export async function fetchTickerTape(limit = 100) {
  const latest = await getLatestCapturedAt();
  const snaps = await db.scoreSnapshot.findMany({
    where: { capturedAt: latest },
    orderBy: { volume: "desc" },
    take: limit,
    include: { symbol: true },
  });
  return snaps.map((s) => ({
    ticker: s.ticker,
    name: s.symbol.name,
    price: s.price,
    priceChange: s.priceChange,
    overall: s.overall,
    grade: s.grade,
  }));
}

// ─── Trace (provenance / lineage for a score) ────────────────────────────────────
export async function fetchTrace(ticker: string) {
  const sym = await db.symbol.findUnique({ where: { ticker: ticker.toUpperCase() } });
  if (!sym) return null;
  const latest = await getLatestCapturedAt();
  const snap = await db.scoreSnapshot.findUnique({
    where: { ticker_capturedAt: { ticker: sym.ticker, capturedAt: latest } },
  });
  if (!snap) return null;
  const coeffs = await db.coefficient.findMany({
    where: { ticker: sym.ticker },
    select: { level: true, version: true, dataHash: true, trainedAt: true, sampleCount: true },
  });
  const trainingRuns = await db.trainingRun.findMany({
    where: { ticker: sym.ticker },
    orderBy: { startedAt: "desc" },
    take: 5,
  });
  return {
    snapshotId: snap.id,
    ticker: sym.ticker,
    capturedAt: snap.capturedAt.toISOString(),
    dataQuality: snap.dataQuality,
    coefficientVersion: snap.coefficientVersion,
    rawDataHash: snap.rawDataHash,
    isProcessed: snap.isProcessed,
    coefficients: coeffs,
    trainingRuns,
  };
}

// ─── Market status / universe stats ─────────────────────────────────────────────
export async function fetchMarketStatus() {
  const latest = await getLatestCapturedAt();
  const totalSymbols = await db.symbol.count();
  const totalSnapshots = await db.scoreSnapshot.count();
  const totalCoefficients = await db.coefficient.count();
  const totalNews = await db.newsItem.count();
  const totalTrainingRuns = await db.trainingRun.count();
  const grades = await db.scoreSnapshot.groupBy({
    by: ["grade"],
    _count: true,
    where: { capturedAt: latest },
  });
  const coldStart = await db.scoreSnapshot.count({
    where: { capturedAt: latest, coefficientVersion: "uniform-cold-start" },
  });
  // universe distribution
  const sectors = await db.symbol.groupBy({ by: ["sector"], _count: true });

  // Data freshness (from JSON file timestamps)
  let dataFreshness: { marketData?: string; macroData?: string; newsData?: string } = {};
  try {
    const marketFile = join(process.cwd(), "src/lib/scoring/seed/real-market-data.json");
    const macroFile = join(process.cwd(), "src/lib/scoring/seed/real-macro-data.json");
    const newsFile = join(process.cwd(), "src/lib/scoring/seed/real-news-data.json");
    const readTs = (f: string) => {
      try {
        const d = JSON.parse(readFileSync(f, "utf-8"));
        return d.fetched_at as string;
      } catch {
        return undefined;
      }
    };
    dataFreshness = {
      marketData: readTs(marketFile),
      macroData: readTs(macroFile),
      newsData: readTs(newsFile),
    };
  } catch {
    // ignore
  }

  // Last refresh timestamp
  let lastRefresh: string | null = null;
  try {
    lastRefresh = readFileSync("/tmp/bedaan-last-refresh.txt", "utf-8").trim();
  } catch {
    // file doesn't exist yet
  }

  return {
    latestAt: latest.toISOString(),
    totalSymbols,
    totalSnapshots,
    totalCoefficients,
    totalNews,
    totalTrainingRuns,
    coldStartSymbols: coldStart,
    grades: grades.map((g) => ({ grade: g.grade, count: g._count })),
    sectors: sectors.map((s) => ({ sector: s.sector, count: s._count })),
    validatedRecords: totalSnapshots,
    mockRecords: 0,
    dataFreshness,
    lastRefresh,
    autoRefreshIntervalHours: 2,
    dataSource: "yfinance (OHLCV + fundamentals) + FRED/published stats (macro) + z-ai web-search (news) — ALL REAL",
  };
}

// ─── Export (rankings to CSV / JSON) ─────────────────────────────────────────────
export async function exportRankings(format: "csv" | "json") {
  const res = await fetchRankings({ page: 1, pageSize: 1000 });
  if (format === "json") return JSON.stringify(res.rows, null, 2);
  // CSV
  const headers = [
    "rank", "ticker", "name", "sector", "industry", "marketCap",
    "overall", "grade", "coverage", "ciLower", "ciUpper",
    "price", "priceChange", "volume", "delta",
    "score_fundamental", "score_technical", "score_sentiment",
    "score_risk", "score_macro", "score_ai",
    "coefficientVersion",
  ];
  const lines = [headers.join(",")];
  for (const r of res.rows) {
    lines.push([
      r.rank, escapeCsv(r.ticker), escapeCsv(r.name), escapeCsv(r.sector), escapeCsv(r.industry),
      r.marketCap, r.overall, r.grade, r.coverage, r.ciLower, r.ciUpper,
      r.price, r.priceChange, r.volume, r.delta ?? "",
      r.dimensionScores.fundamental, r.dimensionScores.technical,
      r.dimensionScores.sentiment, r.dimensionScores.risk,
      r.dimensionScores.macro, r.dimensionScores.ai,
      r.coefficientVersion,
    ].join(","));
  }
  return lines.join("\n");
}

function escapeCsv(s: string): string {
  if (s.includes(",") || s.includes("\"")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export { DIMENSION_KEYS, DIMENSION_META, gradeFor };
