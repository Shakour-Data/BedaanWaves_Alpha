// GET /api/market-status — universe stats + observability
import { NextResponse } from "next/server";
import { fetchMarketStatus } from "@/lib/scoring/queries";
import { getLivePrices, isMarketOpen } from "@/lib/live-prices";

export async function GET() {
  const status = await fetchMarketStatus();
  const live = getLivePrices();
  return NextResponse.json({
    ...status,
    livePrices: live
      ? {
          fetched_at: live.fetched_at,
          market_status: live.market_status,
          timestamp: live.timestamp,
          ticker_count: Object.keys(live.tickers).length,
        }
      : null,
  });
}
