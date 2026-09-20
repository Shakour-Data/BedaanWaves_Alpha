// BedaanWaves — shared query helpers used by API routes.

import { db } from "@/lib/db";
import { readFileSync } from "fs";
import { join } from "path";
import { DIMENSION_KEYS, DIMENSION_META } from "@/lib/scoring/metric-universe";
import { gradeFor } from "@/lib/scoring/transforms";
import type { DimensionKey } from "@/lib/scoring/metric-universe";

export async function getLatestCapturedAt(generationId?: string): Promise<Date> {
  const row = await db.scoreSnapshot.findFirst({
    where: generationId ? { generationId } : undefined,
    orderBy: { capturedAt: "desc" },
    select: { capturedAt: true },
  });
  return row ? new Date(row.capturedAt) : new Date(0);
}

export async function getLatestCapturedAtPerSymbol(ticker: string, generationId?: string): Promise<Date | null> {
  const row = await db.scoreSnapshot.findFirst({
    where: {
      ticker,
      ...(generationId ? { generationId } : {}),
    },
    orderBy: { capturedAt: "desc" },
    select: { capturedAt: true },
  });
  return row ? new Date(row.capturedAt) : null;
}

export async function getSuccessfulGenerations(): Promise<string[]> {
  // Include PARTIAL batches — they contain successfully trained symbols
  // (e.g. BATCH-1: 84 COEFFICIENTS_TRAINED, 12 delisted, 4 insufficient).
  const generations = await db.batchManifest.findMany({
    where: { status: { in: ["COMPLETED", "PARTIAL"] } },
    select: { generationId: true },
    distinct: ["generationId"],
    orderBy: { completedAt: "desc" },
  });
  return generations.map((g) => g.generationId).filter((g): g is string => g !== null);
}

export async function getPrevCapturedAt(latest: Date): Promise<Date | null> {
  const row = await db.scoreSnapshot.findFirst({
    where: { capturedAt: { lt: latest } },
    orderBy: { capturedAt: "desc" },
    select: { capturedAt: true },
  });
  return row ? new Date(row.capturedAt) : null;
}

