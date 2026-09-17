// GET /api/news — news ribbon items
import { NextRequest, NextResponse } from "next/server";
import { fetchNews } from "@/lib/scoring/queries";

export async function GET(req: NextRequest) {
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 30);
  const items = await fetchNews(limit);
  return NextResponse.json({ items });
}
