// GET /api/radar/[symbol] — 6-axis radar profile with overlays
import { NextRequest, NextResponse } from "next/server";
import { fetchRadarProfile } from "@/lib/scoring/queries";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const generationId = req.nextUrl.searchParams.get("generationId") ?? undefined;
  const res = await fetchRadarProfile(symbol, generationId);
  if (!res) {
    return NextResponse.json({ 
      error: "Symbol not found or no radar profile available",
      symbol: symbol.toUpperCase(),
    }, { status: 404 });
  }
  return NextResponse.json(res);
}