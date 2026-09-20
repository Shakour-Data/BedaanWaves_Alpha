# BedaanWaves — Master Algorithmic Specification & Product Blueprint (FINAL)

> **Document Class:** Production Algorithmic Contract
> **Scope:** NASDAQ-only (~5,600 symbols), fully dynamic, zero static weights, TradingView-integrated UI
> **Revision:** v4.0 — FINAL — Per-Symbol Coefficients · Advanced ML Pipeline · TradingView Free Widgets · Full UI/UX · Governance & Observability
> **Status:** Authoritative source of truth for scoring, learning, presentation, and governance layers
> **Supersedes:** v3.1 and all prior revisions

---

## 0. EXECUTIVE SUMMARY

BedaanWaves is a NASDAQ-exclusive, machine-learned, multi-hierarchy scoring and ranking engine. Every coefficient in the production scoring path is **learned per symbol**, not per market snapshot. The system ingests OHLCV + fundamentals + macro + sentiment + AI signals, transforms them cross-sectionally within the ~5,600-symbol NASDAQ universe, aggregates them across a 4-level hierarchy (6 Dimensions → 44 Sub-Dimensions → 135 Aspects → 173 Sub-Aspects → 865+ Indicators), and produces a 0–100 overall score plus 6 dimension scores per symbol.

The platform exposes this intelligence through a real-time, historically-deep UI featuring:
- Per-symbol historical score trends (overall + 6 dimensions) with multi-timeframe resolution
- Radar (spider) visualization of the 6-dimension profile with peer overlays
- **Embedded TradingView free-tier widgets** (price charts, heatmaps, screeners, calendars)
- A live rotating market ticker (price / Δ / overall score)
- A breaking-news ribbon for market-moving events
- Full NASDAQ universe coverage (~5,600 symbols)
- Score decomposition, peer comparison, alerts, watchlists, and export

**Hard guarantees:**
- No hardcoded weights in the production scoring path.
- No mock, synthetic, or placeholder data — ever.
- Per-symbol coefficient vectors (not global snapshot coefficients).
- All historical scores are recomputed from real, validated data — point-in-time correct, no lookahead bias.
- TradingView widgets used **only** for visualization; all scores remain BedaanWaves-native.

---

## 1. UNIVERSE & DATA SOVEREIGNTY

### 1.1 NASDAQ-Only Mandate
- Universe: ~5,600 NASDAQ-listed securities (equities + ETFs).
- Seed source: `database/insert_nasdaq_symbols.sql` (5,569 confirmed records).
- NYSE, AMEX, OTC, and international listings are **explicitly out of scope**.
- All cross-sectional ranks, percentiles, and coefficient learning occur **within NASDAQ only**.
- Data provider: `DATA_PROVIDER=yfinance` (exclusive for scoring). TradingView is **display-only**, never a data source for scoring.

### 1.2 Anti-Mock Policy (Invariant #4)
- **No mock data is permitted at any layer** — ingestion, transformation, scoring, persistence, or presentation.
- Every score rendered in the UI must trace to a `raw_performance_scores` row with `is_processed=True` and `data_quality='VALIDATED'`.
- If a metric is missing: it becomes `50.0` (neutral) at L4 — never fabricated, never zero-filled, never interpolated from mock sources.
- Historical recomputation must be reproducible from raw candles + fundamentals + macro snapshots.
- TradingView widgets embed live market data from TradingView's own feed, but **must never** feed back into BedaanWaves scoring.
- CI guard: any import of `mock`, `faker`, `dummy`, or synthetic generators in `production/` paths fails the build.

### 1.3 Data Governance & Point-in-Time Correctness **(NEW)**
- **No lookahead bias:** every feature used at time `t` must have been observable at `t`. Fundamentals use `reported_at` timestamps, not `fiscal_period_end`.
- **Survivorship-bias-free:** delisted symbols remain in historical cross-sections until their delisting date.
- **Corporate-action adjusted:** all OHLCV adjusted for splits and dividends before indicator computation.
- **Trading halts:** flagged and excluded from cross-sectional ranking on halt days; last valid score carried forward with staleness flag.
- **Timezone discipline:** all timestamps stored in UTC; market events normalized to `America/New_York` for cross-sectional grouping.
- **Data lineage:** every metric value carries `(source, ingested_at, revision)` triple; any correction triggers downstream recomputation.
- **Data quality tiers:** `VALIDATED` · `PROVISIONAL` · `STALE` · `REJECTED`. Only `VALIDATED` enters training.

---

## 2. HIERARCHICAL TAXONOMY

### 2.1 Four-Level Structure

| Level | Name | Count | Min Indicators / Child |
|-------|------|-------|------------------------|
| L1 | Dimensions | 6 | — |
| L2 | Sub-Dimensions | 44 | — |
| L3 | Aspects | 135 | — |
| L4 | Sub-Aspects | 173 | ≥ 5 |
| — | **Total Indicators** | — | **≥ 865** |

**L1 Dimensions:** `fundamental`, `technical`, `sentiment`, `risk`, `macro`, `ai`

**Canonical source of truth:** `scoring_engine_v2.py → METRIC_UNIVERSE`
```
(dim, sub_dim, aspect, sub_aspect, db_field, lower_is_better)
```
`hierarchy.py` derives all key tuples and parent maps programmatically from `METRIC_UNIVERSE` — no duplication, no drift.

