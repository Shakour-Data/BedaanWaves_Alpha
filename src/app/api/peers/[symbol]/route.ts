// GET /api/peers/[symbol] — selected vs 5 nearest peers (+ optional custom compare)
import { NextRequest, NextResponse } from "next/server";
import { fetchPeers } from "@/lib/scoring/queries";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const { searchParams } = new URL(req.url);
  const compareTicker = searchParams.get("compare")?.toUpperCase();
  const generationId = searchParams.get("generationId") ?? undefined;
  const res = await fetchPeers(symbol, compareTicker ?? undefined, generationId);
  if (!res) {
    return NextResponse.json({ 
      error: "Symbol not found or no peer data available",
      symbol: symbol.toUpperCase(),
    }, { status: 404 });
  }
  return NextResponse.json(res);
}
