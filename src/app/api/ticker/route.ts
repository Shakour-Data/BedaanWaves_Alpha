// GET /api/ticker — rotating marquee data
import { NextRequest, NextResponse } from "next/server";
import { fetchTickerTape } from "@/lib/scoring/queries";
import { getLivePrices } from "@/lib/live-prices";

export async function GET(req: NextRequest) {
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 100);
  const items = await fetchTickerTape(limit);
  const live = getLivePrices();
  const enriched = items.map((item) => {
    const lp = live?.tickers[item.ticker];
    return {
      ...item,
      livePrice: lp?.price ?? null,
      livePriceChange: lp?.change ?? null,
      liveOpen: lp?.open ?? null,
      liveHigh: lp?.high ?? null,
      liveLow: lp?.low ?? null,
      liveTimestamp: lp?.timestamp ?? null,
    };
  });
  return NextResponse.json({ items: enriched });
}