### 2.2 Per-Dimension Composition

| Dimension | Sub-Dims | Aspects | Sub-Aspects | Indicators |
|-----------|----------|---------|-------------|------------|
| fundamental | 9 | 33 | 44 | ≥ 220 |
| technical | 8 | 50 | 65 | ≥ 325 |
| sentiment | 2 | 2 | 2 | ≥ 10 |
| risk | 4 | 13 | 13 | ≥ 65 |
| macro | 5 | 21 | 21 | ≥ 105 |
| ai | 3 | 16 | 16 | ≥ 80 |
| **TOTAL** | **44** | **135** | **173** | **≥ 865** |

### 2.3 Sub-Aspect Granularity (Representative)

**fundamental / valuation (7 sub-aspects × 5 = 35):**
`pe_ratio`, `pb_ratio`, `ev_ebitda`, `peg_ratio`, `price_to_sales`, `price_to_cash_flow`, `payout_ratio`

**fundamental / profitability (9 × 5 = 45):**
`roe`, `roa`, `roic`, `profit_margin`, `gross_margin`, `operating_margin`, `net_margin`, `ebitda_margin`, `operating_leverage`

**fundamental / growth (4 × 5 = 20):**
`revenue_growth`, `eps_growth`, `earnings_growth`, `free_cash_flow_growth`

**fundamental / liquidity (3 × 5 = 15):**
`current_ratio`, `quick_ratio`, `cash_ratio`

**fundamental / efficiency (3 × 5 = 15):**
`asset_turnover`, `inventory_turnover`, `receivables_turnover`

**fundamental / solvency (4 × 5 = 20):**
`debt_to_equity`, `debt_to_assets`, `interest_coverage`, `debt_to_ebitda`

**fundamental / dividend (2 × 5 = 10):**
`dividend_yield`, `dividend_growth_rate`

**fundamental / cash_flow (4 × 5 = 20):**
`free_cash_flow_yield`, `operating_cash_flow_ratio`, `capex_ratio`, `cash_conversion_ratio`

**technical / moving_averages (13 × 5 = 65):**
`sma_20_distance`, `sma_50_distance`, `sma_200_distance`, `ema_12_distance`, `ema_26_distance`, `ema_50_distance`, `wma_10_distance`, `wma_20_distance`, `dema_20_distance`, `tema_20_distance`, `t3_20_distance`, `hull_20_distance`, `vwma_20_distance`

**technical / momentum (12 × 5 = 60):**
`rsi_14`, `macd_histogram`, `stoch_k`, `kdj_j`, `cci_20`, `williams_r`, `roc_12`, `trix_15`, `stoch_rsi_k`, `fisher_transform`, `awesome_oscillator`, `ultimate_oscillator`

**technical / volatility (8 × 5 = 40):**
`bb_percent_b`, `atr_ratio`, `kama_10_distance`, `donchian_position`, `stddev_20`, `variance_20`, `keltner_position`, `mass_index`

**technical / trend (6 × 5 = 30):**
`adx_14`, `ichimoku_score`, `parabolic_sar_signal`, `aroon_oscillator`, `supertrend_signal`, `elder_ray_index`

**technical / volume (9 × 5 = 45):**
`obv_slope`, `cmf_20`, `ad_line_slope`, `vpt_slope`, `mfi_14`, `ease_of_movement`, `chaikin_oscillator`, `force_index`, `vwap_distance`

**technical / support_resistance (2 × 5 = 10):**
`pivot_position`, `fibonacci_position`

**sentiment / news (2 × 5 = 10):**
`news_sentiment_avg`, `news_volume`

**risk / market_risk (8 × 5 = 40):**
`volatility_z`, `max_drawdown`, `var_95`, `var_99`, `cvar_95`, `sharpe_ratio`, `sortino_ratio`, `beta`

**risk / credit_risk (2 × 5 = 10):**
`default_prob`, `credit_spread`

**risk / liquidity_risk (2 × 5 = 10):**
`bid_ask_spread`, `volume_ratio`

**risk / operational_risk (1 × 5 = 5):**
`risk_score`

**macro / gdp (6 × 5 = 30):**
`gdp_qoq`, `real_gdp`, `industrial_production`, `capacity_utilization`, `housing_permits`, `consumer_sentiment`

**macro / inflation (4 × 5 = 20):**
`cpi_index`, `core_cpi_index`, `inflation_yoy`, `core_inflation_yoy`

**macro / interest_rates (5 × 5 = 25):**
`fed_funds_rate`, `treasury_yield_2y`, `treasury_yield_10y`, `treasury_yield_30y`, `yield_curve_spread`

**macro / exchange_rates (4 × 5 = 20):**
`dollar_index`, `usd_eur`, `usd_gbp`, `usd_jpy`

**macro / commodity_prices (2 × 5 = 10):**
`oil_price`, `gold_price`

**ai / ml_signal (8 × 5 = 40):**
`expected_return`, `confidence`, `expected_volatility`, `signal_risk_score`, `model_confidence`, `win_rate`, `ml_rsi`, `ml_macd`

**ai / pattern_recognition (5 × 5 = 25):**
`pattern_confidence`, `pattern_probability`, `pattern_reliability`, `pattern_type`, `pattern_horizon`

**ai / anomaly_detection (3 × 5 = 15):**
`anomaly_z_score`, `anomaly_persistence`, `anomaly_confidence`

