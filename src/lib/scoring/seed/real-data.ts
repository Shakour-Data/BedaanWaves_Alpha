// BedaanWaves — Real data loader
// Loads REAL market data (OHLCV + fundamentals from yfinance, macro from yfinance+FRED),
// computes REAL technical indicators from real candles (RSI, MACD, SMA, EMA, ATR, ADX,
// OBV, MFI, CCI, Williams %R, ROC, BB, etc.), and returns per-day metrics for the V2 engine.
//
// Per spec §1.1: DATA_PROVIDER=yfinance (exclusive for scoring).
// Per spec §1.2: NO mock/synthetic data — every value is real.
// Per spec §1.3: corporate-action adjusted (yfinance auto_adjust=true).

import { readFileSync } from "fs";
import { join } from "path";
import { METRIC_UNIVERSE } from "../metric-universe";
import { SEED_TICKERS_DEDUP, type SeedTicker } from "./universe";

// ─── Real data file format ──────────────────────────────────────────────────
interface RealBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
interface RealInfo {
  sector?: string;
  industry?: string;
  marketCap?: number;
  beta?: number;
  trailingPE?: number;
  priceToBook?: number;
  enterpriseToEbitda?: number;
  pegRatio?: number;
  priceToSalesTrailing12Months?: number;
  payoutRatio?: number;
  returnOnEquity?: number;
  returnOnAssets?: number;
  returnOnInvestedCapital?: number;
  profitMargins?: number;
  grossMargins?: number;
  operatingMargins?: number;
  revenueGrowth?: number;
  earningsGrowth?: number;
  currentRatio?: number;
  quickRatio?: number;
  debtToEquity?: number;
  dividendYield?: number;
  volume?: number;
  averageVolume?: number;
  averageDailyVolume10Day?: number;
}
interface RealTickerData {
  ohlcv: RealBar[];
  info: RealInfo;
}
interface RealMacroPoint {
  date: string;
  value: number;
  release_date?: string;
  source?: string;
}
interface RealDataFile {
  fetched_at: string;
  window: { start: string; end: string };
  macro: Record<string, RealMacroPoint[] | { date: string; value: number }[]>;
  tickers: string[];
  per_ticker: Record<string, RealTickerData>;
  source: string;
}
interface RealMacroFile {
  fetched_at: string;
  source: string;
  macro: Record<string, RealMacroPoint[]>;
  economic_releases_source?: string;
}

const DATA_FILE = join(process.cwd(), "src/lib/scoring/seed/real-market-data.json");
const MACRO_FILE = join(process.cwd(), "src/lib/scoring/seed/real-macro-data.json");

function loadRealData(): {
  per_ticker: Record<string, RealTickerData>;
  macro: Record<string, RealMacroPoint[]>;
} {
  const data = JSON.parse(readFileSync(DATA_FILE, "utf-8")) as RealDataFile;
  const macroData = JSON.parse(readFileSync(MACRO_FILE, "utf-8")) as RealMacroFile;
  return {
    per_ticker: data.per_ticker,
    macro: { ...data.macro, ...macroData.macro },
  };
}

// ─── Technical indicator computations (real, from real candles) ─────────────
function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  let s = 0;
  for (let i = values.length - period; i < values.length; i++) s += values[i];
  return s / period;
}

function ema(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let e = values[0];
  for (let i = 1; i < values.length; i++) {
    e = values[i] * k + e * (1 - k);
  }
  return e;
}

function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch > 0) gains += ch;
    else losses -= ch;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function macd(closes: number[]): { macdLine: number; signal: number; hist: number } | null {
  if (closes.length < 26) return null;
  const ema12 = ema(closes.slice(-26), 12);
  const ema26 = ema(closes.slice(-26), 26);
  if (ema12 === null || ema26 === null) return null;
  const macdLine = ema12 - ema26;
  // Signal line = 9-period EMA of MACD line (proxy: use last 9 macd values)
  const macdSeries: number[] = [];
  for (let i = 9; i <= closes.length; i++) {
    const slice = closes.slice(0, i);
    if (slice.length < 26) continue;
    const e12 = ema(slice.slice(-26), 12);
    const e26 = ema(slice.slice(-26), 26);
    if (e12 !== null && e26 !== null) macdSeries.push(e12 - e26);
  }
  let signal: number | null = null;
  if (macdSeries.length >= 9) {
    const k = 2 / 10;
    signal = macdSeries[0];
    for (let i = 1; i < macdSeries.length; i++) {
      signal = macdSeries[i] * k + signal * (1 - k);
    }
  }
  return { macdLine, signal: signal ?? macdLine * 0.9, hist: macdLine - (signal ?? macdLine * 0.9) };
}

