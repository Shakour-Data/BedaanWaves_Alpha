// /api/watchlists/[id]/entries — POST add ticker, DELETE remove ticker
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const ticker = String(body.ticker ?? "").toUpperCase();
  if (!ticker) return NextResponse.json({ error: "ticker required" }, { status: 400 });
  const sym = await db.symbol.findUnique({ where: { ticker } });
  if (!sym) return NextResponse.json({ error: "ticker not in NASDAQ universe" }, { status: 404 });
  const wl = await db.watchlist.findUnique({ where: { id } });
  if (!wl) return NextResponse.json({ error: "watchlist not found" }, { status: 404 });
  await db.watchlistEntry
    .create({ data: { watchlistId: id, ticker } })
    .catch(() => null); // ignore duplicate
  return NextResponse.json({ ok: true, ticker });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ticker = req.nextUrl.searchParams.get("ticker")?.toUpperCase();
  if (!ticker) return NextResponse.json({ error: "ticker query required" }, { status: 400 });
  await db.watchlistEntry.deleteMany({
    where: { watchlistId: id, ticker },
  });
  return NextResponse.json({ ok: true, ticker });
}