> Full enumeration is maintained exclusively in `METRIC_UNIVERSE`; this document defers to it.

### 2.4 Multi-Timeframe Aggregation **(NEW)**
Each technical sub-aspect is computed across **four timeframes**: intraday (1H), daily (D), weekly (W), monthly (M). Timeframe weights are **learned per symbol per sub-aspect**, not fixed. This yields:
- `technical_intraday_score`, `technical_daily_score`, `technical_weekly_score`, `technical_monthly_score`
- Final `technical` dimension = learned weighted blend across timeframes.

---

## 3. ZERO STATIC WEIGHTS — PER-SYMBOL LEARNING

### 3.1 Core Principle
> **Every coefficient at every level is learned independently per symbol.**

This is a **critical correction** over prior global-snapshot coefficient designs. At any given moment, symbol `AAPL` and symbol `NVDA` carry **different** coefficient vectors at L1, L2, L3, and L4 — because their historical score → return relationships differ.

There are **no** market-wide coefficient snapshots in the production scoring path. Cold-start fallbacks (uniform `1/n`) are permitted only until per-symbol training data reaches `min_samples_for_training = 50`, and are always logged and auto-replaced.

### 3.2 Coefficient Store Schema (Per-Symbol)

```
coefficient_store/
├── {symbol}/
│   ├── dimensions_model.joblib
│   ├── dimensions_scaler.joblib
│   ├── dimensions_coefficients.json
│   ├── sub_dimensions_model.joblib
│   ├── sub_dimensions_scaler.joblib
│   ├── sub_dimensions_coefficients.json
│   ├── aspects_model.joblib
│   ├── aspects_scaler.joblib
│   ├── aspects_coefficients.json
│   ├── sub_aspects_model.joblib
│   ├── sub_aspects_scaler.joblib
│   ├── sub_aspects_coefficients.json
│   ├── timeframe_weights.json
│   └── meta.json  # trained_at, sample_count, version, data_hash, shap_summary, drift_status
```

Each `*.json` satisfies: all values ∈ [0, 1], sum = 1.0 ± 1e-6, no negatives.

### 3.3 Global Aggregation (Reporting Only)
A **global** coefficient vector may be computed for analytics/dashboards, but it is **never** used in `score_market()` or any production scoring path.

---

## 4. LEARNING PIPELINE (Advanced)

### 4.1 Training Data
Source: `raw_performance_scores`
Filter: `is_processed = True AND data_quality = 'VALIDATED'`
Max per training run: 5,000 most recent records **per symbol**.
Fields consumed: `dimension_scores`, `sub_dimension_scores`, `aspect_scores`, `sub_aspect_scores`, `target_return`, `target_volatility`, `target_price_change`, `captured_at`.

### 4.2 Feature Engineering (50-Dim Vector, Per Sample)
- **Score stats (×4 levels):** 28 dims — mean, std, median, min, max, positive count, negative count
- **Temporal:** 5 dims — weekday, month, day, hour, is_weekend
- **Market context:** 4 dims — volatility, volume, price_change, market_cap
- **Padding:** zero-pad to fixed length 50

### 4.3 Per-Symbol, Per-Level Model Training
For each `symbol ∈ NASDAQ` and each `level ∈ {dimensions, sub_dimensions, aspects, sub_aspects}`:
1. `X` ← feature matrix `(n_samples, 50)`
2. `y[i, k] = (|score[i][k]| / Σ_k |score[i][k]|) * target_return[i]`
3. `StandardScaler` on `X`
4. **Ensemble:** `RandomForestRegressor` + `GradientBoostingRegressor` + `HistGradientBoostingRegressor`, stacked via out-of-fold predictions
5. **Purged walk-forward cross-validation** with embargo (López de Prado, 2018) — prevents leakage from overlapping labels
6. Extract `feature_importances_` (RF) + `SHAP` mean |values| (GBM) → blended importance → map to key names → normalize to sum = 1.0

### 4.4 Coefficient Normalization Contract
- All values ∈ [0, 1]
- Sum = 1.0 (rounding error distributed to largest weight)
- No negative values, no values > 1
- All-zero → uniform `1/n` (cold-start only, logged)

### 4.5 Cadence & Persistence
- `retrain_interval_hours = 24`
- `min_samples_for_training = 50` (per symbol)
- `validation_split = 0.2` (plus purged walk-forward CV)
- History cap: 1,000 most recent samples per symbol
- Persistence: `joblib` + JSON per symbol (see §3.2)
- Hot-swap: newly trained coefficients take effect on the next scoring cycle, no restart
- **Model registry:** every coefficient version stored with `version_id`, `trained_at`, `metrics` (OOS R², IC, Sharpe of predicted portfolio), `data_hash`

### 4.6 Drift Detection & Auto-Retraining Trigger **(NEW)**
- Population Stability Index (PSI) on feature distribution > 0.25 → drift alert
- Kolmogorov–Smirnov test on prediction distribution vs training → drift alert
- Rolling out-of-sample IC degradation > 30% → forced retrain
- Regime change detected via Hidden Markov Model (2-state: calm / stressed) → regime-specific re-weighting triggered

### 4.7 Meta-Labeling **(NEW)**
Primary model predicts direction; secondary model (meta-labeler) predicts probability that the primary is correct. Meta-label probability is stored as `confidence` at the AI dimension and used to **down-weight** low-confidence predictions during aggregation.

---

