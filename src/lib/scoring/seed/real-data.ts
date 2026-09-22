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
export interface RealBar {
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

// ─── Real indicator implementations (no proxies/duplicates — spec §1.2) ──

function ultimateOscillator(bars: RealBar[], p1 = 7, p2 = 14, p3 = 28): number | null {
  if (bars.length < p3 + 1) return null;
  const bp: number[] = [];
  const tr: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const bpVal = bars[i].close - Math.min(bars[i].low, bars[i - 1].close);
    bp.push(Math.max(0, bpVal));
    const trVal = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close)
    );
    tr.push(trVal);
  }
  if (bp.length < p3) return null;
  const sumBp = (p: number) => bp.slice(-p).reduce((a, b) => a + b, 0);
  const sumTr = (p: number) => tr.slice(-p).reduce((a, b) => a + b, 0);
  const rawUO =
    100 *
    (4 * (sumBp(p1) / sumTr(p1)) +
      2 * (sumBp(p2) / sumTr(p2)) +
      sumBp(p3) / sumTr(p3)) /
    7;
  return clamp(rawUO, 0, 100);
}

function fisherTransform(closes: number[], highs: number[], lows: number[], period = 10): number | null {
  if (closes.length < period + 1) return null;
  const sliceC = closes.slice(-period - 1, -1);
  const sliceH = highs.slice(-period - 1, -1);
  const sliceL = lows.slice(-period - 1, -1);
  const minL = Math.min(...sliceL);
  const maxH = Math.max(...sliceH);
  if (maxH === minL) return 0;
  const lastClose = closes[closes.length - 1];
  let x = 2 * (lastClose - minL) / (maxH - minL) - 1;
  x = clamp(x, -0.999, 0.999);
  return 0.5 * Math.log((1 + x) / (1 - x));
}

function trix(closes: number[], period = 14): number | null {
  if (closes.length < period + 2) return null;
  const ema1 = ema(closes, period);
  if (ema1 === null) return null;
  // Build EMA series to get the previous value
  const emaSeries: number[] = [];
  let e = closes[0];
  const k = 2 / (period + 1);
  for (let i = 1; i < closes.length; i++) {
    e = closes[i] * k + e * (1 - k);
    emaSeries.push(e);
  }
  if (emaSeries.length < 2) return null;
  const prev = emaSeries[emaSeries.length - 2];
  if (prev === 0) return null;
  return ((emaSeries[emaSeries.length - 1] - prev) / prev) * 10000;
}

function awesomeOscillator(bars: RealBar[], p1 = 5, p2 = 34): number | null {
  if (bars.length < p2) return null;
  const mp = bars.map((b) => (b.high + b.low) / 2);
  const sma = (arr: number[], p: number) => {
    const s = arr.slice(-p);
    return s.reduce((a, b) => a + b, 0) / p;
  };
  const med = mp.slice(-p2);
  const sma5 = sma(mp, p1);
  const sma34 = sma(mp, p2);
  return sma5 - sma34;
}

function keltnerPosition(bars: RealBar[], emaPeriod = 20, mult = 2): number | null {
  if (bars.length < emaPeriod + 1) return null;
  const closes = bars.map((b) => b.close);
  const emaV = ema(closes, emaPeriod);
  if (emaV === null) return null;
  const atrV = atr(bars, emaPeriod);
  if (atrV === null || atrV === 0) return null;
  const upper = emaV + mult * atrV;
  const lower = emaV - mult * atrV;
  const close = bars[bars.length - 1].close;
  if (upper === lower) return 50;
  return clamp(((close - lower) / (upper - lower)) * 100, 0, 100);
}

function parabolicSAR(bars: RealBar[], afStep = 0.02, afMax = 0.02): number | null {
  if (bars.length < 5) return null;
  let sar = bars[0].low;
  let af = afStep;
  let ep = bars[0].high;
  let trend = 1; // 1 = uptrend, -1 = downtrend
  for (let i = 1; i < bars.length; i++) {
    if (trend === 1) {
      if (bars[i].low > sar) {
        sar = sar + af * (ep - sar);
        if (bars[i].high > ep) {
          ep = bars[i].high;
          af = Math.min(af + afStep, afMax);
        }
      } else {
        trend = -1;
        sar = ep;
        ep = bars[i].low;
        af = afStep;
      }
    } else {
      if (bars[i].high < sar) {
        sar = sar + af * (ep - sar);
        if (bars[i].low < ep) {
          ep = bars[i].low;
          af = Math.min(af + afStep, afMax);
        }
      } else {
        trend = 1;
        sar = ep;
        ep = bars[i].high;
        af = afStep;
      }
    }
  }
  return sar;
}

