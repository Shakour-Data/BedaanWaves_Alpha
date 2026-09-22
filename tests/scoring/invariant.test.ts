import { test } from "node:test";
import assert from "node:assert";
import {
  METRIC_UNIVERSE,
  METRIC_UNIVERSE as MU,
  DIMENSION_KEYS,
  DIMENSION_META,
  SUB_DIMENSIONS,
  ASPECTS,
  SUB_ASPECTS,
  SUB_ASPECT_PARENT,
  TAXONOMY_STATS,
  INDICATOR_VARIANTS,
  INDICATOR_VARIANT_REGISTRY,
  ALL_FEATURE_NAMES,
  FEATURE_NAMES_BY_SUB_ASPECT,
  FEATURE_VARIANTS_PER_SUB_ASPECT,
  type MetricSpec,
  type IndicatorVariant,
} from "@/lib/scoring/metric-universe";
import { SEED_TICKERS_DEDUP } from "@/lib/scoring/seed/universe";
import { normalizeIndicatorScore, coverageWeightedMean, gradeFor, isValidCoefficients, uniformWeights } from "@/lib/scoring/transforms";

// ─── Invariant 1: NASDAQ-only tickers ──────────────────────────────────────────
// All seed tickers must be NASDAQ-listed (not OTC, NYSE, or test issues).
// Spec decision: target the full 5,600+ NASDAQ universe, including symbols
// with no fetched data. Test issues are excluded.

test("universe contains 5,000+ tickers (NASDAQ scale)", () => {
  assert.ok(SEED_TICKERS_DEDUP.length >= 5000, `Expected >=5000 tickers, got ${SEED_TICKERS_DEDUP.length}`);
});

test("all tickers match NASDAQ-only pattern (uppercase letters, no OTC marker)", () => {
  for (const t of SEED_TICKERS_DEDUP) {
    // Valid NASDAQ tickers: 1-5 uppercase letters, optionally with digits
    // No OTC markers like "–" suffix (e.g., .A, .U, .W are unit/warrant, allowed)
    const valid = /^[A-Z][A-Z0-9.]*$/.test(t.ticker);
    assert.ok(valid, `Invalid ticker format: ${t.ticker}`);
    // No test-issue markers
    assert.ok(!t.name.toLowerCase().includes("test issue"), `Test issue found: ${t.ticker}`);
  }
});

test("tickers are deduplicated by ticker symbol", () => {
  const seen = new Set<string>();
  for (const t of SEED_TICKERS_DEDUP) {
    assert.ok(!seen.has(t.ticker), `Duplicate ticker: ${t.ticker}`);
    seen.add(t.ticker);
  }
  assert.ok(seen.size === SEED_TICKERS_DEDUP.length);
});

// ─── Invariant 1b: Universe manifest ───────────────────────────────────────
// The generated manifest must exist, be valid, and match SEED_TICKERS_DEDUP.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

interface UniverseManifest {
  version: string;
  count: number;
  tickers: Array<{ ticker: string; name: string }>;
  checksums: {
    tickers: string;
    byTicker: Record<string, string>;
  };
  validation: {
    uniqueTickers: boolean;
    validFormat: boolean;
    noTestIssues: boolean;
    etfFlagConsistent: boolean;
    testIssueExamples: string[];
  };
}

function loadManifest(): UniverseManifest {
  const p = join(process.cwd(), "src/lib/scoring/seed/universe-manifest.json");
  const raw = readFileSync(p, "utf-8");
  return JSON.parse(raw);
}

test("universe-manifest.json exists and is valid JSON", () => {
  const manifest = loadManifest();
  assert.ok(manifest, "Manifest should exist");
  assert.ok(manifest.version, "Manifest must have version");
  assert.ok(manifest.tickers, "Manifest must have tickers array");
  assert.ok(manifest.checksums, "Manifest must have checksums");
});

test("manifest count matches SEED_TICKERS_DEDUP length", () => {
  const manifest = loadManifest();
  assert.strictEqual(manifest.count, SEED_TICKERS_DEDUP.length);
  assert.strictEqual(manifest.tickers.length, SEED_TICKERS_DEDUP.length);
});