## 5. SCORING ALGORITHM (V2 ENGINE)

### 5.1 Dynamic Weight Resolution
```python
def _get_dynamic_weights(symbol, level):
    if _use_ml_coefficients and coefficient_service.is_model_trained(symbol, level):
        w = coefficient_service.get_coefficients(symbol, level)
        if validate(w) and abs(sum(w.values()) - 1.0) <= 1e-6:
            return w                       # per-symbol, ML-learned
    return uniform_fallback(level)         # cold-start ONLY, logged
```

### 5.2 `score_market(asset_metrics)` — Step-by-Step

**Input:** `asset_metrics: dict[asset_id, dict[db_field, float | None]]`

**Step 1 — Cross-Sectional Percentile → Z → Score (NASDAQ peers, same day)**
For each `db_field` across all NASDAQ assets:
1. Collect values; `None` passes through unchanged.
2. Compute midrank (average rank for ties).
3. `p = (rank - 0.5) / n`
4. If `lower_is_better`: `p = 1.0 - p`
5. Clip `p` to `[1e-6, 1 - 1e-6]`
6. `z = Φ⁻¹(p)` (SciPy if available, else Abramowitz–Stegun)
7. `score = clamp(50 + 15·z, 0, 100)`

**Step 2 — Coverage**
`coverage = (# present metrics) / |METRIC_UNIVERSE|`

**Step 3 — L4 (Sub-Aspects)**
Store transformed score directly. Missing → `50.0` neutral (never 0).

**Step 4 — L3 (Aspects) — per-symbol dynamic**
```
aspect_score[asp] = Σ_{sa ∈ asp} sub_aspect_score[sa] · w_symbol[sa]
                    ─────────────────────────────────────────────
                          Σ_{sa ∈ asp} w_symbol[sa]
```

**Step 5 — L2 (Sub-Dimensions) — per-symbol dynamic**
`sub_dimension_score[sub] = coverage_weighted_mean(aspect_scores ∈ sub, w_symbol["sub_dimensions"])`

**Step 6 — L1 (Dimensions) — per-symbol dynamic**
`dimension_score[dim] = coverage_weighted_mean(sub_dimension_scores ∈ dim, w_symbol["dimensions"])`

**Step 7 — Overall — per-symbol dynamic**
```
overall = Σ_dim dimension_score[dim] · w_symbol[dim]
overall = clamp(overall, 0, 100)
```
> `DIMENSION_WEIGHTS` constant is **NOT** referenced. Only `w_symbol["dimensions"]`.

**Step 8 — Grade & Signals**
| Score | Grade |
|-------|-------|
| ≥ 85 | STRONG_BULLISH |
| ≥ 70 | BULLISH |
| ≥ 55 | NEUTRAL |
| ≥ 40 | BEARISH |
| < 40 | STRONG_BEARISH |

Signals: `strong_{dim}` if ≥ 80 · `positive_{dim}` if ≥ 60 · `weak_{dim}` if ≤ 20

**Step 9 — Uncertainty & Stability (NEW)**
- **Conformal prediction interval:** 90% CI on overall score via split-conformal calibration.
- **Score stability index:** rolling 5-day std of overall score; low std = stable signal.
- **Circuit breaker:** if |Δscore| > 25 in one day without a corresponding price move > 15%, flag for manual review; do not silently propagate.

**Output:** `HierarchicalScore` dataclass (all 4 levels + overall + grade + signals + coverage + CI + stability index).

---

## 6. TECHNICAL NORMALIZATION & BUNDLE SCORING

### 6.1 Pre-Transform Rules
| Category | Examples | Normalization |
|----------|----------|---------------|
| Bounded | `rsi_14`, `stoch_k`, `mfi_14` | `clamp(v, 0, 100)` |
| Binary | `parabolic_sar_signal`, `ichimoku_score` | 75 if >0, 25 if <0, 50 if =0 |
| Lower-is-better | `atr_ratio`, `stddev_20` | `clamp(50 − 25·tanh(|v|/scale))` |
| Scaled | `macd_histogram`, `roc_12` | `clamp(50 + 25·tanh(v/scale))` |

Scale factors live in `_TECHNICAL_SCALES` (e.g., `adx_14 → 40.0`, `mass_index → 25.0`).

### 6.2 `score_technical_bundle(...)`
1. Flatten to `TECHNICAL_METRIC_FIELDS` (50 canonical fields).
2. Normalize each via `normalize_indicator_score`.
3. Regime-adaptive weights (learned **per symbol, per sub-dimension**):
   - `trend_factor = clamp(adx/40, 0, 1)`
   - `volatility_factor = clamp(volatility/0.50, 0, 1)`
   - Boost trend in strong trends; volume/volatility in high vol.
4. Base score = weighted mean using **per-symbol** sub-dimension coefficients.
5. Confluence bonus: rewards indicator agreement, ±10 max.
6. Divergence: +3 bullish, −3 bearish.
7. Final: `0.7·base + 0.3·confluence`.

---

## 7. AI DIMENSION

### 7.1 Composite
```
AI_Score = ML_Predictions(w1) + Pattern_Recognition(w2) + Anomaly_Detection(w3)
```
Weights `w1, w2, w3` are **learned per symbol, per regime**:
| Regime | Adjustment |
|--------|------------|
| Bull | `pattern_recognition × 1.15` |
| Bear | `anomaly_detection × 1.20` |
| High Volatility | `ml_predictions × 1.10` |
| Sideways | cold-start balanced (logged) |

