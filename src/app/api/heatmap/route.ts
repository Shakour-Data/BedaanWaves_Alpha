import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getLatestCapturedAt } from "@/lib/scoring/queries";

export async function GET() {
  const latest = await getLatestCapturedAt();

  const rows = await db.$queryRaw<
    Array<{
      ticker: string;
      overall: number | bigint;
      grade: string;
      priceChange: number | bigint;
      marketCap: bigint | number;
      sector: string;
      dimFundamental: number | bigint;
      dimTechnical: number | bigint;
      dimSentiment: number | bigint;
      dimRisk: number | bigint;
      dimMacro: number | bigint;
      dimAi: number | bigint;
    }>
  >`
    SELECT 
      ss.ticker,
      ss.overall,
      ss.grade,
      ss.priceChange,
      s.marketCap,
      s.sector,
      json_extract(ss.dimensionScores, '$.fundamental') as dimFundamental,
      json_extract(ss.dimensionScores, '$.technical') as dimTechnical,
      json_extract(ss.dimensionScores, '$.sentiment') as dimSentiment,
      json_extract(ss.dimensionScores, '$.risk') as dimRisk,
      json_extract(ss.dimensionScores, '$.macro') as dimMacro,
      json_extract(ss.dimensionScores, '$.ai') as dimAi
    FROM ScoreSnapshot ss
    JOIN Symbol s ON s.ticker = ss.ticker
    WHERE ss.capturedAt = ${latest}
      AND s.marketCap > 0
    ORDER BY s.marketCap DESC
    LIMIT 500
  `;

  // Convert all BigInt to Number for JSON serialization
  const serializedRows = rows.map((row) => ({
    ticker: row.ticker,
    overall: Number(row.overall),
    grade: row.grade,
    priceChange: Number(row.priceChange),
    marketCap: Number(row.marketCap),
    sector: row.sector,
    dimFundamental: Number(row.dimFundamental),
    dimTechnical: Number(row.dimTechnical),
    dimSentiment: Number(row.dimSentiment),
    dimRisk: Number(row.dimRisk),
    dimMacro: Number(row.dimMacro),
    dimAi: Number(row.dimAi),
  }));

  return NextResponse.json({ rows: serializedRows, latestAt: latest.toISOString() });
}