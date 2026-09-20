// GET /api/scores/[symbol] — latest snapshot for a symbol
import { NextRequest, NextResponse } from "next/server";
import { fetchSymbolDetail } from "@/lib/scoring/queries";
import { gradeFor } from "@/lib/scoring/transforms";
import { getLivePrice } from "@/lib/live-prices";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const generationId = req.nextUrl.searchParams.get("generationId") ?? undefined;
  const detail = await fetchSymbolDetail(symbol, generationId);
  if (!detail) {
    return NextResponse.json({ error: "Symbol not found" }, { status: 404 });
  }
  const { symbol: sym, snapshot: s, prevOverall } = detail;
  
  // If no snapshot yet, return symbol info with processing status
  if (!s) {
    return NextResponse.json({
      ticker: sym.ticker,
      name: sym.name ?? "",
      sector: sym.sector ?? "",
      industry: sym.industry ?? "",
      marketCap: sym.marketCap ?? 0,
      isEtf: sym.isEtf ?? false,
      processingStatus: sym.processingStatus,
      batchId: sym.batchId,
      generationId: sym.generationId,
      dataQuality: sym.dataQuality,
      capturedAt: null,
      overall: null,
      grade: null,
      signals: [],
      dimensionScores: {},
      subDimensionScores: {},
      aspectScores: {},
      subAspectScores: {},
      coverage: 0,
      ciLower: 0,
      ciUpper: 0,
      stabilityIndex: 0,
      price: 0,
      priceChange: 0,
      volume: 0,
      prevOverall: null,
      delta: null,
      coefficientVersion: "",
      rawDataHash: "",
      dataQualitySnapshot: "PENDING",
      isProcessed: false,
      snapshotId: "",
      message: `Symbol is ${sym.processingStatus?.toLowerCase().replace("_", " ")} — no score snapshot available yet`,
    });
  }
  
  const overall = s.overall ?? 0;
  const livePrice = getLivePrice(sym.ticker);
  return NextResponse.json({
    ticker: sym.ticker,
    name: sym.name ?? "",
    sector: sym.sector ?? "",
    industry: sym.industry ?? "",
    marketCap: sym.marketCap ?? 0,
    isEtf: sym.isEtf ?? false,
    processingStatus: sym.processingStatus,
    batchId: sym.batchId,
    generationId: sym.generationId,
    dataQuality: sym.dataQuality,
    capturedAt: s.capturedAt?.toISOString() ?? "",
    overall,
    grade: s.grade || gradeFor(overall, s.coverage ?? 0),
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
    dataQualitySnapshot: s.dataQuality ?? "PROVISIONAL",
    isProcessed: s.isProcessed ?? false,
    snapshotId: s.id ?? "",
    livePrice: livePrice?.price ?? null,
    livePriceChange: livePrice?.change ?? null,
    liveTimestamp: livePrice?.timestamp ?? null,
    marketStatus: livePrice ? "OPEN" : "CLOSED",
  });
}
