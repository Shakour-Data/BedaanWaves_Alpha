// GET /api/alerts — list all alerts
// POST /api/alerts — create alert { ticker, metric, condition, threshold }
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const alerts = await db.alert.findMany({
    include: { symbol: true },
    orderBy: { createdAt: "desc" },
  });
  // Evaluate triggered status against latest snapshot
  return NextResponse.json({
    alerts: alerts.map((a) => ({
      id: a.id,
      ticker: a.ticker,
      name: a.symbol.name,
      metric: a.metric,
      condition: a.condition,
      threshold: a.threshold,
      active: a.active,
      triggeredAt: a.triggeredAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const ticker = String(body.ticker ?? "").toUpperCase();
  const metric = String(body.metric ?? "overall");
  const condition = String(body.condition ?? "crosses_above");
  const threshold = Number(body.threshold);
  if (!ticker || ticker.length > 10 || !/^[A-Z]+$/.test(ticker)) {
    return NextResponse.json({ error: "Valid ticker required (uppercase, max 10 chars)" }, { status: 400 });
  }
  if (!Number.isFinite(threshold) || Math.abs(threshold) > 1e12) {
    return NextResponse.json({ error: "Valid numeric threshold required" }, { status: 400 });
  }
  const sym = await db.symbol.findUnique({ where: { ticker } });
  if (!sym) return NextResponse.json({ error: "ticker not in universe" }, { status: 404 });
  const validMetrics = ["overall","fundamental","technical","sentiment","risk","macro","ai"];
  if (!validMetrics.includes(metric)) {
    return NextResponse.json({ error: "invalid metric" }, { status: 400 });
  }
  const validConditions = ["crosses_above", "crosses_below", "above", "below", "equals"];
  if (!validConditions.includes(condition)) {
    return NextResponse.json({ error: "invalid condition" }, { status: 400 });
  }
  const alert = await db.alert.create({
    data: { ticker, metric, condition, threshold, active: true },
  });
  return NextResponse.json({ id: alert.id, ok: true });
}
