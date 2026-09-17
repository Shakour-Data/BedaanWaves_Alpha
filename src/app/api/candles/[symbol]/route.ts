// GET /api/candles/[symbol]?range=3M — real OHLCV candles from yfinance (spec §1.1)
// Used by the native candlestick chart. No synthetic data — every bar is real.
import { NextResponse } from "next/server";
import { getCandles, getTickerMeta } from "@/lib/real-store";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const range = (new URL(_req.url).searchParams.get("range") ?? "3M").toUpperCase();
  const bars = getCandles(symbol, range);
  const meta = getTickerMeta(symbol);
  if (bars.length === 0) {
    return NextResponse.json(
      { error: "No real candle data for symbol", symbol: symbol.toUpperCase() },
      { status: 404 }
    );
  }
  return NextResponse.json({
    ticker: symbol.toUpperCase(),
    range,
    count: bars.length,
    source: "yfinance (real, corporate-action adjusted)",
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
