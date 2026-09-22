// POST /api/refresh — trigger a full data refresh (fetch latest OHLCV + macro + news + re-score + live prices)
import { NextRequest, NextResponse } from "next/server";
import { execFileSync } from "child_process";
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "fs";
import { join } from "path";

const STATE_DIR = join(process.cwd(), ".kilo", "state");
const REFRESH_FILE = join(STATE_DIR, "last-refresh.txt");
const REFRESHING_FILE = join(STATE_DIR, "refreshing.lock");
const PRICE_REFRESH_FILE = join(STATE_DIR, "prices-refreshing.lock");

function ensureStateDir() {
  if (!existsSync(STATE_DIR)) {
    import("fs").then((fs) => fs.mkdirSync(STATE_DIR, { recursive: true }));
  }
}

export async function GET(req: NextRequest) {
  let lastRefresh: string | null = null;
  if (existsSync(REFRESH_FILE)) {
    lastRefresh = readFileSync(REFRESH_FILE, "utf-8").trim();
  }
  const isRefreshing = existsSync(REFRESHING_FILE);
  const isPriceRefreshing = existsSync(PRICE_REFRESH_FILE);

  // Read data file timestamps for freshness info
  const dataFile = join(process.cwd(), "src/lib/scoring/seed/real-market-data.json");
  const macroFile = join(process.cwd(), "src/lib/scoring/seed/real-macro-data.json");
  const newsFile = join(process.cwd(), "src/lib/scoring/seed/real-news-data.json");
  const liveFile = join(process.cwd(), "src/lib/scoring/seed/live-prices.json");

  const fetchData = (f: string) => {
    try {
      const d = JSON.parse(readFileSync(f, "utf-8"));
      return { fetched_at: d.fetched_at, source: d.source };
    } catch {
      return null;
    }
  };

  return NextResponse.json({
    lastRefresh,
    isRefreshing,
    isPriceRefreshing,
    dataFreshness: {
      marketData: fetchData(dataFile),
      macroData: fetchData(macroFile),
      newsData: fetchData(newsFile),
      livePrices: fetchData(liveFile),
    },
    autoRefreshInterval: "15 minutes",
    nextScheduledRefresh: lastRefresh
      ? new Date(new Date(lastRefresh).getTime() + 15 * 60 * 1000).toISOString()
      : null,
  });
}

export async function POST(req: NextRequest) {
  const force = req.nextUrl.searchParams.get("force") === "true";

  // Prevent concurrent refreshes
  if (existsSync(REFRESHING_FILE)) {
    return NextResponse.json(
      { ok: false, error: "A refresh is already in progress" },
      { status: 409 }
    );
  }

  // Create lock file
  ensureStateDir();
  writeFileSync(REFRESHING_FILE, new Date().toISOString());

  try {
    // Run the ingestion + scoring pipeline
    const result = execFileSync(
      "python",
      [
        "-m", "scripts.ingestion.ingest_real_data",
        "--full-universe",
        "--output-dir", join(process.cwd(), "src/lib/scoring/seed"),
      ],
      {
        timeout: 600000,
        cwd: process.cwd(),
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
      }
    );

    // Record last-refresh timestamp
    const now = new Date().toISOString();
    writeFileSync(REFRESH_FILE, now);

    return NextResponse.json({
      ok: true,
      refreshedAt: now,
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
    // Remove lock file
    try {
      if (existsSync(REFRESHING_FILE)) {
        unlinkSync(REFRESHING_FILE);
      }
    } catch {
      // ignore
    }
  }
}