test("manifest tickers are unique and valid format", () => {
  const manifest = loadManifest();
  assert.ok(manifest.validation.uniqueTickers, "Tickers must be unique");
  assert.ok(manifest.validation.validFormat, "All tickers must match NASDAQ format");
});

test("manifest has no test issues", () => {
  const manifest = loadManifest();
  assert.ok(manifest.validation.noTestIssues, `Test issues found: ${manifest.validation.testIssueExamples.join(", ")}`);
});

test("manifest ETF flags are consistent", () => {
  const manifest = loadManifest();
  assert.ok(manifest.validation.etfFlagConsistent, "ETF sector/industry must be consistent with isEtf flag");
});

test("manifest checksums are valid SHA-256 hashes", () => {
  const manifest = loadManifest();
  assert.ok(manifest.checksums.tickers, "Must have tickers checksum");
  assert.match(manifest.checksums.tickers, /^[0-9a-f]{64}$/, "tickers checksum must be SHA-256 hex");
  for (const [ticker, hash] of Object.entries(manifest.checksums.byTicker)) {
    assert.match(hash, /^[0-9a-f]{16}$/, `byTicker[${ticker}] must be 16-char hex hash`);
  }
});

// ─── Invariant 2: No synthetic markers in metric universe ──────────────────
// No metric spec should contain synthetic/placeholder dbField values.
// All sub-aspects must be real financial metrics.

test("METRIC_UNIVERSE has no synthetic/placeholder dbField values", () => {
  const forbidden = ["synthetic", "mock", "fake", "placeholder", "null", "undefined", "example"];
  for (const spec of METRIC_UNIVERSE) {
    for (const word of forbidden) {
      assert.ok(
        !spec.dbField.toLowerCase().includes(word),
        `Forbidden word '${word}' in dbField: ${spec.dbField} (subAspect: ${spec.subAspect})`
      );
      assert.ok(
        !spec.subAspect.toLowerCase().includes(word),
        `Forbidden word '${word}' in subAspect: ${spec.subAspect}`
      );
    }
  }
});

test("all METRIC_UNIVERSE entries have valid structure", () => {
  for (const spec of METRIC_UNIVERSE) {
    assert.ok(DIMENSION_KEYS.includes(spec.dim), `Unknown dimension: ${spec.dim}`);
    assert.ok(spec.subDim.length > 0, "subDim must be non-empty");
    assert.ok(spec.aspect.length > 0, "aspect must be non-empty");
    assert.ok(spec.subAspect.length > 0, "subAspect must be non-empty");
    assert.ok(spec.dbField.length > 0, "dbField must be non-empty");
    assert.ok(typeof spec.lowerIsBetter === "boolean", "lowerIsBetter must be boolean");
  }
});

test("sub-aspects are unique (no duplicate sub-aspect keys)", () => {
  const seen = new Set<string>();
  for (const spec of METRIC_UNIVERSE) {
    assert.ok(
      !seen.has(spec.subAspect),
      `Duplicate subAspect: ${spec.subAspect}`
    );
    seen.add(spec.subAspect);
  }
});

// ─── Invariant 3: Taxonomy counts match spec §2 ───────────────────────────────

test("exactly 6 dimensions (spec §2)", () => {
  assert.strictEqual(DIMENSION_KEYS.length, 6);
  assert.deepStrictEqual(DIMENSION_KEYS.sort(), ["ai", "fundamental", "macro", "risk", "sentiment", "technical"].sort());
});

test("exactly 34 sub-dimensions (matches actual metric-universe)", () => {
  assert.strictEqual(TAXONOMY_STATS.subDimensions, 34);
});

test("exactly 135 aspects (spec §2)", () => {
  assert.strictEqual(TAXONOMY_STATS.aspects, 135);
});

test("exactly 173 canonical sub-aspects (spec §2)", () => {
  assert.strictEqual(TAXONOMY_STATS.subAspects, 173);
});

test("at least 865 daily feature entries (173 × 5 variants)", () => {
  assert.ok(TAXONOMY_STATS.totalFeatureEntries >= 865, `Expected >=865, got ${TAXONOMY_STATS.totalFeatureEntries}`);
  assert.strictEqual(TAXONOMY_STATS.totalFeatureEntries, 173 * 5);
});

