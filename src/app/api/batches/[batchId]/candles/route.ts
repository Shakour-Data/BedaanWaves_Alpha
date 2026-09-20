// GET /api/batches/[batchId]/candles — aggregate OHLCV candles for a batch
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { Bar } from "@/lib/technical-indicators";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const { batchId } = await params;
  const range = (req.nextUrl.searchParams.get("range") ?? "3M").toUpperCase();
  const RANGE_TO_DAYS: Record<string, number> = {
    "1W": 5, "1M": 30, "3M": 90, "6M": 180, "1Y": 365, MAX: 999999,
  };
  const days = RANGE_TO_DAYS[range] ?? 90;

  const bars = await db.marketBar.findMany({
    where: { batchId },
    orderBy: { date: "asc" },
    select: {
      ticker: true,
      date: true,
      open: true,
      high: true,
      low: true,
      close: true,
      volume: true,
    },
  });

  if (bars.length === 0) {
    return NextResponse.json(
      { error: "No candle data for batch", batchId, count: 0 },
      { status: 404 },
    );
  }

  // Aggregate by date: average OHLC, sum volume, min low, max high
  const byDate = new Map<string, { o: number; h: number; l: number; c: number; v: number; count: number }>();
  for (const b of bars) {
    const existing = byDate.get(b.date);
    if (existing) {
      existing.o += b.open;
      existing.h = Math.max(existing.h, b.high);
      existing.l = Math.min(existing.l, b.low);
      existing.c += b.close;
      existing.v += b.volume;
      existing.count++;
    } else {
      byDate.set(b.date, { o: b.open, h: b.high, l: b.low, c: b.close, v: b.volume, count: 1 });
    }
  }

  const sortedDates = Array.from(byDate.keys()).sort();
  const cutoff = sortedDates[Math.max(0, sortedDates.length - days)] ?? sortedDates[0];
  const filtered = sortedDates.filter((d) => d >= cutoff);

  const result: Bar[] = filtered.map((date) => {
    const d = byDate.get(date)!;
    const n = d.count;
    return {
      date,
      open: d.o / n,
      high: d.h,
      low: d.l,
      close: d.c / n,
      volume: d.v,
    };
  });

  return NextResponse.json({
    batchId,
    range,
    count: result.length,
    source: "MarketBar aggregate (batch symbols)",
    bars: result,
  });
}