Weights renormalized to sum = 1.0.

### 7.2 ML Predictions
```
ml_score = 0.30·return_score + 0.25·confidence_score
         + 0.20·(100 − risk_score) + 0.15·win_rate_score + 0.10·model_confidence
```
- `return_score = 100·sigmoid(return_pct·50) − volatility_penalty`
- Confidence penalty: if `confidence < 65`, multiply by `(confidence/65)²`
- Technical alignment bonus: +5 for RSI/MACD alignment

### 7.3 Pattern Recognition
```
pattern_score = Σ (prob · reliability · pattern_weight) / Σ pattern_weight
```
Pattern weights: reversal 1.2× · continuation 1.0× · candlestick 0.8× · anomaly 1.1×
Confluence: +5 for 2+ aligned · +10 for 3+ · +8 multi-timeframe

### 7.4 Anomaly Detection
```
anomaly_score = 0.40·severity + 0.30·persistence + 0.20·(100 − market_impact) + 0.10·confidence
```
- `severity = min(100, |z|·20)` (cap ±5σ)
- If not anomaly: pull toward `50 + (score − 50)·0.5`

### 7.5 Coverage & Staleness
- Coverage < 50% → `score = 50 + (score − 50)·coverage·2.0`
- Staleness > 5 trading days → `× 0.80`

---

## 8. MACRO SCORING
FRED/BLS indicators → 0–100 health sub-scores for 5 macro sub-dimensions (GDP, inflation, interest rates, FX, commodities). The relative weights of these 5 sub-dimensions within `macro` are **learned per symbol** — because a growth stock and a value stock respond differently to rate shocks.

---

## 9. END-TO-END DATA FLOW

```
NASDAQ OHLCV (~5,600 symbols, yfinance only)
        ↓
Corporate-action adjustment + point-in-time alignment
        ↓
compute_all_indicators()  → 50 technical indicators × 4 timeframes / asset
        ↓
flatten_technical_indicators()  → TECHNICAL_METRIC_FIELDS
        ↓
score_market()  [V2 engine — cross-sectional over NASDAQ universe]
   ├─ percentile-rank transform (NASDAQ peers only, same day)
   ├─ L4 → L3 → L2 → L1 → overall
   │   (ALL using per-symbol learned_coefficients[symbol][level])
   ├─ grade + signals + conformal CI + stability index
   └─ HierarchicalScore dataclass
        ↓
Persistence: raw_performance_scores  → training corpus (per symbol)
        ↓
CoefficientLearningService.retrain_all()  (daily, per symbol)
   ├─ drift detection → forced retrain if needed
   ├─ purged walk-forward CV
   ├─ ensemble stacking + SHAP
   └─ model registry versioning
        ↓
Hot-swap per-symbol coefficients (no restart)
        ↓
RankingService
   ├─ get_nasdaq_rankings()          — paginated ranked list
   ├─ get_score_history(symbol)      — time-series (overall + 6 dims, multi-timeframe)
   ├─ get_hierarchy_scores(symbol)   — full 4-level tree
   ├─ get_coefficients(symbol)       — per-symbol learned weights
   ├─ get_radar_profile(symbol)      — 6-dimension vector for spider chart
   ├─ get_decomposition(symbol)      — waterfall of score contributions
   └─ get_peer_comparison(symbol)    — vs sector / NASDAQ median
        ↓
UI Layer
   ├─ BedaanWaves-native panels (scores, trends, radar, coefficients, decomposition)
   └─ TradingView embedded widgets (price charts + free market tools)  ← display-only
```

---

## 10. COLD-START BEHAVIOR
When `samples < 50` **for that symbol**:
- Use uniform `1/n` per key at every level for that symbol only.
- Log: `{"event": "weights_fallback_to_static", "symbol": "...", "level": "...", "reason": "ml_not_trained"}`
- Auto-replace as soon as 50+ validated records exist for that symbol.
- UI badge: "Training in progress — using neutral weights (N/50 samples)".

---

## 11. UI / UX SPECIFICATION

### 11.1 Symbol Drilldown — Historical Score Panel **(Req #1)**
**Trigger:** Click any symbol in the right-hand rankings list.
**Panel must display:**
1. **Overall score trend** — line chart, time axis spanning available history (daily granularity; intraday if available).
2. **Six dimension trends** — `fundamental`, `technical`, `sentiment`, `risk`, `macro`, `ai` — overlaid with distinct colors + legend toggles.
3. **Hover tooltip:** exact score, date, grade, conformal CI, and per-dimension breakdown at that timestamp.
4. **Time-range selector:** 1D · 1W · 1M · 3M · 6M · 1Y · YTD · MAX.
5. **Data provenance badge:** "Real data — N validated records" with link to `raw_performance_scores` lineage.
6. **No gaps filled with mock data** — if history is short, show only real points and label "insufficient history".
7. **Candlestick overlay toggle:** overlay BedaanWaves score line on BedaanWaves-native price candles (from yfinance).

### 11.2 Radar / Spider Chart **(Req #3)**
- **6-axis radar** (one per L1 dimension) rendered for the selected symbol.
- **Overlay:** current profile vs. 30-day-ago profile vs. NASDAQ median profile vs. sector median.
- **Axis scale:** 0–100 (fixed).
- **Interactive:** hover on vertex shows dimension score + top-3 contributing sub-dimensions.
- **Placement:** alongside the historical trend panel in the drilldown view.
- **Animation:** radar morphs as user scrubs the time-range slider.