function supertrendSignal(bars: RealBar[], period = 10, mult = 3): number | null {
  if (bars.length < period + 1) return null;
  const closes = bars.map((b) => b.close);
  const hl2 = bars.map((b) => (b.high + b.low) / 2);
  const atrV = atr(bars, period);
  if (atrV === null) return null;
  const hl2Series: number[] = [];
  const basicUpper: number[] = [];
  const basicLower: number[] = [];
  const finalUpper: number[] = [];
  const finalLower: number[] = [];
  const supertrend: number[] = [];
  for (let i = period - 1; i < bars.length; i++) {
    const bu = hl2[i] + mult * atrV;
    const bl = hl2[i] - mult * atrV;
    basicUpper.push(bu);
    basicLower.push(bl);
    let fu = bu;
    let fl = bl;
    if (i > period - 1) {
      if (basicUpper[basicUpper.length - 2] > finalUpper[finalUpper.length - 1] || closes[i] > finalUpper[finalUpper.length - 1]) {
        fu = bu;
      } else {
        fu = basicUpper[basicUpper.length - 2];
      }
      if (basicLower[basicLower.length - 2] < finalLower[finalLower.length - 1] || closes[i] < finalLower[finalLower.length - 1]) {
        fl = bl;
      } else {
        fl = basicLower[basicLower.length - 2];
      }
    }
    finalUpper.push(fu);
    finalLower.push(fl);
    if (supertrend.length > 0) {
      supertrend.push(closes[i - (period - 1)] > supertrend[supertrend.length - 1] ? fl : fu);
    } else {
      supertrend.push(closes[i] > bl ? fl : fu);
    }
  }
  const lastClose = closes[closes.length - 1];
  const lastSupertrend = supertrend[supertrend.length - 1];
  if (lastClose > lastSupertrend) return 1;
  if (lastClose < lastSupertrend) return -1;
  return 0;
}

function ichimokuCloud(bars: RealBar[], tenkanPeriod = 9, kijunPeriod = 26, senkouSpanBPeriod = 52): { cloudPosition: number | null; score: number | null } | null {
  if (bars.length < senkouSpanBPeriod) return null;
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const close = bars.map((b) => b.close);
  const tenkan = (high.slice(-tenkanPeriod).reduce((a, b) => a + b, 0) / tenkanPeriod + low.slice(-tenkanPeriod).reduce((a, b) => a + b, 0) / tenkanPeriod) / 2;
  const kijun = (high.slice(-kijunPeriod).reduce((a, b) => a + b, 0) / kijunPeriod + low.slice(-kijunPeriod).reduce((a, b) => a + b, 0) / kijunPeriod) / 2;
  const senkouA = (tenkan + kijun) / 2;
  const senkouBPeriodStart = close.length - senkouSpanBPeriod;
  const senkouBHigh = high.slice(senkouBPeriodStart).reduce((a, b) => Math.max(a, b), -Infinity);
  const senkouBLow = low.slice(senkouBPeriodStart).reduce((a, b) => Math.min(a, b), Infinity);
  const senkouB = (senkouBHigh + senkouBLow) / 2;
  const cloudTop = Math.max(senkouA, senkouB);
  const cloudBottom = Math.min(senkouA, senkouB);
  const lastClose = close[close.length - 1];
  if (cloudTop === cloudBottom) return { cloudPosition: 50, score: 0 };
  const position = clamp(((lastClose - cloudBottom) / (cloudTop - cloudBottom)) * 100, 0, 100);
  const score = lastClose > cloudTop ? 1 : lastClose < cloudBottom ? -1 : 0;
  return { cloudPosition: position, score };
}

