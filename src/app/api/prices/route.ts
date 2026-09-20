// GET /api/prices/live — current live intraday prices
import { NextResponse } from "next/server";
import { getLivePrices, isMarketOpen } from "@/lib/live-prices";

export async function GET() {
  const data = getLivePrices();
  if (!data) {
    return NextResponse.json(
      { error: "Live prices not available yet" },
      { status: 404 }
    );
  }
  return NextResponse.json({
    fetched_at: data.fetched_at,
    market_status: isMarketOpen() ? "OPEN" : "CLOSED",
    timestamp: data.timestamp,
    tickers: data.tickers,
  });
}