### 11.3 Per-Symbol Dynamic Coefficients **(Req #2 — architectural)**
- Coefficient panel in drilldown shows **this symbol's** learned weights at L1 (6 bars) and a drilldown into L2/L3/L4.
- Each bar labeled with `learned_at` timestamp and `sample_count`.
- If in cold-start: grey badge "uniform fallback (training in progress)".
- **Compare coefficients view:** diff `AAPL` vs `NVDA` weights at any level to confirm per-symbol divergence.

### 11.4 Top News Ribbon **(Req #5)**
- Sticky bar at the very top of the page.
- Sources: curated market-moving news (earnings surprises, Fed decisions, CPI prints, M&A, halts).
- Each item: headline · source · timestamp · sentiment tag (bullish/bearish/neutral) · affected NASDAQ tickers.
- Auto-scroll with pause-on-hover; click expands detail drawer.
- Color-coded severity: red (critical) · amber (notable) · grey (informational).

### 11.5 Rotating Market Ticker **(Req #6)**
- Horizontal infinite-scroll marquee, sticky beneath the news ribbon.
- Per symbol: `SYMBOL  $PRICE  Δ%  Score: NN (GRADE)` with green/red direction coloring.
- Data source: live quotes (`yfinance`) + latest per-symbol overall score from the scoring engine.
- Click any ticker → jump to that symbol's drilldown.
- Configurable speed; respects `prefers-reduced-motion`.

### 11.6 Full NASDAQ Coverage **(Req #7)**
- All ~5,600 NASDAQ symbols are searchable, rankable, and drilldown-able.
- Pagination + virtual scrolling for the rankings table.
- Search: fuzzy ticker/name matching, sector filters, score-range filters, grade filters, market-cap filters.
- Cold-start symbols display a "training in progress" indicator — but are **never** hidden and **never** shown with fabricated data.

### 11.7 Real-Data Verification Surface **(Req #4 — UI support)**
- Every score cell exposes a "trace" icon → modal showing:
  - Source records (`raw_performance_scores.id` list)
  - `data_quality` flag
  - `captured_at` timestamps
  - Coefficient version used (`meta.json` hash)
- A global status widget: "All displayed scores derive from N validated records. 0 mock records detected."

### 11.8 Score Decomposition Waterfall **(NEW)**
- Visual breakdown of how each of the 6 dimensions contributes to the overall score.
- Drill-down: dimension → sub-dimension → aspect → sub-aspect → indicator.
- Each bar shows: raw score, coefficient, contribution = `score × coefficient`.
- Helps users understand "why is this stock 72 instead of 85?".

### 11.9 Peer Comparison View **(NEW)**
- Side-by-side table: selected symbol vs. 5 nearest peers (by sector + market cap).
- Metrics compared: overall score, 6 dimensions, key ratios, growth rates.
- Percentile rank within peer group displayed.
- Visual: grouped bar chart + radar overlay.

### 11.10 Watchlists & Alerts **(NEW)**
- User can create watchlists (localStorage for anon, DB for logged-in).
- Alerts: "notify me when AAPL overall score crosses 80" or "when technical dimension drops below 40".
- Alert delivery: in-app toast + optional email.
- Alert rules stored per user, evaluated on each scoring cycle.

### 11.11 Export & Sharing **(NEW)**
- Export rankings to CSV, JSON, or PDF.
- Share deep link to any drilldown state (symbol + time range + overlays).
- Embed mode: `<iframe>` for external sites showing a single symbol's BedaanWaves score card.

### 11.12 Mobile Responsiveness **(NEW)**
- All panels responsive down to 375px width.
- TradingView widgets auto-resize.
- Radar chart scales; trends chart switches to vertical scroll.
- Bottom navigation for Rankings / Watchlist / News / Macro.

---

## 12. TRADINGVIEW INTEGRATION (Free Tier Widgets — Display Only)

### 12.1 Integration Principle
TradingView is used **exclusively for visualization**. It is never a scoring input, never a training input, and never a substitute for BedaanWaves-native charts. All TradingView widgets are embedded via the official free `tv.js` / `embed-widget-*.js` libraries and require **no paid subscription**.

### 12.2 Embedded TradingView Widgets (Free Tier)

| # | Widget | Purpose | Placement |
|---|--------|---------|-----------|
| 1 | **Advanced Chart** (`embed-widget-advanced-chart.js`) | Full interactive candlestick chart with user-configurable indicators | Symbol drilldown — primary price chart tab |
| 2 | **Mini Chart** (`embed-widget-mini-symbol-overview.js`) | Compact sparkline for each row | Rankings table — inline preview on hover |
| 3 | **Symbol Overview** (`embed-widget-symbol-overview.js`) | Multi-symbol overview strip | Drilldown header |
| 4 | **Technical Analysis** (`embed-widget-technical-analysis.js`) | TradingView's own buy/sell/neutral gauge | Drilldown sidebar — shown **adjacent to** BedaanWaves technical score (cross-reference only, never merged) |
| 5 | **Ticker Tape** (`embed-widget-ticker-tape.js`) | Alternative rotating ticker | Top bar — used only if BedaanWaves-native ticker (§11.5) is disabled |
| 6 | **Market Overview** (`embed-widget-market-overview.js`) | NASDAQ index + sector mini-quotes | Homepage sidebar |
| 7 | **Stock Screener** (`embed-widget-screener.js`) | TradingView screener (visual only) | Separate "TV Screener" tab |
| 8 | **Economic Calendar** (`embed-widget-events.js`) | Macro events (CPI, FOMC, NFP) | Macro dimension panel |
| 9 | **Company Profile** (`embed-widget-symbol-info.js`) | Fundamentals snapshot | Drilldown "Company" tab |
| 10 | **Financials** (`embed-widget-financials.js`) | Income / balance / cash-flow statements | Drilldown "Financials" tab |
| 11 | **News** (`embed-widget-timeline.js`) | Symbol-specific news feed | Drilldown sidebar — supplements §11.4 |
| 12 | **Stock Heatmap** (`embed-widget-stock-heatmap.js`) | NASDAQ-wide heatmap by market cap / change | Homepage "Heatmap" tab |

