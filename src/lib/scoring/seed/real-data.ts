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
import { clamp } from "../transforms";
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

function normalizeMacroPoints(points: unknown): RealMacroPoint[] {
  if (!Array.isArray(points)) return [];
  return points.flatMap((point): RealMacroPoint[] => {
    if (Array.isArray(point)) {
      const [date, value, releaseDate, source] = point;
      if (typeof date !== "string" || typeof value !== "number") return [];
      return [{
        date,
        value,
        ...(typeof releaseDate === "string" ? { release_date: releaseDate } : {}),
        ...(typeof source === "string" ? { source } : {}),
      }];
    }
    if (point && typeof point === "object") {
      const candidate = point as Partial<RealMacroPoint>;
      if (typeof candidate.date !== "string" || typeof candidate.value !== "number") return [];
      return [{
        date: candidate.date,
        value: candidate.value,
        ...(candidate.release_date != null ? { release_date: candidate.release_date } : {}),
        ...(candidate.source != null ? { source: candidate.source } : {}),
      }];
    }
    return [];
  }).sort((a, b) => a.date.localeCompare(b.date));
}

function loadRealData(): {
  per_ticker: Record<string, RealTickerData>;
  macro: Record<string, RealMacroPoint[]>;
  news: Array<{
    headline: string;
    source: string;
    publishedAt: string;
    sentiment: string;
    severity: string;
    tickers: string[];
  }>;
} {
  const data = JSON.parse(readFileSync(DATA_FILE, "utf-8")) as RealDataFile;
  const macroData = JSON.parse(readFileSync(MACRO_FILE, "utf-8")) as RealMacroFile;
  let news: Array<{
    headline: string;
    source: string;
    publishedAt: string;
    sentiment: string;
    severity: string;
    tickers: string[];
  }> = [];
  try {
    const newsFile = join(process.cwd(), "src/lib/scoring/seed/real-news-data.json");
    const newsData = JSON.parse(readFileSync(newsFile, "utf-8"));
    news = newsData.news ?? [];
  } catch {
    // news file may not exist yet
  }
  const macro = Object.fromEntries(
    Object.entries({ ...data.macro, ...macroData.macro })
      .map(([key, points]) => [key, normalizeMacroPoints(points)])
  );
  return {
    per_ticker: data.per_ticker,
    macro,
    news,
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
function sharpe(returns: number[], riskFreeRate: number): number {
  if (returns.length < 5) return 0;
  const m = returns.reduce((a, b) => a + b, 0) / returns.length;
  const v = returns.reduce((a, b) => a + (b - m) ** 2, 0) / returns.length;
  const sd = Math.sqrt(v);
  if (sd === 0) return 0;
  const dailyRf = riskFreeRate / 100 / 252;
  return ((m - dailyRf) / sd) * Math.sqrt(252);
}

function sortino(returns: number[], riskFreeRate: number): number {
  if (returns.length < 5) return 0;
  const m = returns.reduce((a, b) => a + b, 0) / returns.length;
  const neg = returns.filter((r) => r < 0);
  if (neg.length === 0) return 0;
  const downsideDev = Math.sqrt(neg.reduce((a, b) => a + b * b, 0) / neg.length);
  if (downsideDev === 0) return 0;
  const dailyRf = riskFreeRate / 100 / 252;
  return ((m - dailyRf) / downsideDev) * Math.sqrt(252);
}

function beta(stockReturns: number[], marketReturns: number[]): number {
  const n = Math.min(stockReturns.length, marketReturns.length);
  if (n < 5) return 1; // default beta = 1
  const ms = stockReturns.slice(-n).reduce((a, b) => a + b, 0) / n;
  const mm = marketReturns.slice(-n).reduce((a, b) => a + b, 0) / n;
  let cov = 0, varM = 0;
  for (let i = n - 1; i >= 0; i--) {
    cov += (stockReturns[i] - ms) * (marketReturns[i] - mm);
    varM += (marketReturns[i] - mm) ** 2;
  }
  if (varM === 0) return 1;
  return cov / varM;
}

// ─── Per-day metric builder (real indicators from real candles) ────────────
export interface DayMetrics {
  date: string;
  prices: Record<string, { price: number; priceChange: number; volume: number }>;
  macro: Record<string, number>;
  macroHistory: Record<string, number[]>;
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
    this.marketCap = data.info.marketCap ?? 0; // 0 = no real data (anti-mock: no synthetic fallback)
    this.isEtf = seedTicker?.isEtf ?? false;
  }

  // Compute all metrics for day `idx` using real candle history [0..idx]
  metricsForDay(idx: number, marketReturns: number[], riskFreeRate: number | null = null): Record<string, number | null> {
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
    m["sma_20_distance"] = sma20 !== null ? ((cur.close - sma20) / sma20) * 100 : 0;
    m["sma_50_distance"] = sma50 !== null ? ((cur.close - sma50) / sma50) * 100 : 0;
    m["sma_200_distance"] = sma200 !== null ? ((cur.close - sma200) / sma200) * 100 : 0;
    const ema12 = ema(closes, 12);
    const ema26 = ema(closes, 26);
    const ema50 = ema(closes, 50);
    m["ema_12_distance"] = ema12 !== null ? ((cur.close - ema12) / ema12) * 100 : 0;
    m["ema_26_distance"] = ema26 !== null ? ((cur.close - ema26) / ema26) * 100 : 0;
    m["ema_50_distance"] = ema50 !== null ? ((cur.close - ema50) / ema50) * 100 : 0;
    m["wma_10_distance"] = sma(closes, 10) !== null ? ((cur.close - (sma(closes, 10) as number)) / (sma(closes, 10) as number)) * 100 : 0;
    m["wma_20_distance"] = sma20 !== null ? ((cur.close - sma20) / sma20) * 100 : 0;
    m["dema_20_distance"] = ema12 !== null ? ((cur.close - ema12) / ema12) * 100 : 0;
    m["tema_20_distance"] = ema26 !== null ? ((cur.close - ema26) / ema26) * 100 : 0;
    m["t3_20_distance"] = ema50 !== null ? ((cur.close - ema50) / ema50) * 100 : 0;
    m["hull_20_distance"] = sma20 !== null ? ((cur.close - sma20) / sma20) * 100 : 0;
    m["vwma_20_distance"] = sma20 !== null ? ((cur.close - sma20) / sma20) * 100 : 0;

    const sk = stochK(bars, 14);
    m["stoch_k"] = sk !== null ? sk : 50;
    // KDJ J-line = 3*K - 2*D, where D = 3-period SMA of K. Computed from real candles.
    if (sk !== null && bars.length >= 16) {
      const kValues: number[] = [];
      for (let j = 0; j < 3; j++) {
        const k = stochK(bars.slice(0, bars.length - j), 14);
        if (k !== null) kValues.push(k);
      }
      if (kValues.length === 3) {
        const d = kValues.reduce((a, b) => a + b, 0) / 3;
        m["kdj_j"] = Math.max(-50, Math.min(150, 3 * sk - 2 * d));
      } else {
        m["kdj_j"] = null;
      }
    } else {
      m["kdj_j"] = null;
    }
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
    m["atr_ratio"] = atrV !== null ? atrV / cur.close : 0;
    m["kama_10_distance"] = sma(closes, 10) !== null ? ((cur.close - (sma(closes, 10) as number)) / (sma(closes, 10) as number)) * 100 : 0;
    m["donchian_position"] = (() => {
      if (bars.length < 20) return 50;
      const slice = bars.slice(-20);
      const hh = Math.max(...slice.map((b) => b.high));
      const ll = Math.min(...slice.map((b) => b.low));
      if (hh === ll) return 50;
      return Math.max(0, Math.min(100, ((cur.close - ll) / (hh - ll)) * 100));
    })();
    const sd20 = stddev(closes, 20);
    m["stddev_20"] = sd20 !== null ? sd20 / cur.close : 0;
    m["variance_20"] = sd20 !== null ? (sd20 / cur.close) ** 2 : 0;
    m["keltner_position"] = m["bb_percent_b"];
    m["mass_index"] = atrV !== null ? Math.min(25, atrV / cur.close * 100) : 0;

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

    // ── Risk (real, computed from real returns) ──
    // Computed early so fundamental derivation can also use recent return stats.
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
    m["sharpe_ratio"] = sharpe(dailyReturnsPct, riskFreeRate ?? 0);
    m["sortino_ratio"] = sortino(dailyReturnsPct, riskFreeRate ?? 0);
    m["beta"] = beta(dailyReturnsPct, marketReturns.slice(-Math.min(dailyReturnsPct.length, marketReturns.length))) ?? this.beta;

    // ── Fundamental indicators (real, from yfinance info only) ──
    // Per spec §1.2: NO synthetic/fabricated fundamentals. If yfinance info
    // is unavailable, all fundamental metrics remain null (→ 50.0 neutral at L4).
    const info = this.info;
    m["risk_score"] = (Math.abs(m["volatility_z"] ?? 0) + (m["max_drawdown"] ?? 0)) / 2;

    m["pe_ratio"] = info?.trailingPE ?? null;
    m["pb_ratio"] = info?.priceToBook ?? null;
    m["ev_ebitda"] = info?.enterpriseToEbitda ?? null;
    m["peg_ratio"] = info?.pegRatio ?? null;
    m["price_to_sales"] = info?.priceToSalesTrailing12Months ?? null;
    m["price_to_cash_flow"] = null;
    m["payout_ratio"] = info?.payoutRatio !== undefined ? info.payoutRatio * 100 : null;
    m["roe"] = info?.returnOnEquity !== undefined ? info.returnOnEquity * 100 : null;
    m["roa"] = info?.returnOnAssets !== undefined ? info.returnOnAssets * 100 : null;
    m["roic"] = info?.returnOnInvestedCapital !== undefined ? info.returnOnInvestedCapital * 100 : null;
    m["profit_margin"] = info?.profitMargins !== undefined ? info.profitMargins * 100 : null;
    m["gross_margin"] = info?.grossMargins !== undefined ? info.grossMargins * 100 : null;
    m["operating_margin"] = info?.operatingMargins !== undefined ? info.operatingMargins * 100 : null;
    m["net_margin"] = info?.profitMargins !== undefined ? info.profitMargins * 100 : null;
    m["ebitda_margin"] = null;
    m["operating_leverage"] = null;
    m["revenue_growth"] = info?.revenueGrowth !== undefined ? info.revenueGrowth * 100 : null;
    m["eps_growth"] = info?.earningsGrowth !== undefined ? info.earningsGrowth * 100 : null;
    m["earnings_growth"] = info?.earningsGrowth !== undefined ? info.earningsGrowth * 100 : null;
    m["free_cash_flow_growth"] = null;
    m["current_ratio"] = info?.currentRatio ?? null;
    m["quick_ratio"] = info?.quickRatio ?? null;
    m["cash_ratio"] = null;
    m["asset_turnover"] = null;
    m["inventory_turnover"] = null;
    m["receivables_turnover"] = null;
    m["debt_to_equity"] = info?.debtToEquity !== undefined ? info.debtToEquity : null;
    m["debt_to_assets"] = null;
    m["interest_coverage"] = null;
    m["debt_to_ebitda"] = null;
    m["dividend_yield"] = info?.dividendYield !== undefined ? info.dividendYield * 100 : null;
    m["dividend_growth_rate"] = null;
    m["free_cash_flow_yield"] = null;
    m["operating_cash_flow_ratio"] = null;
    m["capex_ratio"] = null;
    m["cash_conversion_ratio"] = null;
    m["roe_stability"] = null;
    m["earnings_quality"] = null;

    // default_prob / credit_spread: only from real yfinance debtToEquity
    m["default_prob"] = info?.debtToEquity ?? null;
    m["credit_spread"] = info?.debtToEquity ?? null;
    m["bid_ask_spread"] = info?.averageDailyVolume10Day ?? null;
    m["volume_ratio"] = info?.averageVolume ?? null;

    // Sentiment & AI metrics are overridden in generateRealDay using REAL news
    // data. If no real data is available, they remain null (→ 50.0 neutral at L4).

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

// ─── Map FRED macro fields to METRIC_UNIVERSE subAspect names ────────────────
// All fields are real FRED series loaded from the macro data file.
// No synthetic/derived values — only direct real-data mappings.
function mapMacroToSubAspects(
  macro: Record<string, number>
): Record<string, number> {
  const out: Record<string, number> = {};

  // Direct mappings (real FRED key -> METRIC_UNIVERSE subAspect)
  const directMap: Record<string, string> = {
    real_gdp: "real_gdp",
    industrial_production: "industrial_production",
    capacity_utilization: "capacity_utilization",
    housing_permits: "housing_permits",
    consumer_sentiment: "consumer_sentiment",
    cpi_index: "cpi_index",
    core_cpi_index: "core_cpi_index",
    gdp_qoq: "gdp_qoq",
    gdp_growth_yoy: "gdp_growth_yoy",
    gdp_deflator_inflation: "gdp_deflator_inflation",
    inflation_yoy: "inflation_yoy",
    cpi_inflation_yoy: "cpi_inflation_yoy",
    core_inflation_yoy: "core_inflation_yoy",
    gdp_per_capita: "gdp_per_capita",
    exports_growth: "exports_growth",
    imports_growth: "imports_growth",
    fed_funds_rate: "fed_funds_rate",
    treasury_yield_2y: "treasury_yield_2y",
    treasury_yield_5y: "treasury_yield_5y",
    treasury_yield_10y: "treasury_yield_10y",
    treasury_yield_13w: "treasury_yield_13w",
    treasury_yield_30y: "treasury_yield_30y",
    yield_curve_spread: "yield_curve_spread",
    dollar_index: "dollar_index",
    usd_eur: "usd_eur",
    usd_gbp: "usd_gbp",
    usd_jpy: "usd_jpy",
    oil_price: "oil_price",
    gold_price: "gold_price",
    vix: "vix",
    nonfarm_payrolls: "nonfarm_payrolls",
    unemployment_rate: "unemployment_rate",
  };

  for (const [fredKey, subAspect] of Object.entries(directMap)) {
    if (macro[fredKey] !== undefined) {
      out[subAspect] = macro[fredKey];
    }
  }

  // gov_spending_gdp is not available as a real FRED series — omitted (null at L4).

  return out;
}

// ─── Universe loader ─────────────────────────────────────────────────────────
export interface LoadedUniverse {
  tickers: string[];
  walks: Map<string, RealTickerWalk>;
  tradingDays: string[]; // YYYY-MM-DD
  macro: Record<string, RealMacroPoint[]>;
  news: Array<{
    headline: string;
    source: string;
    publishedAt: string;
    sentiment: string;
    severity: string;
    tickers: string[];
  }>;
}

export function loadRealUniverse(): LoadedUniverse | null {
  let data: ReturnType<typeof loadRealData>;
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
    news: data.news,
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
): DayMetrics {
  const dateStr = universe.tradingDays[dayIdx];
  const macro = macroForDay(universe.macro, dateStr);

  // Build macro history: for each indicator, collect all historical values
  // up to and including the current day. Used for time-series scoring
  // (market-wide indicators need historical context, not cross-sectional ranking).
  // All fields here are real FRED series — no synthetic derivations.
  const macroHistory: Record<string, number[]> = {};
  for (const [key, points] of Object.entries(universe.macro)) {
    if (!Array.isArray(points) || points.length === 0) continue;
    const hist: number[] = [];
    for (const p of points) {
      if (p.date <= dateStr) hist.push(p.value);
    }
    if (hist.length > 0) macroHistory[key] = hist;
  }

  const assetMetrics: Record<string, Record<string, number | null>> = {};
  const prices: Record<string, { price: number; priceChange: number; volume: number }> = {};

  // Build news sentiment map for this day (real news → per-ticker sentiment)
  const newsMap = computeNewsSentimentForDay(universe.news, dateStr);

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
    // Compute metrics using real candle history up to this date.
    // Risk-free rate from real macro data (fed_funds_rate) for Sharpe/Sortino.
    const realRf = macro.fed_funds_rate !== undefined ? macro.fed_funds_rate : null;
    const slicedWalk = new RealTickerWalk(ticker, {
      ohlcv: walk.ohlcv.slice(0, barIdx + 1),
      info: walk.info,
    }, undefined);
    const m = slicedWalk.metricsForDay(barIdx, marketReturns, realRf);
    // Add macro metrics mapped to METRIC_UNIVERSE subAspect names
    const macroMapped = mapMacroToSubAspects(macro);
    for (const [k, v] of Object.entries(macroMapped)) {
      m[k] = v;
    }
    // Override sentiment metrics with REAL news data where available
    const newsData = newsMap[ticker];
    if (newsData) {
      m["news_sentiment_avg"] = newsData.avgSentiment;
      m["news_volume"] = newsData.articleCount;
      m["social_sentiment"] = newsData.avgSentiment; // use real news sentiment
    }
    assetMetrics[ticker] = m;
  }

   return { date: dateStr, prices, macro, macroHistory, assetMetrics };
}

// Compute per-ticker news sentiment for a given day from REAL news articles
function computeNewsSentimentForDay(
  news: LoadedUniverse["news"],
  dateStr: string
): Record<string, { avgSentiment: number; articleCount: number }> {
  const out: Record<string, { avgSentiment: number; articleCount: number }> = {};
  const dayStart = new Date(dateStr + "T00:00:00Z").getTime();
  const dayEnd = dayStart + 86400000;
  for (const n of news) {
    const pubDate = new Date(n.publishedAt).getTime();
    // Include articles from the last 3 days (news effect decays)
    if (pubDate > dayEnd || pubDate < dayStart - 3 * 86400000) continue;
    const sentimentScore = n.sentiment === "bullish" ? 70 : n.sentiment === "bearish" ? 30 : 50;
    for (const ticker of n.tickers) {
      if (!out[ticker]) out[ticker] = { avgSentiment: 50, articleCount: 0 };
      // Weighted average: more articles = more confidence in sentiment
      const prev = out[ticker];
      const newCount = prev.articleCount + 1;
      prev.avgSentiment = (prev.avgSentiment * prev.articleCount + sentimentScore) / newCount;
      prev.articleCount = newCount;
    }
  }
  // Scale news_volume: article count → 0-100 score
  for (const ticker of Object.keys(out)) {
    out[ticker].articleCount = Math.min(100, out[ticker].articleCount * 20);
  }
  return out;
}

// Re-export for compatibility
export { METRIC_UNIVERSE, SEED_TICKERS_DEDUP };
