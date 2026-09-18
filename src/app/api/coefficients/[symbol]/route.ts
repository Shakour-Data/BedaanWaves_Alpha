// GET /api/coefficients/[symbol] — per-symbol learned weights at all 4 levels
import { NextRequest, NextResponse } from "next/server";
import { fetchCoefficients } from "@/lib/scoring/queries";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const generationId = req.nextUrl.searchParams.get("generationId") ?? undefined;
  const res = await fetchCoefficients(symbol, generationId);
  if (!res) {
    return NextResponse.json({ 
      error: "Symbol not found",
      symbol: symbol.toUpperCase(),
    }, { status: 404 });
  }
  const { symbol: sym, coefficients } = res;
  const out: Record<string, unknown> = {
    ticker: sym.ticker,
    name: sym.name,
    sector: sym.sector,
  };
  for (const level of ["dimensions", "sub_dimensions", "aspects", "sub_aspects"]) {
    const c = coefficients[level];
    if (c) {
      out[level] = {
        weights: JSON.parse(c.weights),
        trainedAt: c.trainedAt.toISOString(),
        sampleCount: c.sampleCount,
        version: c.version,
        dataHash: c.dataHash,
        driftStatus: c.driftStatus,
        oosR2: c.oosR2,
        oosIc: c.oosIc,
        shapTopKeys: c.shapTopKeys ? JSON.parse(c.shapTopKeys) : null,
        meta: c.meta ? JSON.parse(c.meta) : null,
      };
    }
  }
  return NextResponse.json(out);
}