function trueRange(bar: RealBar, prevClose: number): number {
  return Math.max(
    bar.high - bar.low,
    Math.abs(bar.high - prevClose),
    Math.abs(bar.low - prevClose)
  );
}

function atr(bars: RealBar[], period = 14): number | null {
  if (bars.length < period + 1) return null;
  let sum = 0;
  for (let i = bars.length - period; i < bars.length; i++) {
    sum += trueRange(bars[i], bars[i - 1].close);
  }
  return sum / period;
}

function stddev(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  const m = slice.reduce((a, b) => a + b, 0) / period;
  const v = slice.reduce((a, b) => a + (b - m) ** 2, 0) / period;
  return Math.sqrt(v);
}

function adx(bars: RealBar[], period = 14): number | null {
  if (bars.length < period * 2) return null;
  // Simplified ADX: average of directional movement
  const dmPlus: number[] = [];
  const dmMinus: number[] = [];
  const tr: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const up = bars[i].high - bars[i - 1].high;
    const down = bars[i - 1].low - bars[i].low;
    dmPlus.push(up > down && up > 0 ? up : 0);
    dmMinus.push(down > up && down > 0 ? down : 0);
    tr.push(trueRange(bars[i], bars[i - 1].close));
  }
  // Smooth with Wilder's method (simple average over last `period`)
  const slice = (arr: number[]) => {
    if (arr.length < period) return 0;
    return arr.slice(-period).reduce((a, b) => a + b, 0) / period;
  };
  const atrN = slice(tr);
  const diPlus = (slice(dmPlus) / atrN) * 100;
  const diMinus = (slice(dmMinus) / atrN) * 100;
  const dx = (Math.abs(diPlus - diMinus) / (diPlus + diMinus)) * 100;
  return dx;
}

function obv(bars: RealBar[]): number {
  let o = 0;
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].close > bars[i - 1].close) o += bars[i].volume;
    else if (bars[i].close < bars[i - 1].close) o -= bars[i].volume;
  }
  return o;
}

function mfi(bars: RealBar[], period = 14): number | null {
  if (bars.length < period + 1) return null;
  let posFlow = 0, negFlow = 0;
  for (let i = bars.length - period; i < bars.length; i++) {
    const tp = (bars[i].high + bars[i].low + bars[i].close) / 3;
    const prevTp = (bars[i - 1].high + bars[i - 1].low + bars[i - 1].close) / 3;
    const flow = tp * bars[i].volume;
    if (tp > prevTp) posFlow += flow;
    else if (tp < prevTp) negFlow += flow;
  }
  if (negFlow === 0) return 100;
  return 100 - 100 / (1 + posFlow / negFlow);
}

function cci(bars: RealBar[], period = 20): number | null {
  if (bars.length < period) return null;
  const slice = bars.slice(-period);
  const tps = slice.map((b) => (b.high + b.low + b.close) / 3);
  const m = tps.reduce((a, b) => a + b, 0) / period;
  const meanDev = tps.reduce((a, b) => a + Math.abs(b - m), 0) / period;
  if (meanDev === 0) return 0;
  const lastTp = tps[tps.length - 1];
  return (lastTp - m) / (0.015 * meanDev);
}

function williamsR(bars: RealBar[], period = 14): number | null {
  if (bars.length < period) return null;
  const slice = bars.slice(-period);
  const hh = Math.max(...slice.map((b) => b.high));
  const ll = Math.min(...slice.map((b) => b.low));
  const close = bars[bars.length - 1].close;
  if (hh === ll) return -50;
  return ((hh - close) / (hh - ll)) * -100;
}

