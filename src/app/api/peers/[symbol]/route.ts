// GET /api/peers/[symbol] — selected vs 5 nearest peers (+ optional custom compare)
import { NextResponse } from "next/server";
import { fetchPeers } from "@/lib/scoring/queries";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const { searchParams } = new URL(req.url);
  const compareTicker = searchParams.get("compare")?.toUpperCase();
  const res = await fetchPeers(symbol, compareTicker ?? undefined);
  if (!res) {
    return NextResponse.json({ error: "Symbol not found" }, { status: 404 });
  }
  return NextResponse.json(res);
}