export async function getPrevCapturedAtPerSymbol(ticker: string, latest: Date, generationId?: string): Promise<Date | null> {
  const row = await db.scoreSnapshot.findFirst({
    where: {
      ticker,
      capturedAt: { lt: latest },
      ...(generationId ? { generationId } : {}),
    },
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
  sort?: string;
  order?: "asc" | "desc";
  isEtf?: boolean | null;
  columnFilters?: RankingColumnFilter[];
  generationId?: string;
  processingStatus?: string;
}

export type RankingColumnKey =
  | "rank"
  | "ticker"
  | "overall"
  | "delta"
  | "grade"
  | "price"
  | "priceChange"
  | "marketCap"
  | "coverage"
  | "processingStatus"
  | "batchId"
  | "generationId"
  | "dataQuality"
  | `dimension.${DimensionKey}`;

export type RankingFilterOperator =
  | "contains"
  | "notContains"
  | "equals"
  | "notEquals"
  | "startsWith"
  | "endsWith"
  | "greaterThan"
  | "lessThan"
  | "between"
  | "isNull"
  | "isNotNull";

export interface RankingColumnFilter {
  key: RankingColumnKey;
  operator: RankingFilterOperator;
  value?: string;
  value2?: string;
}

const RANKING_COLUMN_KEYS = [
  "rank",
  "ticker",
  "overall",
  "delta",
  "grade",
  "price",
  "priceChange",
  "marketCap",
  "coverage",
  "processingStatus",
  "batchId",
  "generationId",
  "dataQuality",
  ...DIMENSION_KEYS.map((dimension) => `dimension.${dimension}`),
];

const RANKING_FILTER_OPERATORS = [
  "contains",
  "notContains",
  "equals",
  "notEquals",
  "startsWith",
  "endsWith",
  "greaterThan",
  "lessThan",
  "between",
  "isNull",
  "isNotNull",
];

export function parseRankingColumnFilters(
  value: unknown,
): RankingColumnFilter[] | null {
  if (!Array.isArray(value)) return null;

  const filters: RankingColumnFilter[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const candidate = item as Record<string, unknown>;
    if (
      typeof candidate.key !== "string" ||
      !isRankingColumnKey(candidate.key) ||
      typeof candidate.operator !== "string" ||
      !isRankingFilterOperator(candidate.operator)
    ) {
      return null;
    }

    const filter: RankingColumnFilter = {
      key: candidate.key as RankingColumnKey,
      operator: candidate.operator as RankingFilterOperator,
    };
    if (typeof candidate.value === "string") filter.value = candidate.value;
    if (typeof candidate.value2 === "string") filter.value2 = candidate.value2;
    filters.push(filter);
  }
  return filters;
}

function isRankingColumnKey(value: string): value is RankingColumnKey {
  if (value.startsWith("dimension.")) {
    return DIMENSION_KEYS.includes(value.slice(10) as DimensionKey);
  }
  return RANKING_COLUMN_KEYS.includes(value);
}

function isRankingFilterOperator(value: string): value is RankingFilterOperator {
  return RANKING_FILTER_OPERATORS.includes(value);
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
    processingStatus: string | null;
    batchId: string | null;
    generationId: string | null;
    dataQuality: string | null;
  }>;
  total: number;
  page: number;
  pageSize: number;
  latestAt: string;
  generationId: string | null;
}

type RankingRecord = {
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
  processingStatus: string | null;
  batchId: string | null;
  generationId: string | null;
  dataQuality: string | null;
  rank?: number;
};

const RANKING_SORT_KEYS: RankingColumnKey[] = [
  "rank",
  "ticker",
  "overall",
  "delta",
  "grade",
  "price",
  "priceChange",
  "marketCap",
  "coverage",
  "processingStatus",
  "batchId",
  "generationId",
  "dataQuality",
  ...DIMENSION_KEYS.map(
    (dimension) => `dimension.${dimension}` as `dimension.${DimensionKey}`,
  ),
];

const GRADE_ORDER: Record<string, number> = {
  STRONG_BULLISH: 0,
  BULLISH: 1,
  NEUTRAL: 2,
  BEARISH: 3,
  STRONG_BEARISH: 4,
};

function getRankingValue(
  record: RankingRecord,
  key: RankingColumnKey,
): string | number | null {
  if (key === "rank") return record.rank ?? record.overall;
  if (key === "ticker") return record.ticker;
  if (key === "grade") return record.grade;
  if (key === "marketCap") return record.marketCap;
  if (key === "coverage") return record.coverage;
  if (key.startsWith("dimension.")) {
    return record.dimensionScores[key.slice(10) as DimensionKey] ?? 50;
  }
  return (record[key as keyof RankingRecord] as string | number | null) ?? null;
}

function getSortValue(
  record: RankingRecord,
  key: RankingColumnKey,
): string | number | null {
  if (key === "grade") return GRADE_ORDER[record.grade] ?? 99;
  return getRankingValue(record, key);
}

function matchesColumnFilter(
  record: RankingRecord,
  filter: RankingColumnFilter,
): boolean {
  const value = getRankingValue(record, filter.key);
  if (filter.operator === "isNull") return value === null || value === undefined;
  if (filter.operator === "isNotNull") return value !== null && value !== undefined;

  if (typeof value === "string") {
    const actual = value.toLowerCase();
    const expected = (filter.value ?? "").toLowerCase();
    switch (filter.operator) {
      case "contains":
        return actual.includes(expected);
      case "notContains":
        return !actual.includes(expected);
      case "equals":
        return actual === expected;
      case "notEquals":
        return actual !== expected;
      case "startsWith":
        return actual.startsWith(expected);
      case "endsWith":
        return actual.endsWith(expected);
      default:
        return false;
    }
  }

  const expected = Number(filter.value);
  if (!Number.isFinite(expected)) return false;
  switch (filter.operator) {
    case "equals":
      return value === expected;
    case "notEquals":
      return value !== expected;
    case "greaterThan":
      return value !== null && value > expected;
    case "lessThan":
      return value !== null && value < expected;
    case "between": {
      const upper = Number(filter.value2);
      return (
        Number.isFinite(upper) &&
        value !== null &&
        value >= expected &&
        value <= upper
      );
    }
    default:
      return false;
  }
}

function compareRankingRecords(
  a: RankingRecord,
  b: RankingRecord,
  sortField: RankingColumnKey,
  order: "asc" | "desc",
): number {
  if (sortField === "rank") {
    return compareRankingRecords(a, b, "overall", order === "asc" ? "desc" : "asc");
  }

  const av = getSortValue(a, sortField);
  const bv = getSortValue(b, sortField);
  if (av === null || av === undefined) return 1;
  if (bv === null || bv === undefined) return -1;

  let comparison: number;
  if (typeof av === "string" || typeof bv === "string") {
    comparison = String(av).localeCompare(String(bv));
  } else {
    comparison = Number(av) - Number(bv);
  }
  if (comparison !== 0) return order === "asc" ? comparison : -comparison;
  return a.ticker.localeCompare(b.ticker);
}

export async function fetchRankings(q: RankingsQuery): Promise<RankingsResult> {
  const page = Math.max(1, q.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 25));
  
  // Use all generations if not specified, so symbols from every ingested
  // batch (e.g. BATCH-1) appear in rankings, not just the latest one.
  const generationId =
    q.generationId && q.generationId !== "all" ? q.generationId : undefined;
  const latest = await getLatestCapturedAt(generationId);

  // Fetch latest + previous snapshot per ticker using select (not include)
  // to avoid loading large JSON fields (subAspectScores, aspectScores, etc.)
  // that overwhelm the Prisma query engine with 32K+ records.
  // We only need: overall (for delta), capturedAt, and ticker to deduplicate.
  const all = await db.scoreSnapshot.findMany({
    where: generationId ? { generationId } : undefined,
    select: {
      ticker: true,
      overall: true,
      capturedAt: true,
      symbol: {
        select: {
          name: true,
          sector: true,
          industry: true,
          marketCap: true,
          isEtf: true,
          processingStatus: true,
          batchId: true,
          generationId: true,
          dataQuality: true,
        },
      },
    },
    orderBy: [{ ticker: "asc" }, { capturedAt: "desc" }],
  });

  // Deduplicate: latest snapshot per ticker + previous overall for delta.
  let latestSnapshots: typeof all = [];
  const prevOveralls: Record<string, number> = {};
  const latestSeen = new Set<string>();
  for (const row of all) {
    if (latestSeen.has(row.ticker)) {
      if (!(row.ticker in prevOveralls)) {
        prevOveralls[row.ticker] = row.overall;
      }
      continue;
    }
    latestSeen.add(row.ticker);
    latestSnapshots.push(row);
  }

  // Filter by processingStatus if specified
  if (q.processingStatus) {
    latestSnapshots = latestSnapshots.filter((row) => row.symbol.processingStatus === q.processingStatus);
  }

  // Fetch remaining fields (dimensionScores, signals, etc.) only for the
  // latest snapshots we actually need, batched to avoid engine overload.
  // This two-step approach fetches ~590 records instead of 32K+.
  const tickerCaptured = latestSnapshots.map((r) => ({
    ticker: r.ticker,
    capturedAt: r.capturedAt,
  }));
  const detailRows = await db.scoreSnapshot.findMany({
    where: {
      OR: tickerCaptured.map((tc) => ({
        ticker: tc.ticker,
        capturedAt: tc.capturedAt,
      })),
    },
    select: {
      ticker: true,
      overall: true,
      grade: true,
      coverage: true,
      ciLower: true,
      ciUpper: true,
      price: true,
      priceChange: true,
      volume: true,
      dimensionScores: true,
      signals: true,
      coefficientVersion: true,
    },
    orderBy: { ticker: "asc" },
  });

  // Merge detail fields into latest snapshots by ticker
  const detailByTicker = new Map<string, typeof detailRows[number]>();
  for (const d of detailRows) detailByTicker.set(d.ticker, d);

  const records: RankingRecord[] = [];
  for (const row of latestSnapshots) {
    const detail = detailByTicker.get(row.ticker);
    if (!detail) continue;
    const dimensionScores = JSON.parse(detail.dimensionScores) as Record<string, number>;
    const typedDimensions = {} as Record<DimensionKey, number>;
    for (const dimension of DIMENSION_KEYS) {
      typedDimensions[dimension] = dimensionScores[dimension] ?? 50;
    }
    const previousOverall = prevOveralls[row.ticker];
    records.push({
      ticker: row.ticker,
      name: row.symbol.name,
      sector: row.symbol.sector,
      industry: row.symbol.industry,
      marketCap: row.symbol.marketCap,
      isEtf: row.symbol.isEtf,
      overall: row.overall,
      grade: detail.grade,
      coverage: detail.coverage,
      ciLower: detail.ciLower,
      ciUpper: detail.ciUpper,
      price: detail.price,
      priceChange: detail.priceChange,
      volume: detail.volume,
      delta: previousOverall !== undefined ? row.overall - previousOverall : null,
      dimensionScores: typedDimensions,
      coefficientVersion: detail.coefficientVersion,
      signals: JSON.parse(detail.signals) as string[],
      processingStatus: row.symbol.processingStatus,
      batchId: row.symbol.batchId,
      generationId: row.symbol.generationId,
      dataQuality: row.symbol.dataQuality,
    });
  }

  // Include every symbol that has a score snapshot AND at least 360 candles.
  // Candle data comes exclusively from the MarketBar table (ingested via
  // ingest_nasdaq_batch.ts for Batch-1+ and future batches). real-market-data.json
  // is only used for data freshness (live price overlays), NOT for the candle
  // count filter. Symbols without MarketBar history are excluded so rankings
  // only contain symbols with a full 360-candle history.
  const candleCounts = await db.marketBar.groupBy({
    by: ["ticker"],
    where: { ticker: { in: records.map((r) => r.ticker) } },
    _count: true,
  });
  const candleCountByTicker = new Map(
    candleCounts.map((row) => [row.ticker, row._count]),
  );
  let filtered = records.filter((record) => {
    const barCount = candleCountByTicker.get(record.ticker) ?? 0;
    return barCount >= 360;
  });

  const search = q.search?.trim().toLowerCase();
  if (search) {
    filtered = filtered.filter((record) =>
      record.ticker.toLowerCase().includes(search) ||
      record.name.toLowerCase().includes(search) ||
      record.sector.toLowerCase().includes(search) ||
      record.industry.toLowerCase().includes(search)
    );
  }

  if (q.sector && q.sector !== "All") {
    filtered = filtered.filter((record) => record.sector === q.sector);
  }
  if (q.grade && q.grade !== "All") {
    filtered = filtered.filter((record) => record.grade === q.grade);
  }
  if (q.minScore !== undefined) {
    filtered = filtered.filter((record) => record.overall >= q.minScore!);
  }
  if (q.maxScore !== undefined) {
    filtered = filtered.filter((record) => record.overall <= q.maxScore!);
  }
  if (q.minMarketCap !== undefined) {
    filtered = filtered.filter((record) => record.marketCap >= q.minMarketCap!);
  }
  if (q.maxMarketCap !== undefined) {
    filtered = filtered.filter((record) => record.marketCap <= q.maxMarketCap!);
  }
  if (q.isEtf !== undefined && q.isEtf !== null) {
    filtered = filtered.filter((record) => record.isEtf === q.isEtf);
  }

  const columnFilters = q.columnFilters ?? [];
  const nonRankFilters = columnFilters.filter((filter) => filter.key !== "rank");
  filtered = filtered.filter((record) =>
    nonRankFilters.every((filter) => matchesColumnFilter(record, filter)),
  );

  const requestedSort = q.sort;
  const sortField = RANKING_SORT_KEYS.includes(requestedSort as RankingColumnKey)
    ? (requestedSort as RankingColumnKey)
    : "overall";
  const order = q.order === "asc" ? "asc" : "desc";
  filtered = filtered
    .slice()
    .sort((a, b) => compareRankingRecords(a, b, sortField, order));

  filtered = filtered.map((record, index) => ({ ...record, rank: index + 1 }));
  const rankFilters = columnFilters.filter((filter) => filter.key === "rank");
  if (rankFilters.length > 0) {
    filtered = filtered.filter((record) =>
      rankFilters.every((filter) => matchesColumnFilter(record, filter)),
    );
  }

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const pageRows = filtered.slice(start, start + pageSize);

  return {
    rows: pageRows.map((record) => ({
      rank: record.rank ?? 0,
      ticker: record.ticker,
      name: record.name,
      sector: record.sector,
      industry: record.industry,
      marketCap: record.marketCap,
      isEtf: record.isEtf,
      overall: record.overall,
      grade: record.grade,
      coverage: record.coverage,
      ciLower: record.ciLower,
      ciUpper: record.ciUpper,
      price: record.price,
      priceChange: record.priceChange,
      volume: record.volume,
      delta: record.delta,
      dimensionScores: record.dimensionScores,
      coefficientVersion: record.coefficientVersion,
      signals: record.signals,
      processingStatus: record.processingStatus,
      batchId: record.batchId,
      generationId: record.generationId,
      dataQuality: record.dataQuality,
    })),
    total,
    page,
    pageSize,
    latestAt: latest.toISOString(),
    generationId: generationId ?? null,
  };
}

