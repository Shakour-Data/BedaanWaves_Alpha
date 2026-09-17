// BedaanWaves — real-data store for native market widgets.
// Backed entirely by REAL data (no mock): real-market-data.json (OHLCV +
// fundamentals), real-macro-data.json (real published government statistics),
// real-news-data.json (real headlines). Memoized so the 4 MB market file is
// parsed once per server process instead of on every request.
import { readFileSync } from "fs";
import { join } from "path";
import { loadRealUniverse, type LoadedUniverse } from "@/lib/scoring/seed/real-data";

export interface RealBar {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MacroPoint {
  date: string;
  value: number;
  release_date?: string;
  source?: string;
}

export interface MacroIndicator {
  key: string;
  label: string;
  value: number;
  prior: number | null;
  changePct: number | null; // % change vs prior
  date: string;
  releaseDate: string | null;
  source: string | null;
  unit: string;
  type: "market" | "release"; // market = daily-traded asset; release = economic stat
  series: MacroPoint[];
}

// ─── Memoized universe ─────────────────────────────────────────────────────────
let cached: LoadedUniverse | null = null;
let macroMtime = 0;

function reloadIfNeeded() {
  const f = join(process.cwd(), "src/lib/scoring/seed/real-macro-data.json");
  try {
    const st = readFileSync(f, "utf-8").length;
    if (cached && st === macroMtime) return cached;
  } catch {
    // fallback: just return whatever we have
  }
  const u = loadRealUniverse();
  if (u) {
    cached = u;
    macroMtime = readFileSync(f, "utf-8").length;
  }
  return cached;
}

export function getRealUniverse(): LoadedUniverse | null {
  if (cached) return cached;
  return reloadIfNeeded();
}

// ─── Market metadata ───────────────────────────────────────────────────────────
export interface TickerMeta {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  marketCap: number;
  beta: number;
  trailingPE: number | null;
  priceToBook: number | null;
  dividendYield: number | null;
  roe: number | null;
  marketCapUsd: number;
}

export function getTickerMeta(ticker: string): TickerMeta | null {
  const u = getRealUniverse();
  if (!u) return null;
  const walk = u.walks.get(ticker.toUpperCase());
  if (!walk) return null;
  const i = walk.info;
  return {
    ticker: walk.ticker,
    name: i?.sector ? walk.ticker : walk.ticker,
    sector: walk.sector,
    industry: walk.industry,
    marketCap: i?.marketCap ?? walk.marketCap,
    beta: walk.beta,
    trailingPE: i?.trailingPE ?? null,
    priceToBook: i?.priceToBook ?? null,
    dividendYield: i?.dividendYield != null ? i.dividendYield * 100 : null,
    roe: i?.returnOnEquity != null ? i.returnOnEquity * 100 : null,
    marketCapUsd: i?.marketCap ?? walk.marketCap,
  };
}

// ── Candles (real OHLCV) ───────────────────────────────────────────────────────
const RANGE_TO_DAYS: Record<string, number> = {
  "1W": 5,
  "1M": 30,
  "3M": 90,
  "6M": 180,
  "1Y": 365,
  MAX: 999999,
};

export function getCandles(ticker: string, range = "3M"): RealBar[] {
  const u = getRealUniverse();
  if (!u) return [];
  const walk = u.walks.get(ticker.toUpperCase());
  if (!walk) return [];
  const days = RANGE_TO_DAYS[range] ?? 90;
  const bars = walk.ohlcv;
  return bars.length
    ? bars.slice(Math.max(0, bars.length - days))
    : [];
}

// ── Macro indicators (market-traded + economic releases) ───────────────────────
const MACRO_META: Record<string, { label: string; unit: string; type: MacroIndicator["type"] }> =
{
  treasury_yield_10y: { label: "10Y Treasury Yield", unit: "%", type: "market" },
  treasury_yield_30y: { label: "30Y Treasury Yield", unit: "%", type: "market" },
  treasury_yield_5y: { label: "5Y Treasury Yield", unit: "%", type: "market" },
  treasury_yield_13w: { label: "13W T-Bill Yield", unit: "%", type: "market" },
  dollar_index: { label: "Dollar Index (DXY)", unit: "", type: "market" },
  usd_eur: { label: "EUR/USD", unit: "", type: "market" },
  usd_gbp: { label: "GBP/USD", unit: "", type: "market" },
  usd_jpy: { label: "USD/JPY", unit: "", type: "market" },
  oil_price: { label: "Crude Oil (WTI)", unit: "", type: "market" },
  gold_price: { label: "Gold (XAU/USD)", unit: "", type: "market" },
  vix: { label: "VIX (Volatility)", unit: "", type: "market" },
  yield_curve_spread: { label: "Yield Curve Spread (10y-13w)", unit: "", type: "market" },
  fed_funds_rate: { label: "Fed Funds Rate", unit: "%", type: "release" },
  real_gdp: { label: "Real GDP", unit: "$B", type: "release" },
  gdp_growth_yoy: { label: "GDP Growth (YoY)", unit: "%", type: "release" },
  gdp_qoq: { label: "GDP (QoQ)", unit: "%", type: "release" },
  cpi_index: { label: "CPI Index", unit: "", type: "release" },
  cpi_inflation_yoy: { label: "CPI Inflation (YoY)", unit: "%", type: "release" },
  core_cpi_index: { label: "Core CPI", unit: "", type: "release" },
  inflation_yoy: { label: "Inflation (YoY)", unit: "%", type: "release" },
  core_inflation_yoy: { label: "Core Inflation (YoY)", unit: "%", type: "release" },
  unemployment_rate: { label: "Unemployment Rate", unit: "%", type: "release" },
  nonfarm_payrolls: { label: "Nonfarm Payrolls", unit: "K", type: "release" },
  housing_permits: { label: "Housing Permits", unit: "K", type: "release" },
  industrial_production: { label: "Industrial Production", unit: "", type: "release" },
  consumer_sentiment: { label: "Consumer Sentiment", unit: "", type: "release" },
  capacity_utilization: { label: "Capacity Utilization", unit: "%", type: "release" },
  exports_growth: { label: "Exports Growth (YoY)", unit: "%", type: "release" },
  imports_growth: { label: "Imports Growth (YoY)", unit: "%", type: "release" },
  gdp_deflator_inflation: { label: "GDP Deflator Inflation", unit: "%", type: "release" },
  gdp_per_capita: { label: "GDP Per Capita", unit: "$", type: "release" },
  gov_spending_gdp: { label: "Govt Spending (% of GDP)", unit: "%", type: "release" },
};

export function getMacroIndicators(): MacroIndicator[] {
  const u = getRealUniverse();
  if (!u) return [];
  const out: MacroIndicator[] = [];
  for (const [key, points] of Object.entries(u.macro)) {
    if (!Array.isArray(points) || points.length === 0) continue;
    const meta = MACRO_META[key];
    if (!meta) continue;
    points.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const last = points[points.length - 1];
    const prior = points.length > 1 ? points[points.length - 2] : null;
    const changePct =
      prior !== null && prior.value !== 0
        ? ((last.value - prior.value) / prior.value) * 100
        : null;
    out.push({
      key,
      label: meta.label,
      value: last.value,
      prior: prior ? prior.value : null,
      changePct,
      date: last.date,
      releaseDate: last.release_date ?? null,
      source: last.source ?? null,
      unit: meta.unit,
      type: meta.type,
      series: points,
    });
  }
  return out.sort((a, b) => {
    if (a.type !== b.type) return a.type === "release" ? 1 : -1;
    return b.date.localeCompare(a.date);
  });
}

export function getEconomicReleases(): MacroIndicator[] {
  return getMacroIndicators().filter((i) => i.type === "release");
}

export function getMarketIndicators(): MacroIndicator[] {
  return getMacroIndicators().filter((i) => i.type === "market");
}

export interface TickerLatest {
  ticker: string;
  name: string;
  price: number;
  priceChange: number;
  volume: number;
  marketCap: number;
  grade: string;
  overall: number;
}

export function getTickers(): { ticker: string; name: string }[] {
  const u = getRealUniverse();
  if (!u) return [];
  return u.tickers.map((t) => ({ ticker: t, name: t }));
}
