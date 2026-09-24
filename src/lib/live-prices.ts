// BedaanWaves — live price utilities
// Reads from live-prices.json (fetched every 15 minutes via fetch_live_prices.mjs)

import fs from "fs";
import path from "path";

const LIVE_FILE = path.join(
  process.cwd(),
  "src/lib/scoring/seed/live-prices.json"
);

export interface LivePrice {
  price: number;
  change: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  timestamp: string;
}

export interface LivePricesData {
  fetched_at: string;
  market_status: "OPEN" | "CLOSED";
  timestamp: string;
  tickers: Record<string, LivePrice>;
}

let cached: LivePricesData | null = null;
let cachedMtime = 0;

/**
 * yfinance sometimes emits raw `NaN` / `Infinity` values which are NOT valid JSON.
 * `JSON.parse` throws on them, so we sanitize the raw text before parsing.
 * This keeps the app resilient even if an older file with bad values is present.
 */
function sanitizeJsonText(text: string): string {
  return text
    .replace(/:\s*NaN\b/g, ": null")
    .replace(/:\s*Infinity\b/g, ": null")
    .replace(/:\s*-Infinity\b/g, ": null");
}

function loadLivePrices(): LivePricesData | null {
  try {
    const st = fs.statSync(LIVE_FILE);
    if (cached && cachedMtime === st.mtimeMs) return cached;
    const raw = fs.readFileSync(LIVE_FILE, "utf-8");
    const data = JSON.parse(sanitizeJsonText(raw)) as LivePricesData;
    cached = data;
    cachedMtime = st.mtimeMs;
    return data;
  } catch (e) {
    // File missing, unreadable, or malformed — degrade gracefully.
    console.error("[live-prices] load failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

export function getLivePrices(): LivePricesData | null {
  if (cached) return cached;
  return loadLivePrices();
}

export function getLivePrice(ticker: string): LivePrice | null {
  const data = getLivePrices();
  if (!data) return null;
  return data.tickers[ticker.toUpperCase()] ?? null;
}

export function isMarketOpen(): boolean {
  const data = getLivePrices();
  if (!data) return false;
  return data.market_status === "OPEN";
}

export function getLivePriceForRankings(
  rows: Array<{ ticker: string; price: number; priceChange: number }>
): Array<{ ticker: string; price: number; priceChange: number; livePrice?: number; livePriceChange?: number }> {
  const live = getLivePrices();
  if (!live) return rows.map((r) => ({ ...r }));
  return rows.map((r) => {
    const lp = live.tickers[r.ticker];
    if (!lp) return { ...r };
    return {
      ...r,
      livePrice: lp.price,
      livePriceChange: lp.change,
    };
  });
}
