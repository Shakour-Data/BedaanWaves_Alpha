// ─── Sentiment analysis pipeline tests ───────────────────────────────────────
// Tests the complete sentiment pipeline from raw news data through sentiment
// computation to engine scoring.
import { test, describe } from "node:test";
import assert from "node:assert";

import { DIMENSION_KEYS, METRIC_UNIVERSE } from "@/lib/scoring/metric-universe";
import { normalizeIndicatorScore } from "@/lib/scoring/transforms";
import { scoreMarket, type ScoreMarketInput } from "@/lib/scoring/engine";
import { computeNewsSentimentForDay, type NewsSentimentResult } from "@/lib/scoring/seed/real-data";

interface NewsItem {
  headline: string;
  source: string;
  publishedAt: string;
  sentiment: string;
  severity: string;
  tickers: string[];
}

// ─── Test 1: News lookback window includes 5-day range ──────────────────────────
// The 5-day lookback ensures the latest news reaches the latest scoring day.
test("computeNewsSentimentForDay picks up news within 5-day window", () => {
  const news: NewsItem[] = [
    {
      headline: "Test bullish news",
      source: "TestSource",
      publishedAt: "2026-09-17T10:00:00Z",
      sentiment: "bullish",
      severity: "critical",
      tickers: ["AAPL"],
    },
  ];

  // 5 days after news should still be picked up
  const result5d = computeNewsSentimentForDay(news, "2026-09-22");
  assert.ok(result5d["AAPL"], "Should include news from 5 days ago");
  assert.ok(result5d["AAPL"].avgSentiment > 50, "Bullish news should produce above-neutral sentiment");

  // 6 days after news should NOT be picked up
  const result6d = computeNewsSentimentForDay(news, "2026-09-23");
  assert.ok(!result6d["AAPL"], "Should NOT include news from 6+ days ago");
});

test("computeNewsSentimentForDay does NOT include future news", () => {
  const news: NewsItem[] = [
    {
      headline: "Future news",
      source: "TestSource",
      publishedAt: "2026-09-20T10:00:00Z",
      sentiment: "bullish",
      severity: "critical",
      tickers: ["AAPL"],
    },
  ];
  // News published AFTER the target day should not be included
  const result = computeNewsSentimentForDay(news, "2026-09-18");
  assert.ok(!result["AAPL"], "Should not include future news");
});

// ─── Test 2: Severity weighting ────────────────────────────────────────────────
// When multiple articles have different sentiments, severity weighting
// means a critical article should pull the average more than an informational one.
test("computeNewsSentimentForDay weights by severity", () => {
  // Same two articles, but critical bullish is swapped with informational bullish
  const criticalBull = {
    headline: "Critical bullish",
    source: "S", publishedAt: "2026-09-17T10:00:00Z",
    sentiment: "bullish", severity: "critical",
    tickers: ["AAPL"],
  };
  const informationalBear = {
    headline: "Informational bearish",
    source: "S", publishedAt: "2026-09-17T10:00:00Z",
    sentiment: "bearish", severity: "informational",
    tickers: ["AAPL"],
  };
  const informationalBull = {
    headline: "Informational bullish",
    source: "S", publishedAt: "2026-09-17T10:00:00Z",
    sentiment: "bullish", severity: "informational",
    tickers: ["AAPL"],
  };

  // Scenario A: critical bullish (75×1.0) + informational bearish (25×0.30) = 63.46
  const resultA = computeNewsSentimentForDay([criticalBull, informationalBear], "2026-09-20");
  // Scenario B: informational bullish (75×0.30) + informational bearish (25×0.30) = 50.0
  const resultB = computeNewsSentimentForDay([informationalBull, informationalBear], "2026-09-20");

  assert.ok(resultA["AAPL"].avgSentiment > resultB["AAPL"].avgSentiment,
    `Critical bullish should give higher sentiment (${resultA["AAPL"].avgSentiment.toFixed(2)}) than informational-only (${resultB["AAPL"].avgSentiment.toFixed(2)})`);
  // Scenario A should be above neutral (63.46 > 50)
  assert.ok(resultA["AAPL"].avgSentiment > 50, "Critical bullish should push sentiment above neutral");
  // Scenario B should be exactly neutral (75*0.3 + 25*0.3) / (0.3 + 0.3) = 50
  assert.ok(Math.abs(resultB["AAPL"].avgSentiment - 50) < 0.01, "Equal weighted bullish+bearish should be neutral");
});