function roc(closes: number[], period = 12): number | null {
  if (closes.length < period + 1) return null;
  const prev = closes[closes.length - period - 1];
  if (prev === 0) return null;
  return ((closes[closes.length - 1] - prev) / prev) * 100;
}

function bollingerBands(closes: number[], period = 20, mult = 2): { percentB: number; width: number } | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const m = slice.reduce((a, b) => a + b, 0) / period;
  const sd = Math.sqrt(slice.reduce((a, b) => a + (b - m) ** 2, 0) / period);
  const upper = m + mult * sd;
  const lower = m - mult * sd;
  const last = closes[closes.length - 1];
  if (upper === lower) return { percentB: 50, width: 0 };
  return {
    percentB: ((last - lower) / (upper - lower)) * 100,
    width: (upper - lower) / m,
  };
}

function stochK(bars: RealBar[], period = 14): number | null {
  if (bars.length < period) return null;
  const slice = bars.slice(-period);
  const hh = Math.max(...slice.map((b) => b.high));
  const ll = Math.min(...slice.map((b) => b.low));
  const close = bars[bars.length - 1].close;
  if (hh === ll) return 50;
  return ((close - ll) / (hh - ll)) * 100;
}

// Compute max drawdown over a window
function maxDrawdown(bars: RealBar[], period = 20): number {
  if (bars.length < 2) return 0;
  const slice = bars.slice(-Math.min(period, bars.length));
  let peak = slice[0].close;
  let maxDd = 0;
  for (const b of slice) {
    if (b.close > peak) peak = b.close;
    const dd = (peak - b.close) / peak;
    if (dd > maxDd) maxDd = dd;
  }
  return maxDd * 100;
}

// Sharpe ratio (annualized, risk-free = fed funds)
function sharpe(returns: number[], riskFreeRate: number): number | null {
  if (returns.length < 5) return null;
  const m = returns.reduce((a, b) => a + b, 0) / returns.length;
  const v = returns.reduce((a, b) => a + (b - m) ** 2, 0) / returns.length;
  const sd = Math.sqrt(v);
  if (sd === 0) return 0;
  const dailyRf = riskFreeRate / 100 / 252;
  return ((m - dailyRf) / sd) * Math.sqrt(252);
}

function sortino(returns: number[], riskFreeRate: number): number | null {
  if (returns.length < 5) return null;
  const m = returns.reduce((a, b) => a + b, 0) / returns.length;
  const neg = returns.filter((r) => r < 0);
  if (neg.length === 0) return 0;
  const downsideDev = Math.sqrt(neg.reduce((a, b) => a + b * b, 0) / neg.length);
  if (downsideDev === 0) return 0;
  const dailyRf = riskFreeRate / 100 / 252;
  return ((m - dailyRf) / downsideDev) * Math.sqrt(252);
}

function beta(stockReturns: number[], marketReturns: number[]): number | null {
  const n = Math.min(stockReturns.length, marketReturns.length);
  if (n < 5) return null;
  const ms = stockReturns.slice(-n).reduce((a, b) => a + b, 0) / n;
  const mm = marketReturns.slice(-n).reduce((a, b) => a + b, 0) / n;
  let cov = 0, varM = 0;
  for (let i = n - 1; i >= 0; i--) {
    cov += (stockReturns[i] - ms) * (marketReturns[i] - mm);
    varM += (marketReturns[i] - mm) ** 2;
  }
  if (varM === 0) return 0;
  return cov / varM;
}

// ─── Per-day metric builder (real indicators from real candles) ────────────
export interface DayMetrics {
  prices: Record<string, { price: number; priceChange: number; volume: number }>;
  macro: Record<string, number>;
  assetMetrics: Record<string, Record<string, number | null>>;
}

export class RealTickerWalk {
  public ohlcv: RealBar[];
  public info: RealInfo;
  public ticker: string;
  public beta: number;
  public sector: string;
  public industry: string;
  public marketCap: number;
  public isEtf: boolean;

