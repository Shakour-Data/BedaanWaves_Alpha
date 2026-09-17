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
  const overall = s.overall ?? 0;
  return NextResponse.json({
    ticker: sym.ticker,
    name: sym.name ?? "",
    sector: sym.sector ?? "",
    industry: sym.industry ?? "",
    marketCap: sym.marketCap ?? 0,
    isEtf: sym.isEtf ?? false,
    capturedAt: s.capturedAt?.toISOString() ?? "",
    overall,
    grade: s.grade || gradeFor(overall),
    signals: JSON.parse(s.signals || "[]"),
    dimensionScores: JSON.parse(s.dimensionScores || "{}"),
    subDimensionScores: JSON.parse(s.subDimensionScores || "{}"),
    aspectScores: JSON.parse(s.aspectScores || "{}"),
    subAspectScores: JSON.parse(s.subAspectScores || "{}"),
    coverage: s.coverage ?? 0,
    ciLower: s.ciLower ?? 0,
    ciUpper: s.ciUpper ?? 0,
    stabilityIndex: s.stabilityIndex ?? 0,
    price: s.price ?? 0,
    priceChange: s.priceChange ?? 0,
    volume: s.volume ?? 0,
    prevOverall,
    delta: prevOverall !== null && prevOverall !== undefined ? overall - prevOverall : null,
    coefficientVersion: s.coefficientVersion ?? "",
    rawDataHash: s.rawDataHash ?? "",
    dataQuality: s.dataQuality ?? "VALIDATED",
    isProcessed: s.isProcessed ?? false,
    snapshotId: s.id ?? "",
  });
}
