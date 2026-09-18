// GET /api/trace/[symbol] — data provenance / lineage
import { NextRequest, NextResponse } from "next/server";
import { fetchTrace } from "@/lib/scoring/queries";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const generationId = req.nextUrl.searchParams.get("generationId") ?? undefined;
  const res = await fetchTrace(symbol, generationId);
  if (!res) {
    return NextResponse.json({ 
      error: "Symbol not found or no trace data available",
      symbol: symbol.toUpperCase(),
    }, { status: 404 });
  }
  return NextResponse.json(res);
}