// ─── Test 3: Sentiment score mapping ────────────────────────────────────────────
test("computeNewsSentimentForDay maps sentiment labels correctly", () => {
  const bullishNews: NewsItem = {
    headline: "Bull",
    source: "S",
    publishedAt: "2026-09-17T10:00:00Z",
    sentiment: "bullish",
    severity: "critical",
    tickers: ["AAA"],
  };
  const bearishNews: NewsItem = {
    headline: "Bear",
    source: "S",
    publishedAt: "2026-09-17T10:00:00Z",
    sentiment: "bearish",
    severity: "critical",
    tickers: ["BBB"],
  };
  const neutralNews: NewsItem = {
    headline: "Neutral",
    source: "S",
    publishedAt: "2026-09-17T10:00:00Z",
    sentiment: "neutral",
    severity: "critical",
    tickers: ["CCC"],
  };

  const result = computeNewsSentimentForDay([bullishNews, bearishNews, neutralNews], "2026-09-20");
  assert.ok(result["AAA"].avgSentiment > 60, "Bullish should be > 60");
  assert.ok(result["BBB"].avgSentiment < 40, "Bearish should be < 40");
  assert.ok(Math.abs(result["CCC"].avgSentiment - 50) < 1, "Neutral should be ~50");
});

// ─── Test 4: Volume scaling ─────────────────────────────────────────────────────
test("computeNewsSentimentForDay scales news_volume to 0-100 with diminishing returns", () => {
  const result = computeNewsSentimentForDay([
    { headline: "N1", source: "S", publishedAt: "2026-09-17T10:00:00Z", sentiment: "bullish", severity: "critical", tickers: ["A"] },
    { headline: "N2", source: "S", publishedAt: "2026-09-17T10:00:00Z", sentiment: "bullish", severity: "critical", tickers: ["A"] },
    { headline: "N3", source: "S", publishedAt: "2026-09-17T10:00:00Z", sentiment: "bullish", severity: "critical", tickers: ["A"] },
    { headline: "N4", source: "S", publishedAt: "2026-09-17T10:00:00Z", sentiment: "bullish", severity: "critical", tickers: ["A"] },
  ], "2026-09-20");

  assert.ok(result["A"].articleCount > 0, "Volume should be > 0 with articles");
  assert.ok(result["A"].articleCount <= 100, "Volume should be <= 100");
  // 4 articles: sqrt(4) * 15 = 30
  assert.ok(Math.abs(result["A"].articleCount - 30) < 1, `Expected ~30 for 4 articles, got ${result["A"].articleCount}`);
});

// ─── Test 5: social_sentiment proxy derived from news ─────────────────────────
test("computeNewsSentimentForDay derives socialSentiment from news buzz × deviation", () => {
  const bullishNews: NewsItem = {
    headline: "Bull",
    source: "S",
    publishedAt: "2026-09-17T10:00:00Z",
    sentiment: "bullish",
    severity: "critical",
    tickers: ["BULL"],
  };
  const bearishNews: NewsItem = {
    headline: "Bear",
    source: "S",
    publishedAt: "2026-09-17T10:00:00Z",
    sentiment: "bearish",
    severity: "critical",
    tickers: ["BEAR"],
  };

  const result = computeNewsSentimentForDay([bullishNews, bearishNews], "2026-09-20");
  assert.ok(result["BULL"].socialSentiment > 50, "Bullish social sentiment should be > 50");
  assert.ok(result["BEAR"].socialSentiment < 50, "Bearish social sentiment should be < 50");
});

