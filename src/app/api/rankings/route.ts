// GET /api/rankings — paginated, filtered, sorted NASDAQ rankings (latest day)
import { NextRequest, NextResponse } from "next/server";
import { fetchRankings } from "@/lib/scoring/queries";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const res = await fetchRankings({
    page: sp.get("page") ? Number(sp.get("page")) : 1,
    pageSize: sp.get("pageSize") ? Number(sp.get("pageSize")) : 25,
    search: sp.get("search") ?? undefined,
    sector: sp.get("sector") ?? undefined,
    grade: sp.get("grade") ?? undefined,
    minScore: sp.get("minScore") ? Number(sp.get("minScore")) : undefined,
    maxScore: sp.get("maxScore") ? Number(sp.get("maxScore")) : undefined,
    minMarketCap: sp.get("minMarketCap") ? Number(sp.get("minMarketCap")) : undefined,
    maxMarketCap: sp.get("maxMarketCap") ? Number(sp.get("maxMarketCap")) : undefined,
    sort: sp.get("sort") ?? undefined,
    order: (sp.get("order") as "asc" | "desc") ?? undefined,
    isEtf: sp.get("isEtf") === null || sp.get("isEtf") === undefined
      ? null
      : sp.get("isEtf") === "true",
  });
  return NextResponse.json(res);
}
