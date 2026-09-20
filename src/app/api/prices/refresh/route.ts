// POST /api/prices/refresh — trigger live price refresh from yfinance
import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import { existsSync, writeFileSync } from "fs";
import { join } from "path";

const LOCK_FILE = "/tmp/bedaan-prices-refreshing.lock";

export async function POST(req: NextRequest) {
  if (existsSync(LOCK_FILE)) {
    return NextResponse.json(
      { ok: false, error: "Price refresh already in progress" },
      { status: 409 }
    );
  }

  writeFileSync(LOCK_FILE, new Date().toISOString());

  try {
    const result = execSync(
      `node ${join(process.cwd(), "scripts/fetch_live_prices.mjs")} 2>&1`,
      {
        timeout: 600000,
        cwd: process.cwd(),
        encoding: "utf-8",
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
      execSync(`rm -f ${LOCK_FILE}`);
    } catch {
      // ignore
    }
  }
}
