// BedaanWaves — real-data store for native market widgets.
// Backed entirely by REAL data (no mock): real-market-data.json (OHLCV +
// fundamentals), real-macro-data.json (real published government statistics),
// real-news-data.json (real headlines). Memoized so the 4 MB market file is
// parsed once per server process instead of on every request.
import { existsSync, readFileSync, statSync } from "fs";
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

const CANDLE_FALLBACK_FILE = join(
  process.cwd(),
  "src/lib/scoring/seed/real-market-data.json.tmp"
);

interface CandleFallbackData {
  per_ticker?: Record<string, { ohlcv?: RealBar[] }>;
}

let candleFallbackCache: {
  size: number;
  mtimeMs: number;
  data: CandleFallbackData;
} | null = null;

function getCandleFallbackData(): CandleFallbackData | null {
  if (!existsSync(CANDLE_FALLBACK_FILE)) return null;

  let fileStats: ReturnType<typeof statSync> | undefined;
  try {
    fileStats = statSync(CANDLE_FALLBACK_FILE);
  } catch {
    return null;
  }

  if (
    candleFallbackCache &&
    candleFallbackCache.size === fileStats.size &&
    candleFallbackCache.mtimeMs === fileStats.mtimeMs
  ) {
    return candleFallbackCache.data;
  }

  try {
    const data = JSON.parse(readFileSync(CANDLE_FALLBACK_FILE, "utf-8")) as CandleFallbackData;
    candleFallbackCache = {
      size: fileStats.size,
      mtimeMs: fileStats.mtimeMs,
      data,
    };
    return data;
  } catch {
    return null;
  }
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
  priorValue: number | null; // previous period's actual
  forecast: number | null; // consensus forecast if available
  changePct: number | null; // % change vs prior
  date: string;
  releaseDate: string | null;
  source: string | null;
  unit: string;
  country: string;
  frequency: string; // "daily", "monthly", "quarterly", "annual"
  type: "market" | "release";
  series: MacroPoint[];
}

// ─── Memoized universe ─────────────────────────────────────────────────────────
let cached: LoadedUniverse | null = null;
let cachedMarketSig = "";
let cachedMacroSig = "";

function fileSig(path: string): string {
  try {
    const st = statSync(path);
    return `${st.size}:${st.mtimeMs}`;
  } catch {
    return "";
  }
}