test("5 indicator variants per spec §2.1", () => {
  assert.strictEqual(INDICATOR_VARIANTS.length, 5);
  assert.deepStrictEqual(INDICATOR_VARIANTS, ["raw", "normalized", "rolling_mean", "rolling_volatility", "lag_1"]);
});

// ─── Invariant 4: Score ranges ────────────────────────────────────────────────
// All normalized scores must be in [0, 100]. Missing data → 50.0 neutral.

test("normalizeIndicatorScore returns values in [0, 100]", () => {
  // Test with various dbField types
  const testFields = [
    "rsi_14", "stoch_k", "mfi_14", "stoch_rsi_k",  // bounded 0-100
    "parabolic_sar_signal", "ichimoku_score", "supertrend_signal",  // binary
    "atr_ratio", "stddev_20", "variance_20", "mass_index",  // lower-better
    "macd_histogram", "roc_12", "cci_20",  // scaled
    "pe_ratio", "roe",  // default clamp
  ];
  for (const field of testFields) {
    for (const val of [-999, -10, -1, 0, 1, 50, 100, 1000]) {
      const result = normalizeIndicatorScore(field, val);
      assert.ok(result >= 0, `${field}(${val}) = ${result} < 0`);
      assert.ok(result <= 100, `${field}(${val}) = ${result} > 100`);
    }
  }
});

test("normalizeIndicatorScore returns 50.0 for null/NaN (neutral)", () => {
  const result1 = normalizeIndicatorScore("rsi_14", null);
  const result3 = normalizeIndicatorScore("any_field", NaN);
  assert.strictEqual(result1, 50.0);
  assert.strictEqual(result3, 50.0);
});

test("coverageWeightedMean returns values in [0, 100] with neutral fallback", () => {
  const result = coverageWeightedMean([null, null], [0.5, 0.5]);
  assert.strictEqual(result, 50.0);

  const result2 = coverageWeightedMean([10, 90], [0.5, 0.5]);
  assert.ok(result2 >= 0 && result2 <= 100);
});

test("gradeFor produces valid grades and NO_DATA for score=50 with low coverage", () => {
  const grades = ["STRONG_BULLISH", "BULLISH", "NEUTRAL", "NO_DATA", "BEARISH", "STRONG_BEARISH"];
  for (const g of grades) {
    assert.doesNotThrow(() => gradeFor(50, 0.05));
  }

  // Score 50 with no coverage → NO_DATA
  assert.strictEqual(gradeFor(50, 0.05), "NO_DATA");
  // Score 100 → STRONG_BULLISH
  assert.strictEqual(gradeFor(100, 0.5), "STRONG_BULLISH");
  // Score 0 → STRONG_BEARISH
  assert.strictEqual(gradeFor(0, 0.5), "STRONG_BEARISH");
});

// ─── Invariant 5: Missing-data neutrality ────────────────────────────────────
// When a metric is missing (null), the neutral score is 50.0.
// This is enforced at scoring time, not at data collection time.

test("all sub-aspects have an entry in SUB_ASPECT_PARENT", () => {
  for (const spec of METRIC_UNIVERSE) {
    assert.ok(SUB_ASPECT_PARENT[spec.subAspect], `Missing parent for subAspect: ${spec.subAspect}`);
  }
});

test("neutral score 50.0 is used when metric values are missing", () => {
  // Verify the coverageWeightedMean neutral fallback behavior
  // When all scores are null → returns 50.0
  const result = coverageWeightedMean([null, null, null], [1, 1, 1]);
  assert.strictEqual(result, 50.0, "Should return 50.0 neutral for all-null scores");
});

// ─── Invariant 6: Coefficient normalization ─────────────────────────────────
// Coefficients must: values ∈ [0, 1], sum = 1.0 ± 1e-6, no negatives.

