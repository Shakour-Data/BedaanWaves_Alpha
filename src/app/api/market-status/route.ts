// GET /api/market-status — universe stats + observability
import { NextResponse } from "next/server";
import { fetchMarketStatus } from "@/lib/scoring/queries";

export async function GET() {
  const status = await fetchMarketStatus();
  return NextResponse.json(status);
}
