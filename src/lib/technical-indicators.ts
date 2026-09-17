// BedaanWaves — pure technical indicator functions (display-only, computed from
// REAL candles — spec §12). No file I/O so these are safe to import into client
// components. Mirrors the indicator set computed during real-data seeding.
export interface Bar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  let s = 0;
  for (let i = values.length - period; i < values.length; i++) s += values[i];
  return s / period;
}

export function ema(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let e = values[0];
  for (let i = 1; i < values.length; i++) {
    e = values[i] * k + e * (1 - k);
  }
  return e;
}

export function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch > 0) gains += ch;
    else losses -= ch;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

export interface MACD {
  macdLine: number;
  signal: number;
  histogram: number;
}
export function macd(closes: number[]): MACD | null {
  if (closes.length < 26) return null;
  const e12 = ema(closes.slice(-26), 12);
  const e26 = ema(closes.slice(-26), 26);
  if (e12 === null || e26 === null) return null;
  const macdLine = e12 - e26;
  const series: number[] = [];
  for (let i = 26; i <= closes.length; i++) {
    const e12s = ema(closes.slice(0, i), 12);
    const e26s = ema(closes.slice(0, i), 26);
    if (e12s !== null && e26s !== null) series.push(e12s - e26s);
  }
  let signal = macdLine;
  const k = 2 / 10;
  if (series.length >= 9) {
    signal = series[series.length - 9];
    for (let i = series.length - 8; i < series.length; i++) {
      signal = series[i] * k + signal * (1 - k);
    }
  }
  return { macdLine, signal, histogram: macdLine - signal };
}

export function bollingerPercentB(closes: number[], period = 20, mult = 2): number | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const m = slice.reduce((a, b) => a + b, 0) / period;
  const sd = Math.sqrt(slice.reduce((a, b) => a + (b - m) ** 2, 0) / period);
  const upper = m + mult * sd;
  const lower = m - mult * sd;
  const last = closes[closes.length - 1];
  if (upper === lower) return 50;
  return ((last - lower) / (upper - lower)) * 100;
}

export function atr(bars: Bar[], period = 14): number | null {
  if (bars.length < period + 1) return null;
  let sum = 0;
  for (let i = bars.length - period; i < bars.length; i++) {
    const h = bars[i].high;
    const l = bars[i].low;
    const pc = bars[i - 1].close;
    sum += Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }
  return sum / period;
}

export function adx(bars: Bar[], period = 14): number | null {
  if (bars.length < period * 2) return null;
  const dmPlus: number[] = [];
  const dmMinus: number[] = [];
  const tr: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const up = bars[i].high - bars[i - 1].high;
    const down = bars[i - 1].low - bars[i].low;
    dmPlus.push(up > down && up > 0 ? up : 0);
    dmMinus.push(down > up && down > 0 ? down : 0);
    const h = bars[i].high;
    const l = bars[i].low;
    const pc = bars[i - 1].close;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const avg = (arr: number[]) =>
    arr.length < period ? 0 : arr.slice(-period).reduce((a, b) => a + b, 0) / period;
  const atrN = avg(tr);
  const diPlus = (avg(dmPlus) / Math.max(atrN, 1e-9)) * 100;
  const diMinus = (avg(dmMinus) / Math.max(atrN, 1e-9)) * 100;
  const dx = ((Math.abs(diPlus - diMinus) / (diPlus + diMinus || 1)) * 100) || 0;
  return dx;
}

export function obv(bars: Bar[]): number {
  let o = 0;
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].close > bars[i - 1].close) o += bars[i].volume;
    else if (bars[i].close < bars[i - 1].close) o -= bars[i].volume;
  }
  return o;
}

export function mfi(bars: Bar[], period = 14): number | null {
  if (bars.length < period + 1) return null;
  let posFlow = 0;
  let negFlow = 0;
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

export function williamsR(bars: Bar[], period = 14): number | null {
  if (bars.length < period) return null;
  const slice = bars.slice(-period);
  const hh = Math.max(...slice.map((b) => b.high));
  const ll = Math.min(...slice.map((b) => b.low));
  const close = bars[bars.length - 1].close;
  if (hh === ll) return -50;
  return ((hh - close) / (hh - ll)) * -100;
}

export function roc(closes: number[], period = 12): number | null {
  if (closes.length < period + 1) return null;
  const prev = closes[closes.length - period - 1];
  if (prev === 0) return null;
  return ((closes[closes.length - 1] - prev) / prev) * 100;
}

export function returns(closes: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    r.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  return r;
}
