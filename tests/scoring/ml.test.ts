// Tests for the Python ML trainer adapter (learner.ts)
// Verifies: coefficient loading, validation, cold-start fallback, weight contract
import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { learnCoefficients, loadCoefficients, computeOosMetrics, pearson } from "@/lib/scoring/learner";

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
});
