// GET /api/rankings — paginated, filtered, sorted NASDAQ rankings (latest day)
import { NextRequest, NextResponse } from "next/server";
import { fetchRankings, parseRankingColumnFilters } from "@/lib/scoring/queries";
import { getLivePrices } from "@/lib/live-prices";
import { SEED_TICKERS_DEDUP } from "@/lib/scoring/seed/universe";

const VALID_TICKERS = new Set(SEED_TICKERS_DEDUP.map((t) => t.ticker));
const MAX_PAGE_SIZE = 100;
const VALID_GRADES = ["STRONG_BULLISH", "BULLISH", "NEUTRAL", "NO_DATA", "BEARISH", "STRONG_BEARISH"] as const;
const VALID_SORTS = ["overall", "price", "priceChange", "marketCap", "coverage", "rank"] as const;
const VALID_ORDERS = ["asc", "desc"] as const;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  let columnFilters;
  const rawColumnFilters = sp.get("columnFilters");
  if (rawColumnFilters) {
    try {
      columnFilters = parseRankingColumnFilters(JSON.parse(rawColumnFilters));
    } catch {
      columnFilters = null;
    }
    if (columnFilters === null) {
      return NextResponse.json({ error: "Invalid column filters" }, { status: 400 });
    }
  }

  // Validate page
  const page = (() => {
    const raw = sp.get("page");
    if (!raw) return 1;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 && n <= 1000 ? Math.floor(n) : 400;
  })();

  // Validate pageSize
  const pageSize = (() => {
    const raw = sp.get("pageSize");
    if (!raw) return 25;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.min(MAX_PAGE_SIZE, Math.floor(n)) : 400;
  })();

  // Validate minScore
  const minScore = (() => {
    const raw = sp.get("minScore");
    if (!raw) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 400;
  })();

  // Validate maxScore
  const maxScore = (() => {
    const raw = sp.get("maxScore");
    if (!raw) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 400;
  })();

  // Validate marketCap bounds
  const minMarketCap = (() => {
    const raw = sp.get("minMarketCap");
    if (!raw) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 400;
  })();

  const maxMarketCap = (() => {
    const raw = sp.get("maxMarketCap");
    if (!raw) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 400;
  })();

  // Validate sort
  const sort = (sp.get("sort") ?? "overall") as string;
  if (!VALID_SORTS.includes(sort as any)) {
    return NextResponse.json({ error: "Invalid sort field" }, { status: 400 });
  }

  // Validate order
  const order = (sp.get("order") ?? "desc") as string;
  if (!VALID_ORDERS.includes(order as any)) {
    return NextResponse.json({ error: "Invalid order" }, { status: 400 });
  }

  // Validate grade
  const grade = sp.get("grade") ?? undefined;
  if (grade !== undefined && !VALID_GRADES.includes(grade as any)) {
    return NextResponse.json({ error: "Invalid grade" }, { status: 400 });
  }

  // Validate isEtf
  const isEtfRaw = sp.get("isEtf");
  let isEtf: boolean | null = null;
  if (isEtfRaw !== null && isEtfRaw !== undefined) {
    if (isEtfRaw !== "true" && isEtfRaw !== "false") {
      return NextResponse.json({ error: "isEtf must be 'true' or 'false'" }, { status: 400 });
    }
    isEtf = isEtfRaw === "true";
  }

  // Validate search (ticker whitelist check)
  const search = sp.get("search") ?? undefined;
  if (search && search.length > 50) {
    return NextResponse.json({ error: "Search query too long" }, { status: 400 });
  }

  const res = await fetchRankings({
    page,
    pageSize,
    search,
    sector: sp.get("sector") ?? undefined,
    grade,
    minScore,
    maxScore,
    minMarketCap,
    maxMarketCap,
    sort,
    order: order as "asc" | "desc",
    isEtf,
    columnFilters,
    generationId: sp.get("generationId") ?? undefined,
    processingStatus: sp.get("processingStatus") ?? undefined,
  });

  // Enrich with live prices
  const live = getLivePrices();
  const rows = res.rows.map((row) => {
    const lp = live?.tickers[row.ticker];
    return {
      ...row,
      livePrice: lp?.price ?? null,
      livePriceChange: lp?.change ?? null,
      liveOpen: lp?.open ?? null,
      liveHigh: lp?.high ?? null,
      liveLow: lp?.low ?? null,
      liveTimestamp: lp?.timestamp ?? null,
    };
  });

  return NextResponse.json({ ...res, rows });
}
