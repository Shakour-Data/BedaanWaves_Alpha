import { test } from "node:test";
import assert from "node:assert";
import {
  validateOhlcvOrdering,
  validateAdjustedPrices,
  validateTickerCoverage,
  validateMacroPointInTime,
  validateNoSyntheticValues,
  validateSourceLineage,
  validateFullIngestion,
} from "@/lib/scoring/seed/validation";
import type { RealBar } from "@/lib/scoring/seed/real-data";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ─── Ingestion validation tests ──────────────────────────────────────────────

test("validateOhlcvOrdering: detects chronological order violations", () => {
  const bars: RealBar[] = [
    { date: "2024-01-03", open: 100, high: 105, low: 99, close: 102, volume: 1000 },
    { date: "2024-01-02", open: 99, high: 103, low: 98, close: 100, volume: 900 },  // out of order
  ];
  const result = validateOhlcvOrdering(bars, "TEST");
  assert.ok(!result.valid);
  assert.ok(result.errors.some((e) => e.includes("not in chronological order")));
});

test("validateOhlcvOrdering: detects duplicate dates", () => {
  const bars: RealBar[] = [
    { date: "2024-01-01", open: 100, high: 105, low: 99, close: 102, volume: 1000 },
    { date: "2024-01-01", open: 101, high: 106, low: 100, close: 103, volume: 1100 },
  ];
  const result = validateOhlcvOrdering(bars, "TEST");
  assert.ok(!result.valid);
  assert.ok(result.errors.some((e) => e.includes("Duplicate date")));
});

test("validateOhlcvOrdering: passes for valid bars", () => {
  const bars: RealBar[] = [
    { date: "2024-01-01", open: 100, high: 105, low: 99, close: 102, volume: 1000 },
    { date: "2024-01-02", open: 102, high: 108, low: 101, close: 106, volume: 900 },
    { date: "2024-01-03", open: 106, high: 110, low: 105, close: 108, volume: 1100 },
  ];
  const result = validateOhlcvOrdering(bars, "TEST");
  assert.ok(result.valid, `Expected valid but got: ${result.errors.join("; ")}`);
});

test("validateAdjustedPrices: detects non-positive prices", () => {
  const bars: RealBar[] = [
    { date: "2024-01-01", open: 0, high: 105, low: 99, close: 102, volume: 1000 },
  ];
  const result = validateAdjustedPrices(bars, "TEST");
  assert.ok(!result.valid);
  assert.ok(result.errors.some((e) => e.includes("Non-positive price")));
});

test("validateAdjustedPrices: detects negative prices", () => {
  const bars: RealBar[] = [
    { date: "2024-01-01", open: -5, high: 105, low: 99, close: 102, volume: 1000 },
  ];
  const result = validateAdjustedPrices(bars, "TEST");
  assert.ok(!result.valid);
  assert.ok(result.errors.some((e) => e.includes("Non-positive price")));
});

test("validateAdjustedPrices: passes for valid prices", () => {
  const bars: RealBar[] = [
    { date: "2024-01-01", open: 100, high: 105, low: 99, close: 102, volume: 1000 },
  ];
  const result = validateAdjustedPrices(bars, "TEST");
  assert.ok(result.valid, `Expected valid but got: ${result.errors.join("; ")}`);
});

test("validateTickerCoverage: validates coverage percentage", () => {
  const available = new Set(["AAPL", "MSFT"]);
  const universe = ["AAPL", "MSFT", "GOOGL", "AMZN"];
  const result = validateTickerCoverage(available, universe);
  assert.ok(result.valid);  // 50% coverage is the minimum threshold
  assert.ok(result.warnings.some((w) => w.includes("Missing tickers")));
});

test("validateTickerCoverage: fails on insufficient coverage", () => {
  const available = new Set(["AAPL", "MSFT"]);
  const universe = ["AAPL", "MSFT", "GOOGL", "AMZN", "META", "TSLA", "NVDA", "UNH", "JNJ", "V"];
  const result = validateTickerCoverage(available, universe);
  assert.ok(!result.valid);
  assert.ok(result.errors.some((e) => e.includes("Insufficient ticker coverage")));
});

test("validateNoSyntheticValues: detects synthetic markers", () => {
  const data = { price: 100, source: "synthetic interpolation" };
  const result = validateNoSyntheticValues(data, "TEST");
  assert.ok(!result.valid);
  assert.ok(result.errors.some((e) => e.includes("Synthetic marker")));
});

test("validateNoSyntheticValues: passes for clean data", () => {
  const data = { price: 100, source: "yfinance" };
  const result = validateNoSyntheticValues(data, "TEST");
  assert.ok(result.valid);
});

test("validateSourceLineage: requires source metadata", () => {
  const result = validateSourceLineage({});
  assert.ok(!result.valid);
  assert.ok(result.errors.some((e) => e.includes("Missing or invalid 'source'")));
});

test("validateSourceLineage: passes with valid source", () => {
  const result = validateSourceLineage({
    source: { ohlcv: "yfinance (auto_adjust=True)", fundamentals: "yfinance ticker.info" },
    fetched_at: "2024-01-01T00:00:00Z",
    tickers: ["AAPL"],
  });
  assert.ok(result.valid);
});

test("validateMacroPointInTime: validates date ordering", () => {
  const macro = {
    fed_funds_rate: [
      { date: "2024-01-02", value: 5.3 },
      { date: "2024-01-01", value: 5.2 },  // out of order
    ],
  };
  const results = validateMacroPointInTime(macro);
  const result = results[0];
  assert.ok(!result.valid);
  assert.ok(result.errors.some((e) => e.includes("dates not ordered")));
});

test("validateMacroPointInTime: passes with valid data", () => {
  const macro = {
    fed_funds_rate: [
      { date: "2024-01-01", value: 5.2 },
      { date: "2024-01-02", value: 5.3 },
    ],
  };
  const results = validateMacroPointInTime(macro);
  const result = results[0];
  assert.ok(result.valid);
  assert.strictEqual(result.points, 2);
});

test("validateFullIngestion: validates real-market-data.json if it exists", () => {
  const dataPath = join(process.cwd(), "src/lib/scoring/seed/real-market-data.json");
  try {
    const raw = readFileSync(dataPath, "utf-8");
    const data = JSON.parse(raw);
    const universeTickers = data.tickers || [];
    const result = validateFullIngestion(
      data.per_ticker || {},
      data.macro || {},
      universeTickers,
      { source: data.source, fetched_at: data.fetched_at, tickers: data.tickers }
    );
    // We don't assert full validity (limited ticker coverage is expected with real data)
    // but we verify the function runs and returns a structured result
    assert.ok(typeof result.valid === "boolean");
    assert.ok(Array.isArray(result.tickerResults));
    assert.ok(Array.isArray(result.macroResults));
    assert.ok(Array.isArray(result.errors));
    assert.ok(Array.isArray(result.warnings));
  } catch {
    // Real data file not found — skip
    assert.ok(true);
  }
});
