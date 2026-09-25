// POST /api/seed — trigger a re-seed (force=true). Idempotent skip otherwise.
import { NextRequest, NextResponse } from "next/server";
import { seedIfNeeded } from "@/lib/scoring/seed/orchestrator";

export async function POST(req: NextRequest) {
  const force = req.nextUrl.searchParams.get("force") === "true";
  const res = await seedIfNeeded({ force });
  return NextResponse.json({ ok: true, ...res });
}

export async function GET(req: NextRequest) {
  const force = req.nextUrl.searchParams.get("force") === "true";
  const res = await seedIfNeeded({ force });
  return NextResponse.json({ ok: true, ...res });
}