// ─── Symbol drilldown: latest snapshot + meta + prev ──────────────────────────
export async function fetchSymbolDetail(ticker: string, generationId?: string) {
  const symbol = await db.symbol.findUnique({
    where: { ticker: ticker.toUpperCase() },
  });
  if (!symbol) return null;

  // Use symbol's generationId if not specified
  const effectiveGenerationId = generationId ?? symbol.generationId ?? undefined;
  const latest = await getLatestCapturedAtPerSymbol(symbol.ticker, effectiveGenerationId);
  
  if (!latest) {
    // No snapshot yet — return symbol with status info for UI to show processingStatus/failedReason
    return {
      symbol,
      snapshot: null,
      prevOverall: null,
    };
  }

  const snap = await db.scoreSnapshot.findFirst({
    where: { ticker: symbol.ticker, capturedAt: latest, ...(effectiveGenerationId ? { generationId: effectiveGenerationId } : {}) },
  });
  if (!snap) {
    return {
      symbol,
      snapshot: null,
      prevOverall: null,
    };
  }

  const prev = await getPrevCapturedAtPerSymbol(symbol.ticker, latest, effectiveGenerationId);
  let prevOverall: number | null = null;
  if (prev) {
    const prevSnap = await db.scoreSnapshot.findFirst({
      where: { ticker: symbol.ticker, capturedAt: prev, ...(effectiveGenerationId ? { generationId: effectiveGenerationId } : {}) },
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
export async function fetchSymbolHistory(ticker: string, range: string, generationId?: string) {
  const sym = await db.symbol.findUnique({ where: { ticker: ticker.toUpperCase() } });
  if (!sym) return null;
  
  const effectiveGenerationId = generationId ?? sym.generationId ?? undefined;
  const latest = await getLatestCapturedAtPerSymbol(sym.ticker, effectiveGenerationId);
  if (!latest) return [];
  
  const days = rangeToDays(range);
  const since = new Date(latest.getTime() - days * 86_400_000);
  const rows = await db.scoreSnapshot.findMany({
    where: { ticker: sym.ticker, capturedAt: { gte: since }, ...(effectiveGenerationId ? { generationId: effectiveGenerationId } : {}) },
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
export async function fetchCoefficients(ticker: string, generationId?: string) {
  const sym = await db.symbol.findUnique({ where: { ticker: ticker.toUpperCase() } });
  if (!sym) return null;
  const effectiveGenerationId = generationId ?? sym.generationId ?? undefined;
  const rows = await db.coefficient.findMany({
    where: { ticker: sym.ticker, ...(effectiveGenerationId ? { generationId: effectiveGenerationId } : {}) },
  });
  const byLevel: Record<string, (typeof rows)[number]> = {};
  for (const r of rows) byLevel[r.level] = r;
  return { symbol: sym, coefficients: byLevel };
}

// ─── Radar profile (6-dim vector + overlays) ───────────────────────────────────
export async function fetchRadarProfile(ticker: string, generationId?: string) {
  const sym = await db.symbol.findUnique({ where: { ticker: ticker.toUpperCase() } });
  if (!sym) return null;
  
  const effectiveGenerationId = generationId ?? sym.generationId ?? undefined;
  const latest = await getLatestCapturedAtPerSymbol(sym.ticker, effectiveGenerationId);
  if (!latest) return null;
  
  const snap = await db.scoreSnapshot.findFirst({
    where: { ticker: sym.ticker, capturedAt: latest, ...(effectiveGenerationId ? { generationId: effectiveGenerationId } : {}) },
  });
  if (!snap) return null;
  const dims = JSON.parse(snap.dimensionScores) as Record<string, number>;

  // 30-day-ago profile
  const thirtyAgo = new Date(latest.getTime() - 30 * 86_400_000);
  const thirtyAgoSnap = await db.scoreSnapshot.findFirst({
    where: { ticker: sym.ticker, capturedAt: { lte: thirtyAgo }, ...(effectiveGenerationId ? { generationId: effectiveGenerationId } : {}) },
    orderBy: { capturedAt: "desc" },
  });
  const thirtyAgoDims = thirtyAgoSnap
    ? (JSON.parse(thirtyAgoSnap.dimensionScores) as Record<string, number>)
    : null;

  // NASDAQ median profile (latest day for this generation)
  const allLatest = await db.scoreSnapshot.findMany({
    where: { capturedAt: latest, ticker: { not: sym.ticker }, ...(effectiveGenerationId ? { generationId: effectiveGenerationId } : {}) },
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
      ...(effectiveGenerationId ? { generationId: effectiveGenerationId } : {}),
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
export async function fetchDecomposition(ticker: string, generationId?: string) {
  const sym = await db.symbol.findUnique({ where: { ticker: ticker.toUpperCase() } });
  if (!sym) return null;
  
  const effectiveGenerationId = generationId ?? sym.generationId ?? undefined;
  const latest = await getLatestCapturedAtPerSymbol(sym.ticker, effectiveGenerationId);
  if (!latest) return null;
  
  const snap = await db.scoreSnapshot.findFirst({
    where: { ticker: sym.ticker, capturedAt: latest, ...(effectiveGenerationId ? { generationId: effectiveGenerationId } : {}) },
  });
  if (!snap) return null;
  const dimScores = JSON.parse(snap.dimensionScores) as Record<string, number>;
  const subDimScores = JSON.parse(snap.subDimensionScores) as Record<string, number>;
  const aspectScores = JSON.parse(snap.aspectScores) as Record<string, number>;
  const subAspectScores = JSON.parse(snap.subAspectScores) as Record<string, number>;
  const coeffs = await db.coefficient.findMany({
    where: { ticker: sym.ticker, ...(effectiveGenerationId ? { generationId: effectiveGenerationId } : {}) },
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
export async function fetchPeers(ticker: string, compareTicker?: string, generationId?: string) {
  const sym = await db.symbol.findUnique({ where: { ticker: ticker.toUpperCase() } });
  if (!sym) return null;
  
  const effectiveGenerationId = generationId ?? sym.generationId ?? undefined;
  const latest = await getLatestCapturedAtPerSymbol(sym.ticker, effectiveGenerationId);
  if (!latest) return null;
  
  // Use symbols from the same generation (or all if legacy)
  const allInSector = await db.symbol.findMany({
    where: { 
      sector: sym.sector, 
      ticker: { not: sym.ticker }, 
      isEtf: false,
      ...(effectiveGenerationId ? { generationId: effectiveGenerationId } : {}),
    },
  });
  // nearest 5 by market cap (log distance). Skip symbols with no real marketCap
  // (marketCap <= 0 means no real data — anti-mock: never use a synthetic value).
  const validPeers = allInSector.filter((s) => s.marketCap > 0);
  let sorted: { s: (typeof allInSector)[number]; dist: number }[];
  if (sym.marketCap > 0 && validPeers.length > 0) {
    const logSym = Math.log(sym.marketCap);
    sorted = validPeers
      .map((s) => ({ s, dist: Math.abs(Math.log(s.marketCap) - logSym) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 5);
  } else {
    // No real marketCap for the symbol: fall back to nearest by absolute marketCap
    sorted = validPeers
      .slice()
      .sort((a, b) => b.marketCap - a.marketCap)
      .slice(0, 5)
      .map((s) => ({ s, dist: 0 }));
  }
  const peerTickers = sorted.map((x) => x.s.ticker);
  
  // Include custom compare ticker if provided and not already in peer list
  const allTickers = compareTicker && !peerTickers.includes(compareTicker) && compareTicker !== sym.ticker
    ? [sym.ticker, ...peerTickers, compareTicker]
    : [sym.ticker, ...peerTickers];
    
  const snaps = await db.scoreSnapshot.findMany({
    where: { capturedAt: latest, ticker: { in: allTickers }, ...(effectiveGenerationId ? { generationId: effectiveGenerationId } : {}) },
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
  return { symbol: sym, peers: rows, percentileRanks, latestAt: latest.toISOString(), compareTicker };
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
export async function fetchTrace(ticker: string, generationId?: string) {
  const sym = await db.symbol.findUnique({ where: { ticker: ticker.toUpperCase() } });
  if (!sym) return null;
  
  const effectiveGenerationId = generationId ?? sym.generationId ?? undefined;
  const latest = await getLatestCapturedAtPerSymbol(sym.ticker, effectiveGenerationId);
  if (!latest) return null;
  
  const snap = await db.scoreSnapshot.findFirst({
    where: { ticker: sym.ticker, capturedAt: latest, ...(effectiveGenerationId ? { generationId: effectiveGenerationId } : {}) },
  });
  if (!snap) return null;
  
  const coeffs = await db.coefficient.findMany({
    where: { ticker: sym.ticker, ...(effectiveGenerationId ? { generationId: effectiveGenerationId } : {}) },
    select: { level: true, version: true, dataHash: true, trainedAt: true, sampleCount: true },
  });
  const trainingRuns = await db.trainingRun.findMany({
    where: { ticker: sym.ticker, ...(effectiveGenerationId ? { generationId: effectiveGenerationId } : {}) },
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
    batchId: snap.batchId,
    generationId: snap.generationId,
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
