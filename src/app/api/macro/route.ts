// GET /api/macro — real market indicators + economic releases (spec §1.3 real macro)
// Single source of truth for the native Market Overview + Economic Calendar.
import { NextResponse } from "next/server";
import { getMarketIndicators, getEconomicReleases } from "@/lib/real-store";

export async function GET() {
  const market = getMarketIndicators();
  const releases = getEconomicReleases();
  return NextResponse.json({
    source: "yfinance + FRED / published government statistics (BEA, BLS, Fed, U.Michigan) — ALL REAL",
    market, // daily-traded assets: yields, dollar, oil, gold, vix, fx
    releases, // economic stats: GDP, CPI, payrolls, sentiment, etc.
  });
}