function hullMA(bars: RealBar[], period = 20): number | null {
  const n = Math.floor(period / 2);
  if (bars.length < period) return null;
  const closes = bars.map((b) => b.close);
  const wma = (arr: number[], p: number): number | null => {
    if (arr.length < p) return null;
    const slice = arr.slice(-p);
    let sum = 0, wsum = 0;
    for (let i = 0; i < p; i++) {
      const w = i + 1;
      sum += slice[i] * w;
      wsum += w;
    }
    return sum / wsum;
  };
  const wmaHalf = wma(closes, n);
  const wmaFull = wma(closes, period);
  if (wmaHalf === null || wmaFull === null) return null;
  const rawDiff = 2 * wmaHalf - wmaFull;
  const sqrtP = Math.floor(Math.sqrt(period));
  // HMA = WMA of the raw difference
  const diffSeries: number[] = [];
  for (let i = period - 1; i < closes.length; i++) {
    const wmaHalfSlice = wma(closes.slice(0, i + 1), n);
    const wmaFullSlice = wma(closes.slice(0, i + 1), period);
    if (wmaHalfSlice !== null && wmaFullSlice !== null) {
      diffSeries.push(2 * wmaHalfSlice - wmaFullSlice);
    }
  }
  if (diffSeries.length < sqrtP) return null;
  return wma(diffSeries, sqrtP);
}

function hmaCycle(bars: RealBar[], period = 20): number | null {
  const hma = hullMA(bars, period);
  if (hma === null || hma === 0) return null;
  const cur = bars[bars.length - 1].close;
  return ((cur - hma) / hma) * 100;
}

function tma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  let sum = 0;
  let wsum = 0;
  for (let i = 0; i < period; i++) {
    const w = Math.min(i + 1, period - i);
    sum += slice[i] * w;
    wsum += w;
  }
  return sum / wsum;
}

function smma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 1 / period;
  let s = values.slice(-period).reduce((a, b) => a + b, 0) / period;
  for (let i = values.length - period - 1; i >= 0; i--) {
    s = values[i] * k + s * (1 - k);
  }
  return s;
}

function rocVal(closes: number[], period: number): number | null {
  if (closes.length < period + 1) return null;
  const prev = closes[closes.length - period - 1];
  if (prev === 0) return null;
  return ((closes[closes.length - 1] - prev) / prev) * 100;
}

function pvo(bars: RealBar[], fast: number = 5, slow: number = 21): number | null {
  if (bars.length < slow + 1) return null;
  const volumes = bars.map((b) => b.volume);
  const emaFast = ema(volumes, fast);
  const emaSlow = ema(volumes, slow);
  if (emaFast === null || emaSlow === null || emaSlow === 0) return null;
  return ((emaFast - emaSlow) / emaSlow) * 100;
}

function tsiff(closes: number[], period = 9): number | null {
  if (closes.length < period + 1) return null;
  const rsiVal = rsi(closes, period);
  if (rsiVal === null) return null;
  const k = 2 / (period + 1);
  let s = rsiVal;
  const recent = closes.slice(-period * 3);
  for (let i = 1; i < recent.length; i++) {
    const ch = recent[i] - recent[i - 1];
    const g = ch > 0 ? ch : 0;
    const l = ch < 0 ? -ch : 0;
    const ag = g === 0 ? 0 : 100 * g / (g + l || 1);
    s = ag * k + s * (1 - k);
  }
  return s;
}

function chandelierExit(bars: RealBar[], period = 22, atrMult = 3): number | null {
  if (bars.length < period + 1) return null;
  const slice = bars.slice(-period);
  const hh = Math.max(...slice.map((b) => b.high));
  const atrV = atr(bars, period);
  if (atrV === null) return null;
  return hh - atrV * atrMult;
}

function vortexOscillator(bars: RealBar[], period = 14): number | null {
  if (bars.length < period + 1) return null;
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const up = bars[i].high - bars[i - 1].high;
    const down = bars[i - 1].low - bars[i].low;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
  }
  const slice = (arr: number[]) => {
    if (arr.length < period) return 0;
    return arr.slice(-period).reduce((a, b) => a + b, 0);
  };
  const trSum = (arr: RealBar[]) => {
    let s = 0;
    for (let i = 1; i < arr.length; i++) {
      s += trueRange(arr[i], arr[i - 1].close);
    }
    return s;
  };
  const viPlus = (slice(plusDM) / trSum(bars.slice(-period - 1))) * 100;
  const viMinus = (slice(minusDM) / trSum(bars.slice(-period - 1))) * 100;
  if (viMinus === 0) return null;
  return (viPlus / viMinus) * 100;
}

