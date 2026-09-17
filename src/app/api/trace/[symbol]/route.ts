// GET /api/trace/[symbol] — data provenance / lineage
import { NextResponse } from "next/server";
import { fetchTrace } from "@/lib/scoring/queries";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const res = await fetchTrace(symbol);
  if (!res) {
    return NextResponse.json({ error: "Symbol not found" }, { status: 404 });
  }
  return NextResponse.json(res);
}