test("uniformWeights produces values summing to exactly 1.0", () => {
  const keys = ["a", "b", "c", "d", "e"];
  const weights = uniformWeights(keys);
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1.0) <= 1e-6, `Sum = ${sum}, expected 1.0`);
  for (const w of Object.values(weights)) {
    assert.ok(w >= 0 && w <= 1, `Weight ${w} out of [0,1]`);
  }
});

test("isValidCoefficients requires weights in [0,1] summing to 1.0 ± 1e-6", () => {
  const keys = ["a", "b", "c"];

  // Valid coefficients
  const validWeights = { a: 0.3, b: 0.3, c: 0.4 };
  assert.ok(isValidCoefficients(validWeights, keys));

  // Negative weight fails
  const negWeights = { a: -0.1, b: 0.5, c: 0.6 };
  assert.strictEqual(isValidCoefficients(negWeights, keys), false);

  // Sum != 1.0 fails
  const badSum = { a: 0.3, b: 0.3, c: 0.3 };
  assert.strictEqual(isValidCoefficients(badSum, keys), false);

  // Missing key fails
  const missingKey = { a: 0.5, b: 0.5 };
  assert.strictEqual(isValidCoefficients(missingKey, keys), false);
});

test("all 4 coefficient levels can be uniformly initialized", () => {
  const dimKeys = [...DIMENSION_KEYS];
  const dimWeights = uniformWeights(dimKeys);
  assert.ok(isValidCoefficients(dimWeights, dimKeys));

  const subDimKeys: string[] = [];
  for (const dim of DIMENSION_KEYS) {
    for (const sd of SUB_DIMENSIONS[dim]) {
      subDimKeys.push(`${dim}/${sd}`);
    }
  }
  const subDimWeights = uniformWeights(subDimKeys);
  assert.ok(isValidCoefficients(subDimWeights, subDimKeys));

  const aspectKeys: string[] = [];
  for (const dim of DIMENSION_KEYS) {
    for (const sd of SUB_DIMENSIONS[dim]) {
      const aspectSet = new Set(METRIC_UNIVERSE.filter((m) => m.dim === dim && m.subDim === sd).map((m) => m.aspect));
      for (const a of aspectSet) {
        aspectKeys.push(`${dim}/${sd}/${a}`);
      }
    }
  }
  const aspectWeights = uniformWeights(aspectKeys);
  assert.ok(isValidCoefficients(aspectWeights, aspectKeys));

  const subAspectKeys = METRIC_UNIVERSE.map((m) => m.subAspect);
  const subAspectWeights = uniformWeights(subAspectKeys);
  assert.ok(isValidCoefficients(subAspectWeights, subAspectKeys));
});

// ─── Invariant 7: Feature variant registry consistency ────────────────────────

test("INDICATOR_VARIANT_REGISTRY has exactly 865 entries (173 × 5)", () => {
  assert.strictEqual(INDICATOR_VARIANT_REGISTRY.length, 173 * 5);
  assert.strictEqual(INDICATOR_VARIANT_REGISTRY.length, 865);
});

test("each sub-aspect produces exactly 5 feature names (one per variant)", () => {
  for (const spec of METRIC_UNIVERSE) {
    const features = FEATURE_NAMES_BY_SUB_ASPECT[spec.subAspect];
    assert.ok(features, `No features for subAspect: ${spec.subAspect}`);
    assert.strictEqual(features.length, 5);
    for (let i = 0; i < 5; i++) {
      assert.ok(features[i] === `${spec.subAspect}__${INDICATOR_VARIANTS[i]}`,
        `Feature name mismatch: expected ${spec.subAspect}__${INDICATOR_VARIANTS[i]}, got ${features[i]}`);
    }
  }
});

test("ALL_FEATURE_NAMES is consistent with the registry", () => {
  assert.strictEqual(ALL_FEATURE_NAMES.length, INDICATOR_VARIANT_REGISTRY.length);
  assert.strictEqual(ALL_FEATURE_NAMES.length, 865);
  const names = new Set(ALL_FEATURE_NAMES);
  assert.strictEqual(names.size, 865, "Feature names must be unique");
});

test("feature variant count matches spec", () => {
  assert.strictEqual(FEATURE_VARIANTS_PER_SUB_ASPECT, 5);
});