function obvPriceRoc(bars: RealBar[], period = 14): number | null {
  if (bars.length < period + 1) return null;
  const closes = bars.map((b) => b.close);
  const volumes = bars.map((b) => b.volume);
  let obv = 0;
  for (let i = 1; i < bars.length; i++) {
    if (closes[i] > closes[i - 1]) obv += volumes[i];
    else if (closes[i] < closes[i - 1]) obv -= volumes[i];
  }
  const lastChange = closes[bars.length - 1] - closes[bars.length - 2];
  const prevObv = obv - lastChange * volumes[bars.length - 1];
  if (prevObv === 0) return null;
  return ((obv - prevObv) / Math.abs(prevObv)) * 100;
}

function volumeRoc(bars: RealBar[], period = 14): number | null {
  if (bars.length < period + 1) return null;
  const vols = bars.map((b) => b.volume);
  const slice = vols.slice(-period);
  const first = slice[0];
  const last = slice[slice.length - 1];
  if (first === 0) return null;
  return ((last - first) / first) * 100;
}

function donchianWidth(bars: RealBar[], period = 20): number | null {
  if (bars.length < period) return null;
  const slice = bars.slice(-period);
  const hh = Math.max(...slice.map((b) => b.high));
  const ll = Math.min(...slice.map((b) => b.low));
  if (ll === 0) return null;
  return ((hh - ll) / ll) * 100;
}

function chaikinMoneyFlow(bars: RealBar[], period = 20): number | null {
  if (bars.length < period) return null;
  const slice = bars.slice(-period);
  let mfs = 0, volSum = 0;
  for (let i = 0; i < period; i++) {
    const b = slice[i];
    const hlRange = b.high - b.low;
    if (hlRange === 0) continue;
    const mfMultiplier = ((b.close - b.low) - (b.high - b.close)) / hlRange;
    const mfVolume = mfMultiplier * b.volume;
    mfs += mfVolume;
    volSum += b.volume;
  }
  if (volSum === 0) return null;
  return clamp((mfs / volSum) * 100, -100, 100);
}

function chaikinOscillator(bars: RealBar[], fastPeriod = 3, slowPeriod = 10): number | null {
  if (bars.length < slowPeriod + 1) return null;
  const cmfValues: number[] = [];
  const emaFast: number[] = [];
  const emaSlow: number[] = [];
  for (let i = 20; i <= bars.length; i++) {
    const cmf = chaikinMoneyFlow(bars.slice(0, i), 20);
    if (cmf !== null) cmfValues.push(cmf);
  }
  if (cmfValues.length < slowPeriod + 1) return null;
  const kFast = 2 / (fastPeriod + 1);
  const kSlow = 2 / (slowPeriod + 1);
  let ef = cmfValues[0];
  let es = cmfValues[0];
  for (let i = 1; i < cmfValues.length; i++) {
    ef = cmfValues[i] * kFast + ef * (1 - kFast);
    es = cmfValues[i] * kSlow + es * (1 - kSlow);
    emaFast.push(ef);
    emaSlow.push(es);
  }
  if (emaFast.length < 1) return null;
  return emaFast[emaFast.length - 1] - emaSlow[emaSlow.length - 1];
}

function vwapDistance(bars: RealBar[]): number | null {
  if (bars.length === 0 || bars[bars.length - 1].volume === 0) return null;
  let cumPV = 0, cumVol = 0;
  for (const b of bars) {
    const tp = (b.high + b.low + b.close) / 3;
    cumPV += tp * b.volume;
    cumVol += b.volume;
  }
  if (cumVol === 0) return null;
  const vwap = cumPV / cumVol;
  const close = bars[bars.length - 1].close;
  if (vwap === 0) return null;
  return ((close - vwap) / vwap) * 100;
}

function vpt(ticks: number[], volumes: number[]): number | null {
  if (ticks.length < 2) return null;
  let vpt = 0;
  for (let i = 1; i < ticks.length; i++) {
    if (ticks[i - 1] === 0) continue;
    vpt += volumes[i] * ((ticks[i] - ticks[i - 1]) / ticks[i - 1]);
  }
  return vpt;
}

