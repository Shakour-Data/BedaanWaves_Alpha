// GET /api/watchlists — list all watchlists + entries
// POST /api/watchlists — create a watchlist { name, tickers?: string[] }
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const lists = await db.watchlist.findMany({
    include: {
      entries: { include: { symbol: true }, orderBy: { addedAt: "desc" } },
    },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({
    watchlists: lists.map((w) => ({
      id: w.id,
      name: w.name,
      createdAt: w.createdAt.toISOString(),
      updatedAt: w.updatedAt.toISOString(),
      entries: w.entries.map((e) => ({
        ticker: e.ticker,
        name: e.symbol.name,
        sector: e.symbol.sector,
        addedAt: e.addedAt.toISOString(),
      })),
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const tickers: string[] = Array.isArray(body.tickers) ? body.tickers : [];
  // Validate tickers exist
  if (tickers.length) {
    const existing = await db.symbol.findMany({
      where: { ticker: { in: tickers.map((t) => t.toUpperCase()) } },
      select: { ticker: true },
    });
    const valid = new Set(existing.map((s) => s.ticker));
    const created = await db.watchlist.create({
      data: {
        name,
        entries: {
          create: tickers
            .filter((t) => valid.has(t.toUpperCase()))
            .map((t) => ({ ticker: t.toUpperCase() })),
        },
      },
      include: { entries: true },
    });
    return NextResponse.json({ id: created.id, name: created.name, entryCount: created.entries.length });
  }
  const created = await db.watchlist.create({ data: { name } });
  return NextResponse.json({ id: created.id, name: created.name, entryCount: 0 });
}