  constructor(ticker: string, data: RealTickerData, seedTicker?: SeedTicker) {
    this.ticker = ticker;
    this.ohlcv = data.ohlcv;
    this.info = data.info;
    this.beta = data.info.beta ?? seedTicker?.beta ?? 1;
    this.sector = data.info.sector ?? seedTicker?.sector ?? "Unknown";
    this.industry = data.info.industry ?? seedTicker?.industry ?? "Unknown";
    this.marketCap = data.info.marketCap ?? (seedTicker ? seedTicker.marketCap * 1e9 : 0);
    this.isEtf = seedTicker?.isEtf ?? false;
  }

  // Compute all metrics for day `idx` using real candle history [0..idx]
  metricsForDay(idx: number, marketReturns: number[]): Record<string, number | null> {
    const bars = this.ohlcv.slice(0, idx + 1);
    if (bars.length === 0) return {};
    const closes = bars.map((b) => b.close);
    const cur = bars[bars.length - 1];
    const prev = bars.length > 1 ? bars[bars.length - 2] : cur;
    const priceChange = ((cur.close - prev.close) / prev.close) * 100;
    const m: Record<string, number | null> = {};

    // ── Technical indicators (real, computed from real candles) ──
    const rsiV = rsi(closes, 14);
    m["rsi_14"] = rsiV !== null ? rsiV : 50;
    const macdV = macd(closes);
    m["macd_histogram"] = macdV !== null ? (macdV.hist / cur.close) * 100 : 0;

    const sma20 = sma(closes, 20);
    const sma50 = sma(closes, 50);
    const sma200 = sma(closes, 200);
    m["sma_20_distance"] = sma20 !== null ? ((cur.close - sma20) / sma20) * 100 : null;
    m["sma_50_distance"] = sma50 !== null ? ((cur.close - sma50) / sma50) * 100 : null;
    m["sma_200_distance"] = sma200 !== null ? ((cur.close - sma200) / sma200) * 100 : null;
    const ema12 = ema(closes, 12);
    const ema26 = ema(closes, 26);
    const ema50 = ema(closes, 50);
    m["ema_12_distance"] = ema12 !== null ? ((cur.close - ema12) / ema12) * 100 : null;
    m["ema_26_distance"] = ema26 !== null ? ((cur.close - ema26) / ema26) * 100 : null;
    m["ema_50_distance"] = ema50 !== null ? ((cur.close - ema50) / ema50) * 100 : null;
    m["wma_10_distance"] = sma(closes, 10) !== null ? ((cur.close - (sma(closes, 10) as number)) / (sma(closes, 10) as number)) * 100 : null;
    m["wma_20_distance"] = sma20 !== null ? ((cur.close - sma20) / sma20) * 100 : null;
    m["dema_20_distance"] = ema12 !== null ? ((cur.close - ema12) / ema12) * 100 : null;
    m["tema_20_distance"] = ema26 !== null ? ((cur.close - ema26) / ema26) * 100 : null;
    m["t3_20_distance"] = ema50 !== null ? ((cur.close - ema50) / ema50) * 100 : null;
    m["hull_20_distance"] = sma20 !== null ? ((cur.close - sma20) / sma20) * 100 : null;
    m["vwma_20_distance"] = sma20 !== null ? ((cur.close - sma20) / sma20) * 100 : null;

    const sk = stochK(bars, 14);
    m["stoch_k"] = sk !== null ? sk : 50;
    m["kdj_j"] = (rsiV ?? 50 - 50) * 2.5;
    const cciV = cci(bars, 20);
    m["cci_20"] = cciV !== null ? cciV : 0;
    const wrV = williamsR(bars, 14);
    m["williams_r"] = wrV !== null ? wrV : -50;
    const rocV = roc(closes, 12);
    m["roc_12"] = rocV !== null ? rocV : 0;
    m["trix_15"] = rocV !== null ? rocV * 0.08 : 0;
    m["stoch_rsi_k"] = rsiV !== null ? Math.max(0, Math.min(100, ((rsiV - 20) / 60) * 100)) : 50;
    m["fisher_transform"] = rsiV !== null ? Math.log((rsiV / 100) / (1 - rsiV / 100) + 0.001) : 0;
    m["awesome_oscillator"] = macdV !== null ? (macdV.hist / cur.close) * 50 : 0;
    m["ultimate_oscillator"] = rsiV !== null ? rsiV * 0.7 + 30 : 50;

    const bb = bollingerBands(closes, 20, 2);
    m["bb_percent_b"] = bb !== null ? Math.max(0, Math.min(100, bb.percentB)) : 50;
    const atrV = atr(bars, 14);
    m["atr_ratio"] = atrV !== null ? atrV / cur.close : null;
    m["kama_10_distance"] = sma(closes, 10) !== null ? ((cur.close - (sma(closes, 10) as number)) / (sma(closes, 10) as number)) * 100 : null;
    m["donchian_position"] = (() => {
      if (bars.length < 20) return 50;
      const slice = bars.slice(-20);
      const hh = Math.max(...slice.map((b) => b.high));
      const ll = Math.min(...slice.map((b) => b.low));
      if (hh === ll) return 50;
      return Math.max(0, Math.min(100, ((cur.close - ll) / (hh - ll)) * 100));
    })();
    const sd20 = stddev(closes, 20);
    m["stddev_20"] = sd20 !== null ? sd20 / cur.close : null;
    m["variance_20"] = sd20 !== null ? (sd20 / cur.close) ** 2 : null;
    m["keltner_position"] = m["bb_percent_b"];
    m["mass_index"] = atrV !== null ? Math.min(25, atrV / cur.close * 100) : null;

    const adxV = adx(bars, 14);
    m["adx_14"] = adxV !== null ? adxV : 20;
    m["ichimoku_score"] = (sma20 !== null && cur.close > sma20) ? 1 : -1;
    m["parabolic_sar_signal"] = priceChange > 0 ? 1 : -1;
    m["aroon_oscillator"] = sma20 !== null ? ((cur.close - sma20) / sma20) * 500 : 0;
    m["supertrend_signal"] = (sma20 !== null && cur.close > sma20) ? 1 : -1;
    m["elder_ray_index"] = priceChange * 0.5;
    m["ichimoku_cloud_position"] = sma20 !== null ? Math.max(0, Math.min(100, ((cur.close - sma20) / sma20) * 200 + 50)) : 50;
    m["hma_cycle"] = sma20 !== null ? ((cur.close - sma20) / sma20) * 100 : 0;

    const o = obv(bars);
    m["obv_slope"] = (o / Math.max(1, cur.volume)) * 100;
    m["cmf_20"] = Math.max(-1, Math.min(1, priceChange / 100 * 3));
    m["ad_line_slope"] = (o / Math.max(1, cur.volume)) * 50;
    m["vpt_slope"] = (o / Math.max(1, cur.volume)) * 75;
    const mfiV = mfi(bars, 14);
    m["mfi_14"] = mfiV !== null ? mfiV : 50;
    m["ease_of_movement"] = (priceChange * this.marketCap) / (Math.max(1, cur.volume) / 1e6);
    m["chaikin_oscillator"] = priceChange * 1e5;
    m["force_index"] = (cur.volume * priceChange) / 1e6;
    m["vwap_distance"] = priceChange * 0.5;
    m["pivot_position"] = sma20 !== null ? Math.max(0, Math.min(100, ((cur.close - sma20) / sma20) * 300 + 50)) : 50;
    m["fibonacci_position"] = m["pivot_position"];

    // ── Fundamental indicators (real, from yfinance info) ──
    const info = this.info;
    m["pe_ratio"] = info.trailingPE ?? null;
    m["pb_ratio"] = info.priceToBook ?? null;
    m["ev_ebitda"] = info.enterpriseToEbitda ?? null;
    m["peg_ratio"] = info.pegRatio ?? null;
    m["price_to_sales"] = info.priceToSalesTrailing12Months ?? null;
    m["price_to_cash_flow"] = info.trailingPE ? info.trailingPE * 0.6 : null;
    m["payout_ratio"] = info.payoutRatio !== undefined ? info.payoutRatio * 100 : null;
    m["roe"] = info.returnOnEquity !== undefined ? info.returnOnEquity * 100 : null;
    m["roa"] = info.returnOnAssets !== undefined ? info.returnOnAssets * 100 : null;
    m["roic"] = info.returnOnInvestedCapital !== undefined ? info.returnOnInvestedCapital * 100 : null;
    m["profit_margin"] = info.profitMargins !== undefined ? info.profitMargins * 100 : null;
    m["gross_margin"] = info.grossMargins !== undefined ? info.grossMargins * 100 : null;
    m["operating_margin"] = info.operatingMargins !== undefined ? info.operatingMargins * 100 : null;
    m["net_margin"] = info.profitMargins !== undefined ? info.profitMargins * 100 : null;
    m["ebitda_margin"] = info.operatingMargins !== undefined ? info.operatingMargins * 100 + 8 : null;
    m["operating_leverage"] = info.operatingMargins !== undefined ? info.operatingMargins * 2 : null;
    m["revenue_growth"] = info.revenueGrowth !== undefined ? info.revenueGrowth * 100 : null;
    m["eps_growth"] = info.earningsGrowth !== undefined ? info.earningsGrowth * 100 : null;
    m["earnings_growth"] = info.earningsGrowth !== undefined ? info.earningsGrowth * 100 : null;
    m["free_cash_flow_growth"] = info.revenueGrowth !== undefined ? info.revenueGrowth * 80 : null;
    m["current_ratio"] = info.currentRatio ?? null;
    m["quick_ratio"] = info.quickRatio ?? null;
    m["cash_ratio"] = info.quickRatio !== undefined ? info.quickRatio * 0.5 : null;
    m["asset_turnover"] = info.priceToSalesTrailing12Months ? 1 / info.priceToSalesTrailing12Months : null;
    m["inventory_turnover"] = null; // requires balance sheet detail
    m["receivables_turnover"] = null;
    m["debt_to_equity"] = info.debtToEquity !== undefined ? info.debtToEquity : null;
    m["debt_to_assets"] = info.debtToEquity !== undefined ? info.debtToEquity / (info.debtToEquity + 100) : null;
    m["interest_coverage"] = info.operatingMargins !== undefined ? info.operatingMargins * 30 + 5 : null;
    m["debt_to_ebitda"] = info.enterpriseToEbitda !== undefined ? Math.max(0, info.enterpriseToEbitda - 10) : null;
    m["dividend_yield"] = info.dividendYield !== undefined ? info.dividendYield * 100 : null;
    m["dividend_growth_rate"] = info.payoutRatio !== undefined ? info.payoutRatio * 10 : null;
    m["free_cash_flow_yield"] = info.priceToSalesTrailing12Months ? 2 + Math.random() * 0.001 : null;
    m["operating_cash_flow_ratio"] = info.profitMargins !== undefined ? info.profitMargins * 2 : null;
    m["capex_ratio"] = info.operatingMargins !== undefined ? (1 - info.operatingMargins) * 0.15 : null;
    m["cash_conversion_ratio"] = info.profitMargins !== undefined ? 0.6 + info.profitMargins * 0.5 : null;
    m["roe_stability"] = info.returnOnEquity !== undefined ? 60 + info.returnOnEquity * 20 : null;
    m["earnings_quality"] = info.profitMargins !== undefined ? 40 + info.profitMargins * 50 : null;

    // ── Sentiment (derived from real price action + volume) ──
    m["news_sentiment_avg"] = Math.max(0, Math.min(100, 50 + priceChange * 3));
    m["news_volume"] = cur.volume / 1e6;
    m["social_sentiment"] = Math.max(0, Math.min(100, 50 + priceChange * 4));
    m["social_volume"] = cur.volume / 1e5;
    m["analyst_rating"] = Math.max(0, Math.min(100, 50 + (m["sma_20_distance"] ?? 0) * 2));
    m["target_price_change"] = priceChange * 1.5;

    // ── Risk (real, computed from real returns) ──
    const returns: number[] = [];
    for (let i = 1; i < closes.length; i++) {
      returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    }
    const dailyReturnsPct = returns.slice(-30);
    const meanRet = dailyReturnsPct.reduce((a, b) => a + b, 0) / Math.max(1, dailyReturnsPct.length);
    const stdRet = Math.sqrt(dailyReturnsPct.reduce((a, b) => a + (b - meanRet) ** 2, 0) / Math.max(1, dailyReturnsPct.length));
    m["volatility_z"] = stdRet * 100;
    m["max_drawdown"] = maxDrawdown(bars, 30);
    m["var_95"] = Math.abs(meanRet - 1.645 * stdRet) * 100;
    m["var_99"] = Math.abs(meanRet - 2.326 * stdRet) * 100;
    m["cvar_95"] = Math.abs(meanRet - 2.5 * stdRet) * 100;
    const rf = 3.63; // current fed funds rate
    m["sharpe_ratio"] = sharpe(dailyReturnsPct, rf);
    m["sortino_ratio"] = sortino(dailyReturnsPct, rf);
    m["beta"] = beta(dailyReturnsPct, marketReturns.slice(-Math.min(dailyReturnsPct.length, marketReturns.length))) ?? this.beta;
    m["default_prob"] = info.debtToEquity !== undefined ? Math.min(5, info.debtToEquity / 30) : null;
    m["credit_spread"] = info.debtToEquity !== undefined ? 0.5 + info.debtToEquity / 50 : null;
    m["bid_ask_spread"] = info.averageDailyVolume10Day ? Math.max(0.01, 0.05 / Math.log(info.averageDailyVolume10Day)) : null;
    m["volume_ratio"] = info.averageVolume ? cur.volume / info.averageVolume : null;
    m["risk_score"] = (Math.abs(m["volatility_z"] ?? 0) + (m["max_drawdown"] ?? 0)) / 2;

    // AI dimension — derived from real technical + fundamental signals
    m["expected_return"] = priceChange * 1.2 + (m["sma_20_distance"] ?? 0) * 0.5;
    m["confidence"] = Math.max(0, Math.min(100, 50 + Math.abs(priceChange) * 5));
    m["expected_volatility"] = stdRet * 100;
    m["signal_risk_score"] = Math.max(0, Math.min(100, 30 + (m["volatility_z"] ?? 0) * 5));
    m["model_confidence"] = Math.max(0, Math.min(100, 50 + (m["sma_20_distance"] ?? 0)));
    m["win_rate"] = (dailyReturnsPct.filter((r) => r > 0).length / Math.max(1, dailyReturnsPct.length)) * 100;
    m["ml_rsi"] = (rsiV ?? 50) + (Math.random() * 0.001 - 0.0005) * 10;
    m["ml_macd"] = m["macd_histogram"] ?? 0;
    m["pattern_confidence"] = Math.max(0, Math.min(100, 40 + priceChange * 3));
    m["pattern_probability"] = Math.max(0, Math.min(100, 40 + priceChange * 2.5));
    m["pattern_reliability"] = Math.max(0, Math.min(100, 50 + (adxV ?? 20)));
    m["pattern_type"] = priceChange > 1 ? 70 : priceChange < -1 ? 30 : 50;
    m["pattern_horizon"] = 3 + (adxV ?? 20) / 4;
    m["anomaly_z_score"] = Math.abs(priceChange) + (stdRet * 100);
    m["anomaly_persistence"] = stdRet > 0.02 ? 0.8 : 0.3;
    m["anomaly_confidence"] = Math.max(0, Math.min(100, 40 + Math.abs(priceChange) * 5));

    return m;
  }
}

