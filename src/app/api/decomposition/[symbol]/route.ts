// GET /api/decomposition/[symbol] — waterfall data (L1 → L4)
import { NextRequest, NextResponse } from "next/server";
import { fetchDecomposition } from "@/lib/scoring/queries";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const generationId = req.nextUrl.searchParams.get("generationId") ?? undefined;
  const res = await fetchDecomposition(symbol, generationId);
  if (!res) {
    return NextResponse.json({ 
      error: "Symbol not found or no decomposition available",
      symbol: symbol.toUpperCase(),
    }, { status: 404 });
  }
  return NextResponse.json(res);
}