function reloadIfNeeded() {
  const marketFile = join(process.cwd(), "src/lib/scoring/seed/real-market-data.json");
  const macroFile = join(process.cwd(), "src/lib/scoring/seed/real-macro-data.json");

  const marketSig = fileSig(marketFile);
  const macroSig = fileSig(macroFile);

  // Cache invalid only if both files are unchanged
  if (cached && marketSig === cachedMarketSig && macroSig === cachedMacroSig) {
    return cached;
  }

  const u = loadRealUniverse();
  if (u) {
    cached = u;
    cachedMarketSig = marketSig;
    cachedMacroSig = macroSig;
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
    name: walk.ticker,
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
  const symbol = ticker.toUpperCase();
  const days = RANGE_TO_DAYS[range] ?? 90;
  const universe = getRealUniverse();
  const walk = universe?.walks.get(symbol);
  if (walk?.ohlcv.length) {
    return walk.ohlcv.slice(Math.max(0, walk.ohlcv.length - days));
  }

  const fallback = getCandleFallbackData();
  const bars = fallback?.per_ticker?.[symbol]?.ohlcv ?? [];
  return bars.slice(Math.max(0, bars.length - days));
}

// ── Macro indicators (market-traded + economic releases) ───────────────────────
interface MacroMetaEntry {
  label: string;
  unit: string;
  country: string;
  frequency: string;
  type: MacroIndicator["type"];
}

const MACRO_META: Record<string, MacroMetaEntry> = {
  // ── Major Global Stock Indices ──
  sp500: { label: "S&P 500", unit: "", country: "USA", frequency: "daily", type: "market" },
  nasdaq: { label: "NASDAQ", unit: "", country: "USA", frequency: "daily", type: "market" },
  dow_jones: { label: "Dow Jones", unit: "", country: "USA", frequency: "daily", type: "market" },
  dax: { label: "DAX", unit: "", country: "Germany", frequency: "daily", type: "market" },
  ftse_100: { label: "FTSE 100", unit: "", country: "UK", frequency: "daily", type: "market" },
  nikkei_225: { label: "Nikkei 225", unit: "", country: "Japan", frequency: "daily", type: "market" },
  hang_seng: { label: "Hang Seng", unit: "", country: "Hong Kong", frequency: "daily", type: "market" },
  bse_sensex: { label: "BSE Sensex", unit: "", country: "India", frequency: "daily", type: "market" },
  asx_200: { label: "ASX 200", unit: "", country: "Australia", frequency: "daily", type: "market" },
  aex: { label: "AEX", unit: "", country: "Netherlands", frequency: "daily", type: "market" },
  swiss_market: { label: "Swiss Market", unit: "", country: "Switzerland", frequency: "daily", type: "market" },
  ipc_mexico: { label: "IPC", unit: "", country: "Mexico", frequency: "daily", type: "market" },
  // ── Treasury Yields ──
  treasury_yield_10y: { label: "10Y Treasury", unit: "%", country: "USA", frequency: "daily", type: "market" },
  treasury_yield_30y: { label: "30Y Treasury", unit: "%", country: "USA", frequency: "daily", type: "market" },
  treasury_yield_5y: { label: "5Y Treasury", unit: "%", country: "USA", frequency: "daily", type: "market" },
  treasury_yield_13w: { label: "13W T-Bill", unit: "%", country: "USA", frequency: "weekly", type: "market" },
  dollar_index: { label: "Dollar Index (DXY)", unit: "", country: "USA", frequency: "daily", type: "market" },
  usd_eur: { label: "EUR/USD", unit: "", country: "Global", frequency: "daily", type: "market" },
  usd_gbp: { label: "GBP/USD", unit: "", country: "Global", frequency: "daily", type: "market" },
  usd_jpy: { label: "USD/JPY", unit: "", country: "Global", frequency: "daily", type: "market" },
  oil_price: { label: "Crude Oil (WTI)", unit: "", country: "Global", frequency: "daily", type: "market" },
  gold_price: { label: "Gold (XAU/USD)", unit: "", country: "Global", frequency: "daily", type: "market" },
  vix: { label: "VIX", unit: "", country: "USA", frequency: "daily", type: "market" },
  yield_curve_spread: { label: "Yield Curve (10Y-13W)", unit: "", country: "USA", frequency: "daily", type: "market" },
  // ── US Economic Releases ──
  fed_funds_rate: { label: "Fed Funds Rate", unit: "%", country: "USA", frequency: "monthly", type: "release" },
  real_gdp: { label: "Real GDP", unit: "$B", country: "USA", frequency: "quarterly", type: "release" },
  gdp_growth_yoy: { label: "GDP Growth YoY", unit: "%", country: "USA", frequency: "quarterly", type: "release" },
  gdp_qoq: { label: "GDP QoQ", unit: "%", country: "USA", frequency: "quarterly", type: "release" },
  cpi_index: { label: "CPI Index", unit: "", country: "USA", frequency: "monthly", type: "release" },
  cpi_inflation_yoy: { label: "CPI Inflation YoY", unit: "%", country: "USA", frequency: "monthly", type: "release" },
  core_cpi_index: { label: "Core CPI", unit: "", country: "USA", frequency: "monthly", type: "release" },
  inflation_yoy: { label: "Inflation YoY", unit: "%", country: "USA", frequency: "monthly", type: "release" },
  core_inflation_yoy: { label: "Core Inflation YoY", unit: "%", country: "USA", frequency: "monthly", type: "release" },
  unemployment_rate: { label: "Unemployment Rate", unit: "%", country: "USA", frequency: "monthly", type: "release" },
  nonfarm_payrolls: { label: "Nonfarm Payrolls", unit: "K", country: "USA", frequency: "monthly", type: "release" },
  housing_permits: { label: "Housing Permits", unit: "K", country: "USA", frequency: "monthly", type: "release" },
  industrial_production: { label: "Industrial Production", unit: "", country: "USA", frequency: "monthly", type: "release" },
  consumer_sentiment: { label: "Consumer Sentiment", unit: "", country: "USA", frequency: "monthly", type: "release" },
  capacity_utilization: { label: "Capacity Utilization", unit: "%", country: "USA", frequency: "monthly", type: "release" },
  exports_growth: { label: "Exports Growth YoY", unit: "%", country: "USA", frequency: "annual", type: "release" },
  imports_growth: { label: "Imports Growth YoY", unit: "%", country: "USA", frequency: "annual", type: "release" },
  gdp_deflator_inflation: { label: "GDP Deflator Inflation", unit: "%", country: "USA", frequency: "annual", type: "release" },
  gdp_per_capita: { label: "GDP Per Capita", unit: "$", country: "USA", frequency: "annual", type: "release" },
  gov_spending_gdp: { label: "Govt Spending (% GDP)", unit: "%", country: "USA", frequency: "annual", type: "release" },
  // ── International Currency Pairs (economic indicators for global economies) ──
  gbp_usd: { label: "GBP/USD", unit: "", country: "UK", frequency: "daily", type: "market" },
  usd_jpy_intl: { label: "USD/JPY", unit: "", country: "Japan", frequency: "daily", type: "market" },
  aud_usd: { label: "AUD/USD", unit: "", country: "Australia", frequency: "daily", type: "market" },
  usd_cny: { label: "USD/CNY", unit: "", country: "China", frequency: "daily", type: "market" },
  usd_inr: { label: "USD/INR", unit: "", country: "India", frequency: "daily", type: "market" },
  usd_cad: { label: "USD/CAD", unit: "", country: "Canada", frequency: "daily", type: "market" },
  usd_chf: { label: "USD/CHF", unit: "", country: "Switzerland", frequency: "daily", type: "market" },
  nzd_usd: { label: "NZD/USD", unit: "", country: "New Zealand", frequency: "daily", type: "market" },
  usd_sek: { label: "USD/SEK", unit: "", country: "Sweden", frequency: "daily", type: "market" },
  usd_nok: { label: "USD/NOK", unit: "", country: "Norway", frequency: "daily", type: "market" },
  usd_mxn: { label: "USD/MXN", unit: "", country: "Mexico", frequency: "daily", type: "market" },
  usd_brl: { label: "USD/BRL", unit: "", country: "Brazil", frequency: "daily", type: "market" },
  usd_zar: { label: "USD/ZAR", unit: "", country: "South Africa", frequency: "daily", type: "market" },
  usd_krw: { label: "USD/KRW", unit: "", country: "South Korea", frequency: "daily", type: "market" },
  usd_sgd: { label: "USD/SGD", unit: "", country: "Singapore", frequency: "daily", type: "market" },
  usd_hkd: { label: "USD/HKD", unit: "", country: "Hong Kong", frequency: "daily", type: "market" },
  us_5y_yield: { label: "US 5Y Treasury", unit: "%", country: "USA", frequency: "daily", type: "market" },
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
    const prior2 = points.length > 2 ? points[points.length - 3] : null;
    const changePct =
      prior !== null && prior.value !== 0
        ? ((last.value - prior.value) / prior.value) * 100
        : null;
    out.push({
      key,
      label: meta.label,
      value: last.value,
      prior: prior ? prior.value : null,
      priorValue: prior ? prior.value : null,
      forecast: null, // consensus forecasts not available via free Yahoo/FRED API
      changePct,
      date: last.date,
      releaseDate: last.release_date ?? null,
      source: last.source ?? null,
      unit: meta.unit,
      country: meta.country,
      frequency: meta.frequency,
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