// ─── Test 6: No news → empty result (not 50.0 defaults) ───────────────────────
test("computeNewsSentimentForDay returns empty for tickers with no news", () => {
  const result = computeNewsSentimentForDay([
    { headline: "N", source: "S", publishedAt: "2026-09-17T10:00:00Z", sentiment: "bullish", severity: "critical", tickers: ["A"] },
  ], "2026-09-20");
  assert.ok(!result["B"], "Tickers with no news should not appear in result");
});

// ─── Test 7: normalizeIndicatorScore for sentiment fields ────────────────────
test("normalizeIndicatorScore passes through sentiment values clamped to [0, 100]", () => {
  assert.strictEqual(normalizeIndicatorScore("news_sentiment_avg", 75), 75);
  assert.strictEqual(normalizeIndicatorScore("news_sentiment_avg", 25), 25);
  assert.strictEqual(normalizeIndicatorScore("news_sentiment_avg", 50), 50);
  assert.strictEqual(normalizeIndicatorScore("news_sentiment_avg", 150), 100);
  assert.strictEqual(normalizeIndicatorScore("news_sentiment_avg", -10), 0);
  assert.strictEqual(normalizeIndicatorScore("news_sentiment_avg", null), 50.0);
  assert.strictEqual(normalizeIndicatorScore("social_sentiment", 80), 80);
  assert.strictEqual(normalizeIndicatorScore("social_volume", 30), 30);
});

// ─── Test 8: Engine uses direct sentiment scores (not cross-sectional) ────────
// When a ticker has news_sentiment_avg of 75 (bullish), the L4 sub-aspect
// score should reflect that value, not be re-ranked by cross-sectional distribution.
test("scoreMarket preserves absolute sentiment values (no cross-sectional distortion)", () => {
  const tickers = ["BULL", "NEUTRAL", "BEAR"];
  const assetMetrics: Record<string, Record<string, number | null>> = {
    BULL: { news_sentiment_avg: 75, news_volume: 80, social_sentiment: 75, social_volume: 70, analyst_rating: 70, target_price_change: 60 },
    NEUTRAL: { news_sentiment_avg: 50, news_volume: 30, social_sentiment: 50, social_volume: 30, analyst_rating: 50, target_price_change: 50 },
    BEAR: { news_sentiment_avg: 25, news_volume: 50, social_sentiment: 25, social_volume: 50, analyst_rating: 30, target_price_change: 40 },
  };

  const coefficients: Record<string, null> = {
    BULL: null,
    NEUTRAL: null,
    BEAR: null,
  };

  const input: ScoreMarketInput = {
    assetMetrics,
    coefficients,
    capturedAt: "2026-09-22T22:00:00Z",
    recentOveralls: {},
    prices: {
      BULL: { price: 100, priceChange: 2, volume: 1000 },
      NEUTRAL: { price: 100, priceChange: 0, volume: 1000 },
      BEAR: { price: 100, priceChange: -2, volume: 1000 },
    },
  };

  const results = scoreMarket(input);
  const byTicker = Object.fromEntries(results.map((r) => [r.ticker, r]));

  const bullSA = byTicker["BULL"].subAspectScores["news_sentiment_avg"];
  const neutralSA = byTicker["NEUTRAL"].subAspectScores["news_sentiment_avg"];
  const bearSA = byTicker["BEAR"].subAspectScores["news_sentiment_avg"];

  assert.strictEqual(bullSA, 75, `BULL news_sentiment_avg should be 75 (direct), got ${bullSA}`);
  assert.strictEqual(neutralSA, 50, `NEUTRAL news_sentiment_avg should be 50 (direct), got ${neutralSA}`);
  assert.strictEqual(bearSA, 25, `BEAR news_sentiment_avg should be 25 (direct), got ${bearSA}`);

  const bullDim = byTicker["BULL"].dimensionScores.sentiment;
  const neutralDim = byTicker["NEUTRAL"].dimensionScores.sentiment;
  const bearDim = byTicker["BEAR"].dimensionScores.sentiment;

  assert.ok(bullDim > neutralDim, `BULL sentiment dim (${bullDim}) should be > NEUTRAL (${neutralDim})`);
  assert.ok(neutralDim > bearDim, `NEUTRAL sentiment dim (${neutralDim}) should be > BEAR (${bearDim})`);
});