### 12.3 Implementation Rules
1. **Symbol mapping:** `NASDAQ:{TICKER}` (e.g., `NASDAQ:AAPL`). All 5,569 symbols map cleanly.
2. **Theme sync:** widget theme follows app theme via `tvWidgetOptions.theme`.
3. **Locale:** `en` default; respect `Accept-Language`.
4. **Autosize:** `autosize: true` inside responsive containers.
5. **Lazy loading:** `IntersectionObserver` for below-fold widgets.
6. **Error isolation:** if a widget fails, degrade gracefully to BedaanWaves-native Plotly/Recharts chart from yfinance candles — **never** a blank box.
7. **Provenance separation:** every TradingView embed labeled "Powered by TradingView" and visually distinct from BedaanWaves-native panels. Score numbers **never** appear inside a TradingView widget.
8. **No paywall leakage:** free-tier only. No premium indicators.
9. **CSP compliance:** allow `https://s3.tradingview.com`, `https://www.tradingview.com`, `https://www.tradingview-widget.com`.
10. **Performance budget:** ≤ 300 KB gzipped TV JS per page; ≤ 6 active embeds per page.

### 12.4 Advanced Chart Configuration (Drilldown Primary)
```js
new TradingView.widget({
  container_id: "tv_advanced_chart",
  symbol: `NASDAQ:${ticker}`,
  interval: "D",
  timezone: "America/New_York",
  theme: userTheme,
  style: "1",
  locale: "en",
  toolbar_bg: "#f1f3f6",
  enable_publishing: false,
  allow_symbol_change: true,
  hide_side_toolbar: false,
  details: true,
  withdateranges: true,
  autosize: true,
  studies: ["RSI@tv-basicstudies", "MASimple@tv-basicstudies", "MACD@tv-basicstudies"]
});
```

### 12.5 Technical Analysis Widget — Cross-Reference Rule
Displayed **side-by-side** with BedaanWaves' `technical` dimension score:
- Left: `BedaanWaves Technical Score: 72 (BULLISH)` — ML-weighted, per-symbol coefficient output.
- Right: `TradingView Technical Rating: Buy` — their fixed-weight summary.

Never averaged, merged, or reconciled in the scoring path. Transparency feature only.

### 12.6 Homepage TradingView Layout
- **Heatmap tab:** `embed-widget-stock-heatmap.js` on NASDAQ exchange.
- **Market Overview sidebar:** NASDAQ Composite, NASDAQ-100, 4 user-selected sector ETFs.
- **Economic Calendar:** rendered in macro panel alongside BedaanWaves macro score.

### 12.7 Attribution & Licensing
- All widgets retain built-in "Powered by TradingView" attribution — never hidden or restyled to invisibility.
- Free-tier usage only; no scraping; no reverse-engineering.

---

## 13. NASDAQ-SPECIFIC NOTES
- Cross-sectional percentile ranking is performed **within NASDAQ universe only**.
- Minimum market size for stable percentile: ≥ 30 assets. For < 2 assets → `50.0` neutral.
- Market data sourced exclusively from Yahoo Finance for scoring; TradingView used for display only.
- Macro indicators are common across all NASDAQ assets, but their **relative weights within `macro` are learned per symbol**.

---

## 14. OBSERVABILITY & OPERATIONS **(NEW)**

### 14.1 Metrics (Prometheus)
- `scoring_latency_seconds` (histogram, per level)
- `training_duration_seconds` (histogram, per symbol)
- `coefficient_drift_psi` (gauge, per symbol per level)
- `scores_computed_total` (counter)
- `cold_start_symbols_total` (gauge)
- `data_quality_rejected_total` (counter)
- `tradingview_widget_load_failures_total` (counter)

### 14.2 Structured Logging
- JSON logs with `event`, `symbol`, `level`, `correlation_id`, `duration_ms`.
- Training logs include `oos_r2`, `oos_ic`, `shap_top_features`.
- Fallback events tagged `severity: warning` and surfaced in ops dashboard.

### 14.3 Alerting
- PagerDuty/Slack on: cold-start > 25% of universe, training failures, data quality drop > 10%, scoring latency p99 > 5s.

### 14.4 Audit Trail
- Every coefficient version stored immutably in model registry.
- Every score reproducible: `(symbol, timestamp, coefficient_version, raw_data_hash)` → deterministic score.
- RBAC: read-only analyst, scoring engineer, admin.

---