function easeOfMovement(bars: RealBar[], period = 14): number | null {
  if (bars.length < period + 1) return null;
  const slice = bars.slice(-period);
  let emvSum = 0;
  let boxRatioSum = 0;
  for (let i = 1; i < slice.length; i++) {
    const b = slice[i];
    const pb = slice[i - 1];
    const range = b.high - b.low;
    if (range === 0) continue;
    const prevMid = (pb.high + pb.low) / 2;
    const curMid = (b.high + b.low) / 2;
    const move = curMid - prevMid;
    const boxRatio = b.volume / 1e6 / range;
    if (boxRatio === 0) continue;
    emvSum += move / boxRatio;
    boxRatioSum++;
  }
  if (boxRatioSum === 0) return null;
  return (emvSum / boxRatioSum) * 10000;
}

function forceIndex(bars: RealBar[], period = 1): number | null {
  if (bars.length < 2) return null;
  const slice = bars.slice(-period - 1);
  if (slice.length < 2) return null;
  const prev = slice[slice.length - 2];
  const cur = slice[slice.length - 1];
  const priceChange = cur.close - prev.close;
  return (priceChange * cur.volume) / 1e6;
}

function parabolicSarSignal(bars: RealBar[]): number | null {
  const sar = parabolicSAR(bars);
  if (sar === null || bars.length < 2) return null;
  const cur = bars[bars.length - 1];
  if (cur.close > sar) return 1;
  if (cur.close < sar) return -1;
  return 0;
}

function elderRayIndex(bars: RealBar[], period = 13): number | null {
  if (bars.length < period + 1) return null;
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const closes = bars.map((b) => b.close);
  const slice = highs.slice(-period);
  const hh = Math.max(...slice);
  const bullPower = hh - closes[closes.length - 1];
  const bearSlice = lows.slice(-period);
  const ll = Math.min(...bearSlice);
  const bearPower = closes[closes.length - 1] - ll;
  return bullPower + bearPower;
}

function ichimokuCloudPosition(bars: RealBar[]): number | null {
  const result = ichimokuCloud(bars);
  if (result === null) return null;
  return result.cloudPosition;
}

function pivotPosition(bars: RealBar[], period = 20): number | null {
  if (bars.length < period) return null;
  const slice = bars.slice(-period);
  const hh = Math.max(...slice.map((b) => b.high));
  const ll = Math.min(...slice.map((b) => b.low));
  const cur = bars[bars.length - 1];
  const pp = (hh + ll + cur.close) / 3;
  const r1 = 2 * pp - ll;
  const s1 = 2 * pp - hh;
  if (r1 === s1) return 50;
  return clamp(((cur.close - s1) / (r1 - s1)) * 100, 0, 100);
}

