// GET /api/symbols — searchable symbol list (for autocomplete)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim().toUpperCase();
  const limit = Math.min(50, Number(sp.get("limit") ?? 20));
  const symbols = await db.symbol.findMany({
    where: q
      ? {
          OR: [
            { ticker: { contains: q } },
            { name: { contains: q } },
          ],
        }
      : undefined,
    take: limit,
    orderBy: { marketCap: "desc" },
  });
  return NextResponse.json({
    symbols: symbols.map((s) => ({
      ticker: s.ticker,
      name: s.name,
      sector: s.sector,
      industry: s.industry,
      marketCap: s.marketCap,
      isEtf: s.isEtf,
      processingStatus: s.processingStatus,
      batchId: s.batchId,
      generationId: s.generationId,
      dataQuality: s.dataQuality,
    })),
  });
}