## 15. SECURITY & COMPLIANCE **(NEW)**
- **Not financial advice disclaimer** on every page footer.
- Rate limiting: 60 req/min per IP for anonymous, 600 for authenticated.
- Input validation: all tickers against `insert_nasdaq_symbols.sql` whitelist.
- Secrets via env vars / vault; no hardcoded credentials.
- GDPR/CCPA: watchlists and alerts erasable on request.
- No PII stored in scoring tables.

---

## 16. KEY INVARIANTS (Non-Negotiable)

1. **All production coefficients are ML-learned, per symbol.** No hardcoded, no global-snapshot weights in the scoring path.
2. **Scores always ∈ [0, 100]** — every transform clamps.
3. **Missing data → 50.0 neutral**, never 0, never fabricated.
4. **Zero mock data.** All displayed and historical scores trace to validated real records.
5. **NASDAQ-only cross-sectional fairness** — percentile ranking prevents segment bias.
6. **Coverage-weighted aggregation** — more data → more precise; missing degrades gracefully.
7. **Regime adaptivity** — weights shift with market conditions, per symbol.
8. **Lower-is-better awareness** — direction-aware for P/E, volatility, drawdown, debt.
9. **Daily retraining** — per-symbol coefficients update every 24h.
10. **Hot-swap** — newly trained coefficients take effect on next cycle without restart.
11. **≥ 5 indicators per sub-aspect** — 173 sub-aspects, 865+ total.
12. **Full historical integrity** — every past score reproducible from raw data + versioned coefficients.
13. **TradingView is display-only.** No TradingView data ever enters scoring, training, or persistence.
14. **Attribution preserved.** All TradingView widgets keep their built-in branding.
15. **Point-in-time correctness.** No lookahead bias, no survivorship bias, corporate-action adjusted.
16. **Uncertainty quantified.** Every score carries a conformal prediction interval.
17. **Drift-aware.** Models retrain on drift detection, not just schedule.
18. **Auditable.** Every score resolves to `(symbol, timestamp, coefficient_version, data_hash)`.

---

## 17. EXTENSION POINTS
- **New metrics** → append to `METRIC_UNIVERSE`; hierarchy + training auto-derive.
- **New markets** → implement `IScoringStrategy` in `scoring_strategies.py`.
- **New ML models** → wire through `CoefficientLearningService` or `MLSignal`.
- **Custom weighting** → implement coefficient learner, register in dependency container.
- **New UI panels** → mount under drilldown view; consume `RankingService` contracts only.
- **New TradingView widget** → register in `tradingview_widgets.ts` with symbol-mapping + lazy-load + fallback.
- **New timeframe** → extend timeframe aggregation in `timeframe_weights.json` schema.

---

## 18. ACCEPTANCE CRITERIA (Definition of Done)

| # | Requirement | Acceptance Test |
|---|-------------|-----------------|
| 1 | Per-symbol historical trends (overall + 6 dims) | Click any symbol → chart renders ≥ 30 days of real data with per-dimension toggles |
| 2 | Per-symbol dynamic coefficients | `AAPL` and `NVDA` L1 weight vectors differ at same timestamp; diff view confirms |
| 3 | Radar chart | 6-axis spider renders with current + 30d-ago + NASDAQ-median + sector-median overlays |
| 4 | Zero mock data | CI guard passes; trace modal resolves every score to `raw_performance_scores.id` |
| 5 | News ribbon | Sticky top bar streams ≥ 20 curated items/day with sentiment tags |
| 6 | Rotating ticker | Marquee displays live price + Δ% + score for ≥ 100 symbols, click-to-drilldown works |
| 7 | Full NASDAQ coverage | All 5,569 seeded symbols appear in search; cold-start ones labeled, never hidden |
| 8 | TradingView Advanced Chart | Renders inside drilldown for any NASDAQ symbol; theme syncs; RSI/SMA/MACD studies load |
| 9 | TradingView Technical Analysis cross-reference | Displayed side-by-side with BedaanWaves technical score, clearly labeled, never merged |
| 10 | TradingView free-tier compliance | All 12 widgets load with attribution; no premium features; CSP allows TV domains |
| 11 | Widget failover | Blocking `s3.tradingview.com` → native fallback chart renders, no blank panel |
| 12 | Homepage TV layout | Heatmap + Market Overview + Economic Calendar render and lazy-load correctly |
| 13 | Multi-timeframe technical | Drilldown shows intraday/daily/weekly/monthly technical sub-scores with learned blend |
| 14 | Conformal CI | Every score displays a 90% prediction interval; interval narrows as samples grow |
| 15 | Drift detection | Simulated feature drift > 0.25 PSI triggers retrain within 24h |
| 16 | Score decomposition | Waterfall renders L1→L4 breakdown; contributions sum to overall |
| 17 | Peer comparison | Selected symbol vs 5 peers; percentile rank displayed |
| 18 | Watchlist + alerts | User creates alert "score > 80"; triggers in-app toast on next cycle |
| 19 | Export | Rankings exportable to CSV/JSON/PDF with real data only |
| 20 | Audit trail | Any historical score reproducible from `(symbol, timestamp, coefficient_version, data_hash)` |

---

*End of specification — v4.0 FINAL. This document supersedes all prior versions. Any implementation diverging from §3.1 (per-symbol coefficients), §1.2 (anti-mock), §1.3 (point-in-time correctness), or §12.1 (TradingView display-only) is considered non-compliant.*