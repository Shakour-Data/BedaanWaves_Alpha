// GET /api/decomposition/[symbol] — waterfall data (L1 → L4)
import { NextResponse } from "next/server";
import { fetchDecomposition } from "@/lib/scoring/queries";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const res = await fetchDecomposition(symbol);
  if (!res) {
    return NextResponse.json({ error: "Symbol not found" }, { status: 404 });
  }
  return NextResponse.json(res);
}
