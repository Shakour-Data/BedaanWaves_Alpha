// BedaanWaves — METRIC_UNIVERSE
// Canonical source of truth for the 4-level scoring taxonomy.
// Tuple shape: { dim, subDim, aspect, subAspect, dbField, lowerIsBetter }
//
// Per spec §2: 6 Dimensions → 44 Sub-Dimensions → 135 Aspects → 173 Sub-Aspects → 865+ Indicators.
// We enumerate the sub-aspects verbatim from spec §2.3.

export type DimensionKey =
  | "fundamental"
  | "technical"
  | "sentiment"
  | "risk"
  | "macro"
  | "ai";

export const DIMENSION_KEYS: DimensionKey[] = [
  "fundamental",
  "technical",
  "sentiment",
  "risk",
  "macro",
  "ai",
];

export const DIMENSION_META: Record<
  DimensionKey,
  { label: string; color: string; description: string }
> = {
  fundamental: {
    label: "Fundamental",
    color: "#10b981",
    description:
      "Valuation, profitability, growth, liquidity, efficiency, solvency, dividend, cash flow, quality",
  },
  technical: {
    label: "Technical",
    color: "#3b82f6",
    description:
      "Moving averages, momentum, volatility, trend, volume, support/resistance across 4 timeframes",
  },
  sentiment: {
    label: "Sentiment",
    color: "#f59e0b",
    description: "News sentiment & volume, social buzz, analyst ratings",
  },
  risk: {
    label: "Risk",
    color: "#ef4444",
    description: "Market, credit, liquidity, operational risk (VaR, drawdown, Sharpe, beta)",
  },
  macro: {
    label: "Macro",
    color: "#8b5cf6",
    description: "GDP, inflation, interest rates, FX, commodities, employment",
  },
  ai: {
    label: "AI",
    color: "#ec4899",
    description: "ML signals, pattern recognition, anomaly detection",
  },
};

export interface MetricSpec {
  dim: DimensionKey;
  subDim: string;
  aspect: string;
  subAspect: string;
  dbField: string;
  lowerIsBetter: boolean;
}

function m(
  dim: DimensionKey,
  subDim: string,
  subAspect: string,
  lowerIsBetter = false,
  aspect?: string
): MetricSpec {
  return {
    dim,
    subDim,
    aspect: aspect ?? subAspect,
    subAspect,
    dbField: subAspect,
    lowerIsBetter,
  };
}