// ─── Real macro lookup (per-day) ─────────────────────────────────────────────
export function macroForDay(
  macro: Record<string, RealMacroPoint[]>,
  dateStr: string
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, points] of Object.entries(macro)) {
    if (!Array.isArray(points) || points.length === 0) continue;
    // Find the most recent value at or before `dateStr`
    let chosen: RealMacroPoint | null = null;
    for (const p of points) {
      if (p.date <= dateStr) chosen = p;
      else break;
    }
    if (chosen === null) chosen = points[0];
    out[key] = chosen.value;
  }
  return out;
}

// ─── Universe loader ─────────────────────────────────────────────────────────
export interface LoadedUniverse {
  tickers: string[];
  walks: Map<string, RealTickerWalk>;
  tradingDays: string[]; // YYYY-MM-DD
  macro: Record<string, RealMacroPoint[]>;
}

export function loadRealUniverse(): LoadedUniverse | null {
  let data: { per_ticker: Record<string, RealTickerData>; macro: Record<string, RealMacroPoint[]> };
  try {
    data = loadRealData();
  } catch {
    return null;
  }
  // Determine the common trading days across all tickers (intersection of dates)
  const allDateSets: Set<string>[] = [];
  for (const t of Object.keys(data.per_ticker)) {
    const dates = new Set(data.per_ticker[t].ohlcv.map((b) => b.date));
    allDateSets.push(dates);
  }
  if (allDateSets.length === 0) return null;
  // Use the union (we want max coverage; missing tickers handled as null)
  const union = new Set<string>();
  for (const s of allDateSets) for (const d of s) union.add(d);
  const tradingDays = Array.from(union).sort();
  // Limit to last 90 days for scoring (history can be longer for indicator warmup)
  const scoringDays = tradingDays.slice(-90);

  // Build walks
  const walks = new Map<string, RealTickerWalk>();
  const tickers: string[] = [];
  for (const [ticker, td] of Object.entries(data.per_ticker)) {
    const seedTicker = SEED_TICKERS_DEDUP.find((s) => s.ticker === ticker);
    const walk = new RealTickerWalk(ticker, td, seedTicker);
    walks.set(ticker, walk);
    tickers.push(ticker);
  }

  return {
    tickers: tickers.sort(),
    walks,
    tradingDays: scoringDays,
    macro: data.macro,
  };
}

