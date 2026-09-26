// Tests for the Python ML trainer adapter (learner.ts)
// Verifies: coefficient loading, validation, cold-start fallback, weight contract
import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { learnCoefficients, loadCoefficients, computeOosMetrics, pearson, type TrainingSample } from "@/lib/scoring/learner";

const tmpDir = ".kilo/test-coef";

function saveCoeffs(ticker: string, level: string, keys: string[], val: number) {
  const weights: Record<string, number> = {};
  keys.forEach((k) => { weights[k] = val; });
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  if (sum > 0) {
    for (const k of Object.keys(weights)) weights[k] /= sum;
  }
  writeFileSync(`${tmpDir}/${ticker}/${level}_coefficients.json`, JSON.stringify({
    ticker, level, weights,
    trainedAt: "2024-01-01T00:00:00Z",
    sampleCount: 100,
    version: "v1",
    dataHash: "abc123",
    coldStart: false,
    oosR2: 0.05,
    oosIc: 0.15,
    shapTopKeys: ["pe_ratio"],
    regime: "calm",
    driftStatus: "OK",
    driftPsi: 0.0,
  }));
}

describe("learner.ts adapter", async () => {
  before(() => {
    mkdirSync(`${tmpDir}/AAPL`, { recursive: true });
    saveCoeffs("AAPL", "dimensions", ["fundamental", "technical", "sentiment", "risk", "macro", "ai"], 1);
    saveCoeffs("AAPL", "sub_dimensions", ["fundamental/valuation", "technical/momentum"], 1);
    saveCoeffs("AAPL", "aspects", ["fundamental/valuation/pe_ratio"], 1);
    saveCoeffs("AAPL", "sub_aspects", ["pe_ratio", "pb_ratio"], 1);
    writeFileSync(`${tmpDir}/AAPL/meta.json`, JSON.stringify({
      ticker: "AAPL",
      version: "v1-test",
      trainedAt: "2024-01-01T00:00:00Z",
      sampleCount: 100,
      dataHash: "abc123",
      oosR2: 0.05,
      oosIc: 0.15,
      shapSummary: ["pe_ratio", "pb_ratio"],
      regime: "calm",
    }));
  });

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("loads coefficients from valid artifact path", () => {
    const bundle = loadCoefficients("AAPL", tmpDir);
    assert.ok(bundle, "bundle should not be null");
    assert.strictEqual(bundle!.ticker, "AAPL");
    assert.strictEqual(bundle!.version, "v1-test");
    assert.strictEqual(bundle!.sampleCount, 100);
    assert.strictEqual(bundle!.coldStart, false);
  });

  test("returns null for missing ticker", () => {
    const bundle = loadCoefficients("NONEXISTENT", tmpDir);
    assert.strictEqual(bundle, null);
  });

  test("cold-start fallback returns uniform weights", () => {
    const coeffs = learnCoefficients("UNKNOWN", []);
    assert.strictEqual(coeffs.coldStart, true);
    assert.strictEqual(coeffs.sampleCount, 0);
    const dimSum = Object.values(coeffs.dimensions).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(dimSum - 1.0) < 1e-6);
  });

  test("cold-start weights are in [0,1]", () => {
    const coeffs = learnCoefficients("UNKNOWN", []);
    for (const level of ["dimensions", "sub_dimensions", "aspects", "sub_aspects"]) {
      const weights = coeffs[level as keyof typeof coeffs];
      if (weights && typeof weights === "object") {
        for (const v of Object.values(weights)) {
          assert.ok(v >= 0);
          assert.ok(v <= 1);
        }
      }
    }
  });

  test("pearson correlation works correctly", () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [2, 4, 6, 8, 10];
    assert.ok(Math.abs(pearson(xs, ys) - 1.0) < 1e-6);
    const ys2 = [10, 8, 6, 4, 2];
    assert.ok(Math.abs(pearson(xs, ys2) - (-1.0)) < 1e-6);
  });

  test("OOS metrics return null for cold-start", () => {
    const result = computeOosMetrics([], true);
    assert.strictEqual(result, null);
  });

  test("OOS metrics return null for insufficient samples", () => {
    const samples = Array.from({ length: 10 }, () => ({
      subAspectScores: { a: 50, b: 50 },
      dimensionScores: { fundamental: 50 },
      forwardReturn: 1.0,
    }));
    const result = computeOosMetrics(samples, false);
    assert.strictEqual(result, null);
  });

  test("loaded coefficients pass weight validation", () => {
    const bundle = loadCoefficients("AAPL", tmpDir);
    assert.ok(bundle);
    const dimSum = Object.values(bundle!.dimensions).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(dimSum - 1.0) < 1e-6);
  });

  // ─── Regression: zero-variance sentiment sub-aspects must NOT all be equal ──
  // When sentiment metrics have no temporal variance (e.g. all default to 50.0
  // because no news data), the TS learner should still produce differentiated,
  // non-zero weights — not uniform 1/n values, and not zero.
  test("zero-variance sentiment sub-aspects produce differentiated non-zero weights", () => {
    const sentKeys = ["news_sentiment_avg", "news_volume", "social_sentiment", "social_volume", "analyst_rating", "target_price_change"];
    const dimScores = { fundamental: 50, technical: 50, sentiment: 50, risk: 50, macro: 50, ai: 50 };
    // All sentiment sub-aspects are constant at 50.0 (zero variance)
    const constSubAspect: Record<string, number> = {};
    for (const k of sentKeys) constSubAspect[k] = 50;
    // Add a few non-sentiment sub-aspects with variance
    constSubAspect["pe_ratio"] = 60;
    constSubAspect["pe_ratio__rolling_mean"] = 58;
    constSubAspect["rsi_14"] = 55;

    const samples: TrainingSample[] = [];
    for (let i = 0; i < 60; i++) {
      samples.push({
        subAspectScores: { ...constSubAspect, rsi_14: 55 + i * 0.1 },
        dimensionScores: dimScores,
        forwardReturn: (i % 5) - 2,
      });
    }

    const panelSamples = samples.map((sample, i) => ({
      ...sample,
      subAspectScores: {
        ...sample.subAspectScores,
        news_sentiment_avg: i,
      },
    }));
    const learned = learnCoefficients("TEST", samples, panelSamples);
    const saWeights = learned.sub_aspects;

    // All sentiment sub-aspects should be present and non-zero.
    for (const k of sentKeys) {
      assert.ok(saWeights[k] > 0, `Sentiment sub-aspect '${k}' weight should be > 0, got ${saWeights[k]}`);
    }

    // A constant symbol-level feature can still learn from cross-sectional panel variance.
    assert.ok(
      saWeights["news_sentiment_avg"] > saWeights["news_volume"],
      `Panel-varying sentiment should outrank the constant feature: ${JSON.stringify(sentKeys.map((k) => [k, saWeights[k]]))}`
    );
  });

  // ─── Regression: zero-variance sentiment dimension must produce non-zero weight ─
  test("zero-variance sentiment dimension produces non-zero weight", () => {
    const dimScores = { fundamental: 60, technical: 55, sentiment: 50, risk: 45, macro: 50, ai: 50 };
    const samples: TrainingSample[] = [];
    for (let i = 0; i < 60; i++) {
      // sentiment always 50 (zero variance), others vary slightly
      samples.push({
        subAspectScores: { rsi_14: 50 + i, pe_ratio: 50 + i * 0.5 },
        dimensionScores: { ...dimScores, fundamental: 60 + i * 0.1, technical: 55 + i * 0.05 },
        forwardReturn: i % 3,
      });
    }

    const learned = learnCoefficients("TEST2", samples);
    assert.ok(learned.dimensions["sentiment"] > 0,
      `Sentiment dimension weight should be > 0, got ${learned.dimensions["sentiment"]}`);
  });
});
