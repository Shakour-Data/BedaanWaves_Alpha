// POST /api/prices/refresh — trigger live price refresh from yfinance
import { NextRequest, NextResponse } from "next/server";
import { execFileSync } from "child_process";
import { existsSync, writeFileSync, unlinkSync } from "fs";
import { join } from "path";

const STATE_DIR = join(process.cwd(), ".kilo", "state");
const LOCK_FILE = join(STATE_DIR, "prices-refreshing.lock");

export async function POST(req: NextRequest) {
  if (existsSync(LOCK_FILE)) {
    return NextResponse.json(
      { ok: false, error: "Price refresh already in progress" },
      { status: 409 }
    );
  }

  writeFileSync(LOCK_FILE, new Date().toISOString());

  try {
    const script = join(process.cwd(), "scripts", "fetch_live_prices.py");
    if (!existsSync(script)) {
      return NextResponse.json(
        { ok: false, error: "Live price fetch script not available. Use the seed pipeline for full data refresh." },
        { status: 503 }
      );
    }
    const result = execFileSync(
      "python",
      [script],
      {
        timeout: 600000,
        cwd: process.cwd(),
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
      }
    );

    return NextResponse.json({
      ok: true,
      refreshedAt: new Date().toISOString(),
      log: result.split("\n").slice(-20).join("\n"),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  } finally {
    try {
      if (existsSync(LOCK_FILE)) {
        unlinkSync(LOCK_FILE);
      }
    } catch {
      // ignore
    }
  }
}
