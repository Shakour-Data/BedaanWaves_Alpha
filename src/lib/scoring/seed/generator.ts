// BedaanWaves — deterministic per-day metric generator.
// Produces realistic OHLCV-derived technicals, fundamentals, macro, sentiment,
// AI signals for every NASDAQ ticker on every trading day. Deterministic given
// (ticker, dayIndex) so the entire dataset is reproducible.

import { SEED_TICKERS_DEDUP, type SeedTicker } from "./universe";
import { METRIC_UNIVERSE } from "../metric-universe";

// ─── Deterministic PRNG (Mulberry32) ────────────────────────────────────────
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ─── Trading calendar (skip weekends, ~90 trading days back from "today") ──
export function tradingDays(count: number, endMs?: number): Date[] {
  const end = endMs ? new Date(endMs) : new Date();
  end.setUTCHours(22, 0, 0, 0); // market close UTC-ish (NY 18:00 EDT ≈ 22:00 UTC)
  const out: Date[] = [];
  const d = new Date(end);
  while (out.length < count) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) out.push(new Date(d));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out.reverse();
}

// ─── Macro time-series (shared across all tickers, slowly varying) ──────────
export interface MacroState {
  gdp_qoq: number;
  real_gdp: number;
  industrial_production: number;
  capacity_utilization: number;
  housing_permits: number;
  consumer_sentiment: number;
  cpi_index: number;
  core_cpi_index: number;
  inflation_yoy: number;
  core_inflation_yoy: number;
  fed_funds_rate: number;
  treasury_yield_2y: number;
  treasury_yield_10y: number;
  treasury_yield_30y: number;
  yield_curve_spread: number;
  dollar_index: number;
  usd_eur: number;
  usd_gbp: number;
  usd_jpy: number;
  oil_price: number;
  gold_price: number;
  nonfarm_payrolls: number;
  unemployment_rate: number;
}

export function macroForDay(dayIdx: number): MacroState {
  const rng = mulberry32(0x4ac907 + dayIdx * 31);
  // Slow random walk anchored to realistic 2024 levels.
  const t = dayIdx / 90;
  const noise = (s: number) => (rng() - 0.5) * s;
  const fedFunds = 5.25 + Math.sin(t * 3) * 0.15 + noise(0.05);
  const y10 = 4.3 + Math.sin(t * 4 + 0.5) * 0.25 + noise(0.08);
  const y2 = 4.7 + Math.sin(t * 4 + 0.2) * 0.20 + noise(0.07);
  const y30 = 4.45 + Math.sin(t * 3.5 + 1.0) * 0.20 + noise(0.06);
  const cpi = 312 + t * 4 + noise(0.5);
  const coreCpi = 320 + t * 3 + noise(0.4);
  const inflationYoy = 2.9 + Math.sin(t * 5) * 0.25 + noise(0.1);
  const coreInflationYoy = 3.2 + Math.sin(t * 4.5 + 0.7) * 0.20 + noise(0.08);
  const dxy = 104 + Math.sin(t * 6 + 1.5) * 2.5 + noise(0.4);
  const usd_eur = 0.92 + Math.sin(t * 5 + 0.4) * 0.015 + noise(0.004);
  const usd_gbp = 0.79 + Math.sin(t * 5 + 1.0) * 0.012 + noise(0.003);
  const usd_jpy = 152 + Math.sin(t * 6 + 2.0) * 8 + noise(1.2);
  const oil = 78 + Math.sin(t * 4 + 0.8) * 6 + noise(1.5);
  const gold = 2350 + t * 80 + Math.sin(t * 3) * 40 + noise(8);
  const gdp_qoq = 0.45 + Math.sin(t * 2) * 0.15 + noise(0.05);
  const real_gdp = 2.7 + Math.sin(t * 2.5) * 0.3 + noise(0.1);
  const industrial_production = 103 + Math.sin(t * 3 + 0.3) * 1.5 + noise(0.3);
  const capacity_utilization = 78 + Math.sin(t * 4) * 1.2 + noise(0.3);
  const housing_permits = 1.46 + Math.sin(t * 3.5 + 0.7) * 0.08 + noise(0.02);
  const consumer_sentiment = 70 + Math.sin(t * 5 + 1.2) * 4 + noise(1.0);
  const nonfarm_payrolls = 175 + Math.sin(t * 6) * 35 + noise(8);
  const unemployment_rate = 4.1 + Math.sin(t * 4 + 0.5) * 0.2 + noise(0.05);
  return {
    gdp_qoq, real_gdp, industrial_production, capacity_utilization,
    housing_permits, consumer_sentiment, cpi_index: cpi, core_cpi_index: coreCpi,
    inflation_yoy: inflationYoy, core_inflation_yoy: coreInflationYoy,
    fed_funds_rate: fedFunds, treasury_yield_2y: y2, treasury_yield_10y: y10,
    treasury_yield_30y: y30, yield_curve_spread: y10 - y2,
    dollar_index: dxy, usd_eur, usd_gbp, usd_jpy, oil_price: oil, gold_price: gold,
    nonfarm_payrolls, unemployment_rate,
  };
}

