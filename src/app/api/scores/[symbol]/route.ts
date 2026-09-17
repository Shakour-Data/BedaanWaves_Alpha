// GET /api/scores/[symbol] — latest snapshot for a symbol
import { NextResponse } from "next/server";
import { fetchSymbolDetail } from "@/lib/scoring/queries";
import { gradeFor } from "@/lib/scoring/transforms";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const detail = await fetchSymbolDetail(symbol);
  if (!detail) {
    return NextResponse.json({ error: "Symbol not found" }, { status: 404 });
  }
  const { symbol: sym, snapshot: s, prevOverall } = detail;
  return NextResponse.json({
    ticker: sym.ticker,
    name: sym.name,
    sector: sym.sector,
    industry: sym.industry,
    marketCap: sym.marketCap,
    isEtf: sym.isEtf,
    capturedAt: s.capturedAt.toISOString(),
    overall: s.overall,
    grade: s.grade || gradeFor(s.overall),
    signals: JSON.parse(s.signals),
    dimensionScores: JSON.parse(s.dimensionScores),
    subDimensionScores: JSON.parse(s.subDimensionScores),
    aspectScores: JSON.parse(s.aspectScores),
    subAspectScores: JSON.parse(s.subAspectScores),
    coverage: s.coverage,
    ciLower: s.ciLower,
    ciUpper: s.ciUpper,
    stabilityIndex: s.stabilityIndex,
    price: s.price,
    priceChange: s.priceChange,
    volume: s.volume,
    prevOverall,
    delta: prevOverall !== null ? s.overall - prevOverall : null,
    coefficientVersion: s.coefficientVersion,
    rawDataHash: s.rawDataHash,
    dataQuality: s.dataQuality,
    isProcessed: s.isProcessed,
    snapshotId: s.id,
  });
}
