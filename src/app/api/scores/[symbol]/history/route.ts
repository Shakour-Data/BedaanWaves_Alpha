// GET /api/scores/[symbol]/history?range=1M — time-series of overall + 6 dims
import { NextRequest, NextResponse } from "next/server";
import { fetchSymbolHistory } from "@/lib/scoring/queries";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const range = req.nextUrl.searchParams.get("range") ?? "3M";
  const history = await fetchSymbolHistory(symbol, range);
  if (!history) {
    return NextResponse.json({ error: "Symbol not found" }, { status: 404 });
  }
  return NextResponse.json({ symbol: symbol.toUpperCase(), range, points: history });
}