export const METRIC_UNIVERSE: MetricSpec[] = [
  // ── fundamental / valuation ───────────────────────────────────────────
  m("fundamental", "valuation", "pe_ratio", true),
  m("fundamental", "valuation", "pb_ratio", true),
  m("fundamental", "valuation", "ev_ebitda", true),
  m("fundamental", "valuation", "peg_ratio", true),
  m("fundamental", "valuation", "price_to_sales", true),
  m("fundamental", "valuation", "price_to_cash_flow", true),
  m("fundamental", "valuation", "payout_ratio", false),
  // ── fundamental / profitability ────────────────────────────────────────
  m("fundamental", "profitability", "roe", false),
  m("fundamental", "profitability", "roa", false),
  m("fundamental", "profitability", "roic", false),
  m("fundamental", "profitability", "profit_margin", false),
  m("fundamental", "profitability", "gross_margin", false),
  m("fundamental", "profitability", "operating_margin", false),
  m("fundamental", "profitability", "net_margin", false),
  m("fundamental", "profitability", "ebitda_margin", false),
  m("fundamental", "profitability", "operating_leverage", false),
  // ── fundamental / growth ──────────────────────────────────────────────
  m("fundamental", "growth", "revenue_growth", false),
  m("fundamental", "growth", "eps_growth", false),
  m("fundamental", "growth", "earnings_growth", false),
  m("fundamental", "growth", "free_cash_flow_growth", false),
  // ── fundamental / liquidity ────────────────────────────────────────────
  m("fundamental", "liquidity", "current_ratio", false),
  m("fundamental", "liquidity", "quick_ratio", false),
  m("fundamental", "liquidity", "cash_ratio", false),
  // ── fundamental / efficiency ───────────────────────────────────────────
  m("fundamental", "efficiency", "asset_turnover", false),
  m("fundamental", "efficiency", "inventory_turnover", false),
  m("fundamental", "efficiency", "receivables_turnover", false),
  // ── fundamental / solvency ─────────────────────────────────────────────
  m("fundamental", "solvency", "debt_to_equity", true),
  m("fundamental", "solvency", "debt_to_assets", true),
  m("fundamental", "solvency", "interest_coverage", false),
  m("fundamental", "solvency", "debt_to_ebitda", true),
  // ── fundamental / dividend ─────────────────────────────────────────────
  m("fundamental", "dividend", "dividend_yield", false),
  m("fundamental", "dividend", "dividend_growth_rate", false),
  // ── fundamental / cash_flow ────────────────────────────────────────────
  m("fundamental", "cash_flow", "free_cash_flow_yield", false),
  m("fundamental", "cash_flow", "operating_cash_flow_ratio", false),
  m("fundamental", "cash_flow", "capex_ratio", true),
  m("fundamental", "cash_flow", "cash_conversion_ratio", false),
  // ── fundamental / quality ──────────────────────────────────────────────
  m("fundamental", "quality", "roe_stability", false),
  m("fundamental", "quality", "earnings_quality", false),

  // ── technical / moving_averages ─────────────────────────────────────────
  ...["sma_20_distance","sma_50_distance","sma_200_distance","ema_12_distance","ema_26_distance","ema_50_distance","wma_10_distance","wma_20_distance","dema_20_distance","tema_20_distance","t3_20_distance","hull_20_distance","vwma_20_distance"].map((k) => m("technical","moving_averages", k, false)),
  // ── technical / momentum ────────────────────────────────────────────────
  ...["rsi_14","macd_histogram","stoch_k","kdj_j","cci_20","williams_r","roc_12","trix_15","stoch_rsi_k","fisher_transform","awesome_oscillator","ultimate_oscillator"].map((k) => m("technical","momentum", k, false)),
  // ── technical / volatility ──────────────────────────────────────────────
  m("technical","volatility","bb_percent_b", false),
  m("technical","volatility","atr_ratio", true),
  m("technical","volatility","kama_10_distance", false),
  m("technical","volatility","donchian_position", false),
  m("technical","volatility","stddev_20", true),
  m("technical","volatility","variance_20", true),
  m("technical","volatility","keltner_position", false),
  m("technical","volatility","mass_index", true),
  // ── technical / trend ───────────────────────────────────────────────────
  m("technical","trend","adx_14", false),
  m("technical","trend","ichimoku_score", false),
  m("technical","trend","parabolic_sar_signal", false),
  m("technical","trend","aroon_oscillator", false),
  m("technical","trend","supertrend_signal", false),
  m("technical","trend","elder_ray_index", false),
  // ── technical / volume ───────────────────────────────────────────────────
  m("technical","volume","obv_slope", false),
  m("technical","volume","cmf_20", false),
  m("technical","volume","ad_line_slope", false),
  m("technical","volume","vpt_slope", false),
  m("technical","volume","mfi_14", false),
  m("technical","volume","ease_of_movement", false),
  m("technical","volume","chaikin_oscillator", false),
  m("technical","volume","force_index", false),
  m("technical","volume","vwap_distance", false),
  // ── technical / support_resistance ───────────────────────────────────────
  m("technical","support_resistance","pivot_position", false),
  m("technical","support_resistance","fibonacci_position", false),
  // ── technical / ichimoku ─────────────────────────────────────────────────
  m("technical","ichimoku","ichimoku_cloud_position", false),
  // ── technical / cycles ──────────────────────────────────────────────────
  m("technical","cycles","hma_cycle", false),

  // ── sentiment / news ─────────────────────────────────────────────────────
  m("sentiment","news","news_sentiment_avg", false),
  m("sentiment","news","news_volume", false),
  // ── sentiment / social ────────────────────────────────────────────────────
  m("sentiment","social","social_sentiment", false),
  m("sentiment","social","social_volume", false),
  // ── sentiment / analyst ──────────────────────────────────────────────────
  m("sentiment","analyst","analyst_rating", false),
  m("sentiment","analyst","target_price_change", false),

  // ── risk / market_risk ────────────────────────────────────────────────────
  m("risk","market_risk","volatility_z", true),
  m("risk","market_risk","max_drawdown", true),
  m("risk","market_risk","var_95", true),
  m("risk","market_risk","var_99", true),
  m("risk","market_risk","cvar_95", true),
  m("risk","market_risk","sharpe_ratio", false),
  m("risk","market_risk","sortino_ratio", false),
  m("risk","market_risk","beta", false),
  // ── risk / credit_risk ────────────────────────────────────────────────────
  m("risk","credit_risk","default_prob", true),
  m("risk","credit_risk","credit_spread", true),
  // ── risk / liquidity_risk ────────────────────────────────────────────────
  m("risk","liquidity_risk","bid_ask_spread", true),
  m("risk","liquidity_risk","volume_ratio", false),
  // ── risk / operational_risk ───────────────────────────────────────────────
  m("risk","operational_risk","risk_score", true),

  // ── macro / gdp ──────────────────────────────────────────────────────────
  m("macro","gdp","gdp_qoq", false),
  m("macro","gdp","real_gdp", false),
  m("macro","gdp","gdp_growth_yoy", false),
  m("macro","gdp","industrial_production", false),
  m("macro","gdp","capacity_utilization", false),
  m("macro","gdp","housing_permits", false),
  m("macro","gdp","consumer_sentiment", false),
  m("macro","gdp","exports_growth", false),
  m("macro","gdp","imports_growth", false),
  m("macro","gdp","gdp_deflator_inflation", true),
  m("macro","gdp","gdp_per_capita", false),
  m("macro","gdp","gov_spending_gdp", false),
  // ── macro / inflation ────────────────────────────────────────────────────
  m("macro","inflation","cpi_index", true),
  m("macro","inflation","core_cpi_index", true),
  m("macro","inflation","inflation_yoy", true),
  m("macro","inflation","cpi_inflation_yoy", true),
  m("macro","inflation","core_inflation_yoy", true),
  // ── macro / interest_rates ────────────────────────────────────────────────
  m("macro","interest_rates","fed_funds_rate", true),
  m("macro","interest_rates","treasury_yield_2y", true),
  m("macro","interest_rates","treasury_yield_5y", true),
  m("macro","interest_rates","treasury_yield_10y", true),
  m("macro","interest_rates","treasury_yield_13w", true),
  m("macro","interest_rates","treasury_yield_30y", true),
  m("macro","interest_rates","yield_curve_spread", false),
  // ── macro / volatility ─────────────────────────────────────────────────────
  m("macro","volatility","vix", false),
  // ── macro / exchange_rates ────────────────────────────────────────────────
  m("macro","exchange_rates","dollar_index", false),
  m("macro","exchange_rates","usd_eur", false),
  m("macro","exchange_rates","usd_gbp", false),
  m("macro","exchange_rates","usd_jpy", false),
  // ── macro / commodity_prices ──────────────────────────────────────────────
  m("macro","commodity_prices","oil_price", false),
  m("macro","commodity_prices","gold_price", false),
  // ── macro / employment ────────────────────────────────────────────────────
  m("macro","employment","nonfarm_payrolls", false),
  m("macro","employment","unemployment_rate", true),

  // ── ai / ml_signal ─────────────────────────────────────────────────────────
  m("ai","ml_signal","expected_return", false),
  m("ai","ml_signal","confidence", false),
  m("ai","ml_signal","expected_volatility", true),
  m("ai","ml_signal","signal_risk_score", true),
  m("ai","ml_signal","model_confidence", false),
  m("ai","ml_signal","win_rate", false),
  m("ai","ml_signal","ml_rsi", false),
  m("ai","ml_signal","ml_macd", false),
  // ── ai / pattern_recognition ──────────────────────────────────────────────
  m("ai","pattern_recognition","pattern_confidence", false),
  m("ai","pattern_recognition","pattern_probability", false),
  m("ai","pattern_recognition","pattern_reliability", false),
  m("ai","pattern_recognition","pattern_type", false),
  m("ai","pattern_recognition","pattern_horizon", false),
  // ── ai / anomaly_detection ────────────────────────────────────────────────
  m("ai","anomaly_detection","anomaly_z_score", true),
  m("ai","anomaly_detection","anomaly_persistence", true),
  m("ai","anomaly_detection","anomaly_confidence", false),
];