// ─── Test 9: Engine sentiment dimension scores within [0, 100] ─────────────────
test("scoreMarket produces sentiment dimension scores in [0, 100]", () => {
  const tickers = ["A", "B", "C"];
  const assetMetrics: Record<string, Record<string, number | null>> = {
    A: { news_sentiment_avg: 75, news_volume: 50 },
    B: { news_sentiment_avg: 30, news_volume: 20 },
    C: { news_sentiment_avg: 50, news_volume: 30 },
  };

  const coefficients: Record<string, null> = {
    A: null,
    B: null,
    C: null,
  };

  const input: ScoreMarketInput = {
    assetMetrics,
    coefficients,
    capturedAt: "2026-09-22T22:00:00Z",
    recentOveralls: {},
    prices: {
      A: { price: 100, priceChange: 1, volume: 1000 },
      B: { price: 100, priceChange: -1, volume: 1000 },
      C: { price: 100, priceChange: 0, volume: 1000 },
    },
  };

  const results = scoreMarket(input);
  for (const r of results) {
    const sent = r.dimensionScores.sentiment;
    assert.ok(sent >= 0, `sentiment dim ${r.ticker} should be >= 0, got ${sent}`);
    assert.ok(sent <= 100, `sentiment dim ${r.ticker} should be <= 100, got ${sent}`);
  }
});

// ─── Test 10: Null sentiment → 50.0 neutral ───────────────────────────────────
test("scoreMarket defaults missing sentiment to 50.0 neutral", () => {
  const tickers = ["A", "B"];
  const assetMetrics: Record<string, Record<string, number | null>> = {
    A: { news_sentiment_avg: null, news_volume: null },
    B: { news_sentiment_avg: null, news_volume: null },
  };

  const coefficients: Record<string, null> = {
    A: null,
    B: null,
  };

  const input: ScoreMarketInput = {
    assetMetrics,
    coefficients,
    capturedAt: "2026-09-22T22:00:00Z",
    recentOveralls: {},
    prices: {
      A: { price: 100, priceChange: 1, volume: 1000 },
      B: { price: 100, priceChange: -1, volume: 1000 },
    },
  };

  const results = scoreMarket(input);
  for (const r of results) {
    const sa = r.subAspectScores["news_sentiment_avg"];
    assert.strictEqual(sa, 50.0, `Missing news_sentiment_avg should be 50.0, got ${sa}`);
    assert.strictEqual(r.dimensionScores.sentiment, 50, `Missing sentiment should be 50, got ${r.dimensionScores.sentiment}`);
  }
});

// ─── Test 11: Sentiment taxonomy coverage ─────────────────────────────────────
test("sentiment dimension has news, social, and analyst sub-dimensions", () => {
  const sentimentSpecs = METRIC_UNIVERSE.filter((m) => m.dim === "sentiment");
  const subDims = new Set(sentimentSpecs.map((s) => s.subDim));
  assert.ok(subDims.has("news"), "Should have news sub-dimension");
  assert.ok(subDims.has("social"), "Should have social sub-dimension");
  assert.ok(subDims.has("analyst"), "Should have analyst sub-dimension");

  const subAspects = sentimentSpecs.map((s) => s.subAspect);
  assert.ok(subAspects.includes("news_sentiment_avg"), "Should have news_sentiment_avg");
  assert.ok(subAspects.includes("news_volume"), "Should have news_volume");
  assert.ok(subAspects.includes("social_sentiment"), "Should have social_sentiment");
  assert.ok(subAspects.includes("social_volume"), "Should have social_volume");
  assert.ok(subAspects.includes("analyst_rating"), "Should have analyst_rating");
  assert.ok(subAspects.includes("target_price_change"), "Should have target_price_change");
});