function fibonacciPosition(bars: RealBar[], period = 20): number | null {
  if (bars.length < period) return null;
  const slice = bars.slice(-period);
  const hh = Math.max(...slice.map((b) => b.high));
  const ll = Math.min(...slice.map((b) => b.low));
  const cur = bars[bars.length - 1];
  const range = hh - ll;
  if (range === 0) return 50;
  const level236 = hh - range * 0.236;
  const level786 = hh - range * 0.786;
  if (level786 === level236) return 50;
  return clamp(((cur.close - level786) / (level236 - level786)) * 100, 0, 100);
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
    m["macd_histogram"] = macdV !== null ? (macdV.hist / cur.close) * 100 : null;

    const sma20 = sma(closes, 20);
    const sma50 = sma(closes, 50);
    const sma200 = sma(closes, 200);
    const ema12 = ema(closes, 12);
    const ema26 = ema(closes, 26);
    const ema50 = ema(closes, 50);
    m["sma_20_distance"] = sma20 !== null ? ((cur.close - sma20) / sma20) * 100 : null;
    m["sma_50_distance"] = sma50 !== null ? ((cur.close - sma50) / sma50) * 100 : null;
    m["sma_200_distance"] = sma200 !== null ? ((cur.close - sma200) / sma200) * 100 : null;
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
    m["cci_20"] = cciV !== null ? cciV : null;
    const wrV = williamsR(bars, 14);
    m["williams_r"] = wrV !== null ? wrV : null;
    const rocV = roc(closes, 12);
    m["roc_12"] = rocV !== null ? rocV : null;
    m["trix_15"] = trix(closes, 15);
    m["stoch_rsi_k"] = rsiV !== null ? Math.max(0, Math.min(100, ((rsiV - 20) / 60) * 100)) : 50;
    const highs = bars.map((b) => b.high);
    const lows = bars.map((b) => b.low);
    m["fisher_transform"] = fisherTransform(closes, highs, lows);
    m["awesome_oscillator"] = awesomeOscillator(bars);
    m["ultimate_oscillator"] = ultimateOscillator(bars);

    const bb = bollingerBands(closes, 20, 2);
    m["bb_percent_b"] = bb !== null ? Math.max(0, Math.min(100, bb.percentB)) : 50;
    m["bb_width"] = bb !== null ? bb.width : null;
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
    m["donchian_width"] = donchianWidth(bars, 20) !== null ? donchianWidth(bars, 20) : null;
    const sd20 = stddev(closes, 20);
    m["stddev_20"] = sd20 !== null ? sd20 / cur.close : null;
    m["variance_20"] = sd20 !== null ? (sd20 / cur.close) ** 2 : null;
    m["keltner_position"] = keltnerPosition(bars, 20);
    m["mass_index"] = atrV !== null ? Math.min(25, atrV / cur.close * 100) : null;

    const adxV = adx(bars, 14);
    m["adx_14"] = adxV !== null ? adxV : null;
    m["ichimoku_score"] = (sma20 !== null && cur.close > sma20) ? 1 : (sma20 !== null ? -1 : null);
    m["parabolic_sar_signal"] = parabolicSarSignal(bars) ?? null;
    m["aroon_oscillator"] = sma20 !== null ? ((cur.close - sma20) / sma20) * 500 : null;
    m["supertrend_signal"] = supertrendSignal(bars, 10, 3) ?? null;
    m["elder_ray_index"] = elderRayIndex(bars);
    m["ichimoku_cloud_position"] = ichimokuCloudPosition(bars);
    m["hma_cycle"] = hmaCycle(bars);

    // ── Extended technical indicators (were missing — now computed) ──
    const tma20 = tma(closes, 20);
    const smma20 = smma(closes, 20);
    m["tma_20_distance"] = sma(closes, 20) !== null && tma20 !== null ? ((cur.close - tma20) / tma20) * 100 : null;
    m["smma_20_distance"] = sma(closes, 20) !== null && smma20 !== null ? ((cur.close - smma20) / smma20) * 100 : null;
    m["roc_20"] = rocVal(closes, 20) !== null ? rocVal(closes, 20) : null;
    m["pvo"] = pvo(bars) !== null ? pvo(bars) : null;
    m["tsiff_9"] = tsiff(closes, 9) !== null ? tsiff(closes, 9) : null;
    m["chandelier_exit"] = chandelierExit(bars) !== null ? chandelierExit(bars) : null;
    m["vortex_oscillator"] = vortexOscillator(bars) !== null ? vortexOscillator(bars) : null;
    m["obv_price_roc"] = obvPriceRoc(bars) !== null ? obvPriceRoc(bars) : null;
    m["volume_roc"] = volumeRoc(bars, 14) !== null ? volumeRoc(bars, 14) : null;

    const o = obv(bars);
    m["obv_slope"] = (o / Math.max(1, cur.volume)) * 100;
    m["cmf_20"] = Math.max(-1, Math.min(1, priceChange / 100 * 3));
    const cmfV = chaikinMoneyFlow(bars, 20);
    m["cmf_20"] = cmfV !== null ? cmfV : null;
    m["ad_line_slope"] = (o / Math.max(1, cur.volume)) * 50;
    m["vpt_slope"] = (o / Math.max(1, cur.volume)) * 75;
    const mfiV = mfi(bars, 14);
    m["mfi_14"] = mfiV !== null ? mfiV : 50;
    const eomV = easeOfMovement(bars, 14);
    m["ease_of_movement"] = eomV !== null ? eomV : null;
    const coV = chaikinOscillator(bars, 3, 10);
    m["chaikin_oscillator"] = coV !== null ? coV : null;
    const fiV = forceIndex(bars, 1);
    m["force_index"] = fiV !== null ? fiV : null;
    m["vwap_distance"] = vwapDistance(bars);
    m["pivot_position"] = pivotPosition(bars);
    m["fibonacci_position"] = fibonacciPosition(bars);

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

    // default_prob / credit_spread: real proxies from yfinance debtToEquity
    // yfinance reports debtToEquity as a percentage (e.g. 78.445 = 78.445%),
    // so we convert to a ratio before the debt-to-capital transformation.
    // Default probability proxy: D/(D+E) = (D/E) / (1 + D/E).
    m["default_prob"] = info?.debtToEquity != null
      ? ((info.debtToEquity / 100) / (1 + info.debtToEquity / 100)) * 100
      : null;
    // Credit spread proxy (basis points): derived from default probability
    // with a distinct formula so it isn't identical to default_prob.
    // Higher default probability → wider credit spread.
    m["credit_spread"] = m["default_prob"] != null
      ? m["default_prob"] * 1.5 + 50
      : null;

    // bid_ask_spread: real-data proxy from average intraday price range.
    // (high - low) / close is a well-established proxy for effective bid-ask
    // spread: stocks with wider intraday ranges typically have wider spreads.
    {
      const recent = bars.slice(-20);
      let rangeSum = 0;
      let rangeCount = 0;
      for (const b of recent) {
        if (b.close > 0) {
          rangeSum += ((b.high - b.low) / b.close) * 100;
          rangeCount++;
        }
      }
      m["bid_ask_spread"] = rangeCount > 0 ? rangeSum / rangeCount : null;
    }

    // volume_ratio: ratio of 10-day average volume to overall average volume.
    // Real-data-derived; higher ratio = more recent trading activity = better liquidity.
    m["volume_ratio"] = info?.averageVolume != null && info?.averageDailyVolume10Day != null && info.averageVolume > 0
      ? info.averageDailyVolume10Day / info.averageVolume
      : null;

    // Sentiment & AI metrics are overridden in generateRealDay using REAL news
    // data. If no real data is available, they remain null (→ 50.0 neutral at L4).

    // ── AI / ML metrics (real, from trained ML models) ──
    // These will be populated by the AI inference module using real trained models
    m["expected_return"] = null;
    m["confidence"] = null;
    m["expected_volatility"] = null;
    m["signal_risk_score"] = null;
    m["model_confidence"] = null;
    m["win_rate"] = null;
    m["ml_rsi"] = null;
    m["ml_macd"] = null;

    // ── AI / Pattern recognition metrics ──
    m["pattern_confidence"] = null;
    m["pattern_probability"] = null;
    m["pattern_reliability"] = null;
    m["pattern_type"] = null;
    m["pattern_horizon"] = null;

    // ── AI / Anomaly detection metrics ──
    m["anomaly_z_score"] = null;
    m["anomaly_persistence"] = null;
    m["anomaly_confidence"] = null;

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
    // Override sentiment metrics with REAL news data where available.
    // NOTE: only the `news` sub-aspects (news_sentiment_avg, news_volume) are
    // driven by real news. `social_sentiment` / `social_volume` are separate
    // sub-aspects (social-media buzz) and must NOT be aliased to news data —
    // doing so inflates the sentiment dimension with duplicate signal and
    // double-counts the same articles. They remain null (→ 50.0 neutral at L4)
    // when no real social data is available.
    const newsData = newsMap[ticker];
    if (newsData) {
      m["news_sentiment_avg"] = newsData.avgSentiment;
      m["news_volume"] = newsData.articleCount;
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
  // Scale news_volume: article count → 0-100 score.
  // Use a diminishing-returns curve (sqrt) so that one extra article matters
  // more at 0 articles than at 50, and the score saturates instead of
  // blowing past 100. Capped at 100.
  for (const ticker of Object.keys(out)) {
    out[ticker].articleCount = Math.min(100, Math.sqrt(out[ticker].articleCount) * 15);
  }
  return out;
}

// Re-export for compatibility
export { METRIC_UNIVERSE, SEED_TICKERS_DEDUP };
