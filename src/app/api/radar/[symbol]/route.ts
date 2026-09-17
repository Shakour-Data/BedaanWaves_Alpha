// GET /api/radar/[symbol] — 6-axis radar profile with overlays
import { NextResponse } from "next/server";
import { fetchRadarProfile } from "@/lib/scoring/queries";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const res = await fetchRadarProfile(symbol);
  if (!res) {
    return NextResponse.json({ error: "Symbol not found" }, { status: 404 });
  }
  return NextResponse.json(res);
}