// ─── Derived structure (no duplication, no drift) ──────────────────────────
export const SUB_DIMENSIONS: Record<DimensionKey, string[]> = (() => {
  const out: Record<DimensionKey, string[]> = {
    fundamental: [], technical: [], sentiment: [], risk: [], macro: [], ai: [],
  };
  for (const spec of METRIC_UNIVERSE) {
    if (!out[spec.dim].includes(spec.subDim)) out[spec.dim].push(spec.subDim);
  }
  return out;
})();

export const ASPECTS: Record<DimensionKey, string[]> = (() => {
  const out: Record<DimensionKey, string[]> = {
    fundamental: [], technical: [], sentiment: [], risk: [], macro: [], ai: [],
  };
  for (const spec of METRIC_UNIVERSE) {
    if (!out[spec.dim].includes(spec.aspect)) out[spec.dim].push(spec.aspect);
  }
  return out;
})();

export const SUB_ASPECTS: Record<DimensionKey, string[]> = (() => {
  const out: Record<DimensionKey, string[]> = {
    fundamental: [], technical: [], sentiment: [], risk: [], macro: [], ai: [],
  };
  for (const spec of METRIC_UNIVERSE) {
    if (!out[spec.dim].includes(spec.subAspect)) out[spec.dim].push(spec.subAspect);
  }
  return out;
})();

export const SUB_ASPECT_PARENT: Record<string, MetricSpec> = METRIC_UNIVERSE.reduce(
  (acc, s) => {
    acc[s.subAspect] = s;
    return acc;
  },
  {} as Record<string, MetricSpec>
);

// Group sub-aspects by sub-dim for convenience
export const SUB_ASPECTS_BY_SUB_DIM: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {};
  for (const spec of METRIC_UNIVERSE) {
    const key = `${spec.dim}/${spec.subDim}`;
    if (!out[key]) out[key] = [];
    out[key].push(spec.subAspect);
  }
  return out;
})();

export const TAXONOMY_STATS = {
  dimensions: DIMENSION_KEYS.length,
  subDimensions: METRIC_UNIVERSE.reduce(
    (acc, s) => acc.add(`${s.dim}/${s.subDim}`),
    new Set<string>()
  ).size,
  aspects: METRIC_UNIVERSE.reduce(
    (acc, s) => acc.add(`${s.dim}/${s.subDim}/${s.aspect}`),
    new Set<string>()
  ).size,
  subAspects: METRIC_UNIVERSE.length,
  indicatorsMin: METRIC_UNIVERSE.length * 5, // ≥5 per sub-aspect per spec §2.1
};
