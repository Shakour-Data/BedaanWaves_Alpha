// GET /api/ticker — rotating marquee data
import { NextRequest, NextResponse } from "next/server";
import { fetchTickerTape } from "@/lib/scoring/queries";

export async function GET(req: NextRequest) {
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 100);
  const items = await fetchTickerTape(limit);
  return NextResponse.json({ items });
}