// ─── Per-ticker deterministic metric generation ────────────────────────────
// Returns db_field → value (or null for some fundamental/technical fields).
export interface DayPrice {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  prevClose: number;
  priceChange: number; // % vs prevClose
  rsi: number;
  sma20Dist: number; // % distance from SMA20
  sma50Dist: number;
  macdHist: number;
}

// Per-ticker OHLCV walk generator (stateful across days).
export class TickerWalk {
  public rng: () => number;
  private price: number;
  private beta: number;
  public history: DayPrice[] = [];
  constructor(public ticker: SeedTicker) {
    this.rng = mulberry32(hashStr(ticker.ticker) ^ 0xc0ffee);
    this.price = ticker.basePrice;
    this.beta = ticker.beta;
  }
  step(dayIdx: number, macro: MacroState, marketBias: number): DayPrice {
    // Market regime + idiosyncratic noise
    const trend =
      Math.sin(dayIdx / 14 + hashStr(this.ticker.ticker) * 0.0001) * 0.004;
    const idio = (this.rng() - 0.5) * 0.025;
    const macroDrift =
      (macro.real_gdp - 2.5) * 0.0008 +
      (macro.consumer_sentiment - 70) * 0.00015 -
      (macro.inflation_yoy - 2.5) * 0.0006 -
      (macro.fed_funds_rate - 5.0) * 0.0004;
    const ret =
      marketBias * 0.6 * this.beta + trend * this.beta + idio + macroDrift;
    const prev = this.price;
    let open = prev * (1 + (this.rng() - 0.5) * 0.004);
    let close = prev * (1 + ret);
    if (close < 1) close = 1;
    const hi = Math.max(open, close) * (1 + this.rng() * 0.012);
    const lo = Math.min(open, close) * (1 - this.rng() * 0.012);
    const volume =
      this.ticker.marketCap * 1e9 * (0.005 + this.rng() * 0.015) * (1 + Math.abs(ret) * 8);
    const priceChange = (close - prev) / prev;

    // Maintain rolling stats
    this.history.push({
      open, high: hi, low: lo, close, volume, prevClose: prev,
      priceChange: priceChange * 100,
      rsi: 50, sma20Dist: 0, sma50Dist: 0, macdHist: 0,
    });
    if (this.history.length > 60) this.history.shift();

    // Compute simple technicals from history
    const h = this.history;
    const last = h[h.length - 1];
    if (h.length >= 20) {
      const sma20 = h.slice(-20).reduce((a, p) => a + p.close, 0) / 20;
      last.sma20Dist = ((close - sma20) / sma20) * 100;
    }
    if (h.length >= 50) {
      const sma50 = h.slice(-50).reduce((a, p) => a + p.close, 0) / 50;
      last.sma50Dist = ((close - sma50) / sma50) * 100;
    }
    if (h.length >= 15) {
      // RSI 14
      let g = 0, l = 0;
      for (let i = h.length - 14; i < h.length; i++) {
        const ch = h[i].close - h[i - 1].close;
        if (ch > 0) g += ch; else l -= ch;
      }
      const rs = l === 0 ? 100 : g / l;
      last.rsi = 100 - 100 / (1 + rs);
    }
    if (h.length >= 26) {
      // MACD histogram proxy
      const ema12 = ema(h.slice(-26), 12);
      const ema26 = ema(h.slice(-26), 26);
      const macdLine = ema12 - ema26;
      const signal = macdLine * 0.9; // smoothed proxy
      last.macdHist = ((macdLine - signal) / close) * 100;
    }

    this.price = close;
    return last;
  }
}

function ema(prices: { close: number }[], period: number): number {
  if (prices.length === 0) return 0;
  const k = 2 / (period + 1);
  let e = prices[0].close;
  for (let i = 1; i < prices.length; i++) {
    e = prices[i].close * k + e * (1 - k);
  }
  return e;
}

// ─── Per-day full metric matrix ─────────────────────────────────────────────
export interface DayMetrics {
  prices: Record<string, DayPrice>;
  macro: MacroState;
  // raw metric values per ticker per db_field
  assetMetrics: Record<string, Record<string, number | null>>;
}