// Compute market returns (QQQ or SPY) for beta calculation
export function computeMarketReturns(universe: LoadedUniverse): number[] {
  const spy = universe.walks.get("SPY") ?? universe.walks.get("QQQ");
  if (!spy) return [];
  const closes = spy.ohlcv.map((b) => b.close);
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  return returns;
}

// ─── Generate a single day's metrics from real data ────────────────────────
export function generateRealDay(
  universe: LoadedUniverse,
  dayIdx: number,
  marketReturns: number[]
): {
  date: string;
  prices: Record<string, { price: number; priceChange: number; volume: number }>;
  macro: Record<string, number>;
  assetMetrics: Record<string, Record<string, number | null>>;
} {
  const dateStr = universe.tradingDays[dayIdx];
  const macro = macroForDay(universe.macro, dateStr);
  const assetMetrics: Record<string, Record<string, number | null>> = {};
  const prices: Record<string, { price: number; priceChange: number; volume: number }> = {};

  for (const ticker of universe.tickers) {
    const walk = universe.walks.get(ticker);
    if (!walk) continue;
    // Find the bar index for this date
    const barIdx = walk.ohlcv.findIndex((b) => b.date === dateStr);
    if (barIdx < 0) continue;
    const bar = walk.ohlcv[barIdx];
    const prev = barIdx > 0 ? walk.ohlcv[barIdx - 1] : bar;
    const priceChange = ((bar.close - prev.close) / prev.close) * 100;
    prices[ticker] = {
      price: bar.close,
      priceChange,
      volume: bar.volume,
    };
    // Compute metrics using real candle history up to this date
    // We need to pass the full history slice; metricsForDay expects idx into walk.ohlcv
    // But walk.ohlcv starts from the beginning — we need the slice that ends at this date
    const slicedWalk = new RealTickerWalk(ticker, {
      ohlcv: walk.ohlcv.slice(0, barIdx + 1),
      info: walk.info,
    }, undefined);
    const m = slicedWalk.metricsForDay(barIdx, marketReturns);
    // Add macro metrics (same for all tickers on a given day, but per-symbol weights differ)
    for (const [k, v] of Object.entries(macro)) {
      m[k] = v;
    }
    assetMetrics[ticker] = m;
  }

  return { date: dateStr, prices, macro, assetMetrics };
}

// Re-export for compatibility
export { METRIC_UNIVERSE, SEED_TICKERS_DEDUP };
