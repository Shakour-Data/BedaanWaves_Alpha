// GET /api/macro/[symbol] — per-symbol macro detail with sub-aspect breakdown
import { NextRequest, NextResponse } from "next/server";
import { fetchMacroDetail } from "@/lib/scoring/queries";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const generationId = req.nextUrl.searchParams.get("generationId") ?? undefined;
  const res = await fetchMacroDetail(symbol, generationId);
  if (!res) {
    return NextResponse.json(
      { error: "Symbol not found or no macro data available", symbol: symbol.toUpperCase() },
      { status: 404 }
    );
  }
  return NextResponse.json(res);
}