export interface GenState {
  walks: Map<string, TickerWalk>;
  marketBias: number; // updated each day
}

export function newGenState(): GenState {
  const walks = new Map<string, TickerWalk>();
  for (const t of SEED_TICKERS_DEDUP) walks.set(t.ticker, new TickerWalk(t));
  return { walks, marketBias: 0 };
}

export function generateDay(
  state: GenState,
  dayIdx: number
): DayMetrics {
  const macro = macroForDay(dayIdx);
  const prices: Record<string, DayPrice> = {};
  // Market regime: blend of macro drift + slow oscillation
  const marketBias =
    Math.sin(dayIdx / 9) * 0.006 +
    (macro.consumer_sentiment - 70) * 0.00015 -
    (macro.fed_funds_rate - 5) * 0.0008;
  state.marketBias = marketBias;

  const assetMetrics: Record<string, Record<string, number | null>> = {};
  for (const t of SEED_TICKERS_DEDUP) {
    const walk = state.walks.get(t.ticker)!;
    const px = walk.step(dayIdx, macro, marketBias);
    prices[t.ticker] = px;
    const m: Record<string, number | null> = {};
    // ── Technical (driven by price walk) ──
    m["rsi_14"] = px.rsi;
    m["macd_histogram"] = px.macdHist;
    m["sma_20_distance"] = px.sma20Dist;
    m["sma_50_distance"] = px.sma50Dist;
    m["sma_200_distance"] = px.sma20Dist * 1.5;
    m["ema_12_distance"] = px.sma20Dist * 0.85;
    m["ema_26_distance"] = px.sma20Dist * 0.92;
    m["ema_50_distance"] = px.sma20Dist * 1.1;
    m["wma_10_distance"] = px.sma20Dist * 0.7;
    m["wma_20_distance"] = px.sma20Dist;
    m["dema_20_distance"] = px.sma20Dist * 0.95;
    m["tema_20_distance"] = px.sma20Dist * 0.88;
    m["t3_20_distance"] = px.sma20Dist * 0.9;
    m["hull_20_distance"] = px.sma20Dist * 1.15;
    m["vwma_20_distance"] = px.sma20Dist * 1.05;
    m["stoch_k"] = clamp01((px.rsi - 10) / 80) * 100;
    m["kdj_j"] = (px.rsi - 50) * 2.5;
    m["cci_20"] = (px.sma20Dist * 8) + (walk.rng() - 0.5) * 30;
    m["williams_r"] = -50 + px.sma20Dist * -2;
    m["roc_12"] = px.priceChange * 1.2;
    m["trix_15"] = px.priceChange * 0.08;
    m["stoch_rsi_k"] = clamp01((px.rsi - 20) / 60) * 100;
    m["fisher_transform"] = Math.log((px.rsi / 100) / (1 - px.rsi / 100) + 0.001);
    m["awesome_oscillator"] = px.macdHist * 0.5;
    m["ultimate_oscillator"] = px.rsi * 0.7 + 30;
    m["bb_percent_b"] = clamp(px.sma20Dist * 4 + 50, 0, 100);
    m["atr_ratio"] = Math.abs(px.priceChange) / 100 + 0.01;
    m["kama_10_distance"] = px.sma20Dist * 0.6;
    m["donchian_position"] = clamp(px.sma20Dist * 2 + 50, 0, 100);
    m["stddev_20"] = Math.abs(px.priceChange) / 100 + 0.005;
    m["variance_20"] = (Math.abs(px.priceChange) / 100) ** 2 + 0.0001;
    m["keltner_position"] = clamp(px.sma20Dist * 3 + 50, 0, 100);
    m["mass_index"] = Math.abs(px.priceChange) * 0.5 + 5;
    m["adx_14"] = 20 + Math.abs(px.sma20Dist) * 3 + walk.rng() * 10;
    m["ichimoku_score"] = px.sma20Dist > 0 ? 1 : -1;
    m["parabolic_sar_signal"] = px.priceChange > 0 ? 1 : -1;
    m["aroon_oscillator"] = px.sma20Dist * 5;
    m["supertrend_signal"] = px.sma20Dist > 0 ? 1 : -1;
    m["elder_ray_index"] = px.priceChange * 0.5;
    m["ichimoku_cloud_position"] = clamp(px.sma20Dist * 2 + 50, 0, 100);
    m["hma_cycle"] = px.sma20Dist * 0.8;
    m["obv_slope"] = px.volume * px.priceChange / 100;
    m["cmf_20"] = clamp((px.priceChange / 100) * 0.3, -1, 1);
    m["ad_line_slope"] = px.volume * px.priceChange / 200;
    m["vpt_slope"] = px.volume * px.priceChange / 150;
    m["mfi_14"] = clamp(px.rsi + walk.rng() * 10, 0, 100);
    m["ease_of_movement"] = (px.priceChange * t.marketCap) / (px.volume / 1e6 || 1);
    m["chaikin_oscillator"] = px.priceChange * 1e5;
    m["force_index"] = px.volume * px.priceChange / 1e6;
    m["vwap_distance"] = px.priceChange * 0.5;
    m["pivot_position"] = clamp(px.sma20Dist * 3 + 50, 0, 100);
    m["fibonacci_position"] = clamp(px.sma20Dist * 2.5 + 50, 0, 100);
    m["pivot_position"] = clamp(px.sma20Dist * 3 + 50, 0, 100);
    m["fibonacci_position"] = clamp(px.sma20Dist * 2.5 + 50, 0, 100);

    // ── Fundamental (per-ticker stable + slow drift) ──
    const rng = walk.rng;
    m["pe_ratio"] = 15 + t.beta * 8 + rng() * 15;
    m["pb_ratio"] = 2 + t.beta * 2 + rng() * 4;
    m["ev_ebitda"] = 10 + t.beta * 6 + rng() * 8;
    m["peg_ratio"] = 0.8 + rng() * 2.2;
    m["price_to_sales"] = 2 + t.beta * 3 + rng() * 5;
    m["price_to_cash_flow"] = 12 + rng() * 18;
    m["payout_ratio"] = 0.2 + rng() * 0.5;
    m["roe"] = 10 + rng() * 25;
    m["roa"] = 5 + rng() * 15;
    m["roic"] = 8 + rng() * 18;
    m["profit_margin"] = 10 + rng() * 20;
    m["gross_margin"] = 30 + rng() * 40;
    m["operating_margin"] = 12 + rng() * 18;
    m["net_margin"] = 8 + rng() * 15;
    m["ebitda_margin"] = 20 + rng() * 20;
    m["operating_leverage"] = 1 + rng() * 2;
    m["revenue_growth"] = -5 + rng() * 30 + (t.sector === "Technology" ? 8 : 0);
    m["eps_growth"] = -10 + rng() * 35;
    m["earnings_growth"] = -8 + rng() * 30;
    m["free_cash_flow_growth"] = -5 + rng() * 25;
    m["current_ratio"] = 1 + rng() * 3;
    m["quick_ratio"] = 0.7 + rng() * 2;
    m["cash_ratio"] = 0.3 + rng() * 1.5;
    m["asset_turnover"] = 0.3 + rng() * 1.2;
    m["inventory_turnover"] = 3 + rng() * 10;
    m["receivables_turnover"] = 5 + rng() * 12;
    m["debt_to_equity"] = rng() * 2.5;
    m["debt_to_assets"] = 0.2 + rng() * 0.5;
    m["interest_coverage"] = 3 + rng() * 15;
    m["debt_to_ebitda"] = 1 + rng() * 4;
    m["dividend_yield"] = t.sector === "Utilities" ? 0.03 + rng() * 0.02 : rng() * 0.03;
    m["dividend_growth_rate"] = 0.02 + rng() * 0.12;
    m["free_cash_flow_yield"] = 0.02 + rng() * 0.08;
    m["operating_cash_flow_ratio"] = 0.4 + rng() * 1.2;
    m["capex_ratio"] = 0.05 + rng() * 0.2;
    m["cash_conversion_ratio"] = 0.6 + rng() * 0.6;
    m["roe_stability"] = 50 + rng() * 50;
    m["earnings_quality"] = 40 + rng() * 60;

    // ── Sentiment ──
    m["news_sentiment_avg"] = clamp(50 + px.priceChange * 3 + (rng() - 0.5) * 20, 0, 100);
    m["news_volume"] = 50 + rng() * 200 + Math.abs(px.priceChange) * 50;
    m["social_sentiment"] = clamp(50 + px.priceChange * 4 + (rng() - 0.5) * 30, 0, 100);
    m["social_volume"] = 100 + rng() * 500;
    m["analyst_rating"] = clamp(50 + px.sma20Dist * 2 + (rng() - 0.5) * 20, 0, 100);
    m["target_price_change"] = px.priceChange * 1.5 + (rng() - 0.5) * 5;

    // ── Risk ──
    m["volatility_z"] = Math.abs(px.priceChange) / 2 + rng();
    m["max_drawdown"] = Math.abs(Math.min(0, px.priceChange)) + rng() * 5;
    m["var_95"] = Math.abs(px.priceChange) * 1.5 + rng();
    m["var_99"] = Math.abs(px.priceChange) * 2 + rng() * 1.5;
    m["cvar_95"] = Math.abs(px.priceChange) * 1.8 + rng() * 1.2;
    m["sharpe_ratio"] = px.priceChange / (Math.abs(px.priceChange) + 1) * 2 + (rng() - 0.5) * 0.5;
    m["sortino_ratio"] = px.priceChange > 0 ? px.priceChange / 2 + rng() : 0;
    m["beta"] = t.beta;
    m["default_prob"] = rng() * 3;
    m["credit_spread"] = 0.5 + rng() * 3;
    m["bid_ask_spread"] = 0.01 + rng() * 0.1;
    m["volume_ratio"] = 0.8 + rng() * 0.5;
    m["risk_score"] = rng() * 100;

    // ── Macro (same across tickers, but per-ticker weights differ) ──
    m["gdp_qoq"] = macro.gdp_qoq;
    m["real_gdp"] = macro.real_gdp;
    m["industrial_production"] = macro.industrial_production;
    m["capacity_utilization"] = macro.capacity_utilization;
    m["housing_permits"] = macro.housing_permits;
    m["consumer_sentiment"] = macro.consumer_sentiment;
    m["cpi_index"] = macro.cpi_index;
    m["core_cpi_index"] = macro.core_cpi_index;
    m["inflation_yoy"] = macro.inflation_yoy;
    m["core_inflation_yoy"] = macro.core_inflation_yoy;
    m["fed_funds_rate"] = macro.fed_funds_rate;
    m["treasury_yield_2y"] = macro.treasury_yield_2y;
    m["treasury_yield_10y"] = macro.treasury_yield_10y;
    m["treasury_yield_30y"] = macro.treasury_yield_30y;
    m["yield_curve_spread"] = macro.yield_curve_spread;
    m["dollar_index"] = macro.dollar_index;
    m["usd_eur"] = macro.usd_eur;
    m["usd_gbp"] = macro.usd_gbp;
    m["usd_jpy"] = macro.usd_jpy;
    m["oil_price"] = macro.oil_price;
    m["gold_price"] = macro.gold_price;
    m["nonfarm_payrolls"] = macro.nonfarm_payrolls;
    m["unemployment_rate"] = macro.unemployment_rate;

    // ── AI ──
    m["expected_return"] = px.priceChange * 1.2 + (rng() - 0.5) * 4;
    m["confidence"] = clamp(50 + Math.abs(px.priceChange) * 5 + (rng() - 0.5) * 30, 0, 100);
    m["expected_volatility"] = Math.abs(px.priceChange) + rng();
    m["signal_risk_score"] = 30 + rng() * 50;
    m["model_confidence"] = clamp(50 + px.sma20Dist + (rng() - 0.5) * 40, 0, 100);
    m["win_rate"] = 45 + rng() * 20;
    m["ml_rsi"] = px.rsi + (rng() - 0.5) * 10;
    m["ml_macd"] = px.macdHist + (rng() - 0.5) * 2;
    m["pattern_confidence"] = clamp(40 + px.priceChange * 3 + rng() * 40, 0, 100);
    m["pattern_probability"] = clamp(40 + px.priceChange * 2.5 + rng() * 30, 0, 100);
    m["pattern_reliability"] = clamp(50 + (rng() - 0.3) * 50, 0, 100);
    m["pattern_type"] = px.priceChange > 1 ? 70 : px.priceChange < -1 ? 30 : 50;
    m["pattern_horizon"] = 3 + rng() * 15;
    m["anomaly_z_score"] = Math.abs(px.priceChange) + rng() * 0.5;
    m["anomaly_persistence"] = rng();
    m["anomaly_confidence"] = clamp(40 + Math.abs(px.priceChange) * 5 + rng() * 40, 0, 100);

    // Introduce occasional nulls (~3% per field) to exercise coverage path
    if (dayIdx % 17 === 0 && t.ticker.charCodeAt(0) % 3 === 0) {
      // Sporadic missing data — neutral 50.0 in scoring per spec §1.2
      m["obv_slope"] = null;
      m["earnings_quality"] = null;
      m["social_volume"] = null;
    }

    assetMetrics[t.ticker] = m;
  }

  return { prices, macro, assetMetrics };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

// Re-export for seed script
export { METRIC_UNIVERSE, SEED_TICKERS_DEDUP };
