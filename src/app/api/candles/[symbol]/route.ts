// GET /api/candles/[symbol]?range=3M — real OHLCV candles (spec §1.1)
// Sources: batch-0 → real-market-data.json; batch-1+ → MarketBar DB table.
// No synthetic data — every bar is real.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCandles, getTickerMeta } from "@/lib/real-store";
import type { Bar } from "@/lib/technical-indicators";

const RANGE_TO_DAYS: Record<string, number> = {
  "1W": 5, "1M": 30, "3M": 90, "6M": 180, "1Y": 365, MAX: 999999,
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;
  const upper = symbol.toUpperCase();
  const range = (req.nextUrl.searchParams.get("range") ?? "3M").toUpperCase();
  const days = RANGE_TO_DAYS[range] ?? 90;

  // 1. Try real-market-data.json (batch-0 symbols)
  let bars = getCandles(upper, range);
  let source = "yfinance (real, corporate-action adjusted)";

  // 2. Fall back to MarketBar DB (batch-1+ symbols)
  if (bars.length === 0) {
    const mbBars = await db.marketBar.findMany({
      where: { ticker: upper },
      orderBy: { date: "asc" },
      select: {
        date: true,
        open: true,
        high: true,
        low: true,
        close: true,
        volume: true,
      },
    });
    if (mbBars.length > 0) {
      const cutoff = mbBars[Math.max(0, mbBars.length - days)].date;
      bars = mbBars
        .filter((b) => b.date >= cutoff)
        .map((b): Bar => ({
          date: b.date,
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
          volume: b.volume,
        }));
      source = "MarketBar DB (yfinance, real data)";
    }
  }

  if (bars.length === 0) {
    return NextResponse.json(
      { error: "No real candle data for symbol", symbol: upper },
      { status: 404 },
    );
  }

  const meta = getTickerMeta(upper);
  return NextResponse.json({
    ticker: upper,
    range,
    count: bars.length,
    source,
    meta: meta
      ? {
          name: meta.name,
          sector: meta.sector,
          industry: meta.industry,
          marketCap: meta.marketCapUsd,
          beta: meta.beta,
          trailingPE: meta.trailingPE,
        }
      : null,
    bars,
  });
}
