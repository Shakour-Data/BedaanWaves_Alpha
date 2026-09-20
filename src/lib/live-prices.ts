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

function loadLivePrices(): LivePricesData | null {
  try {
    const st = fs.statSync(LIVE_FILE);
    if (cached && cachedMtime === st.mtimeMs) return cached;
    const data = JSON.parse(fs.readFileSync(LIVE_FILE, "utf-8")) as LivePricesData;
    cached = data;
    cachedMtime = st.mtimeMs;
    return data;
  } catch {
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
