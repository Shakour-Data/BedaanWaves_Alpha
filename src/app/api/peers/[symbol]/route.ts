// GET /api/peers/[symbol] — selected vs 5 nearest peers
import { NextResponse } from "next/server";
import { fetchPeers } from "@/lib/scoring/queries";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const res = await fetchPeers(symbol);
  if (!res) {
    return NextResponse.json({ error: "Symbol not found" }, { status: 404 });
  }
  return NextResponse.json(res);
}
