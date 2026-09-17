// Verify macro scores are no longer all 50 (test script)
import { loadRealUniverse, computeMarketReturns, generateRealDay } from "@/lib/scoring/seed/real-data";
import { scoreMarket } from "@/lib/scoring/engine";
import { METRIC_UNIVERSE } from "@/lib/scoring/metric-universe";

const universe = loadRealUniverse();
if (!universe) { console.error("Failed to load real universe"); process.exit(1); }

console.log(`Loaded ${universe.tickers.length} tickers, ${universe.tradingDays.length} scoring days`);
console.log(`Macro indicators: ${Object.keys(universe.macro).length}`);

// Count indicators with real variance vs flat
let realVariance = 0, flat = 0;
for (const [k, pts] of Object.entries(universe.macro)) {
  if (!Array.isArray(pts) || pts.length === 0) continue;
  const unique = new Set(pts.map(p => p.value)).size;
  if (unique > 1) realVariance++;
  else flat++;
}
console.log(`Indicators with real variance: ${realVariance}`);
console.log(`Indicators with zero variance (flat/single-point): ${flat}`);

const dayIdx = universe.tradingDays.length - 1;
const marketReturns = computeMarketReturns(universe);
const day = generateRealDay(universe, dayIdx, marketReturns);

console.log(`\nScoring day: ${day.date}`);

// Score with cold-start (uniform weights)
const coeffs: Record<string, any> = {};
for (const t of universe.tickers) coeffs[t] = null;

const snapshots = scoreMarket({
  assetMetrics: day.assetMetrics,
  coefficients: coeffs,
  capturedAt: new Date().toISOString(),
  prices: day.prices,
  macroHistory: day.macroHistory,
});

// Check macro sub-aspect scores
const first = snapshots[0];
const macroAspects = Object.entries(first.subAspectScores)
  .filter(([k]) => {
    const spec = METRIC_UNIVERSE.find(m => m.subAspect === k);
    return spec && spec.dim === "macro";
  })
  .map(([k, v]) => ({ key: k, score: v as number }));

const nonNeutral = macroAspects.filter(a => Math.abs(a.score - 50) > 0.1);
const neutral = macroAspects.filter(a => Math.abs(a.score - 50) <= 0.1);

console.log(`\nMacro sub-aspect scores: ${macroAspects.length} total`);
console.log(`  Non-neutral (real variance): ${nonNeutral.length}`);
console.log(`  Neutral (flat/insufficient data): ${neutral.length}`);

console.log(`\nNon-neutral macro sub-aspect scores for ${first.ticker}:`);
for (const a of nonNeutral) {
  console.log(`  ${a.key.padEnd(30)} = ${a.score.toFixed(1)}`);
}

console.log(`\nNeutral macro sub-aspect scores for ${first.ticker}:`);
for (const a of neutral) {
  console.log(`  ${a.key.padEnd(30)} = ${a.score.toFixed(1)}`);
}

console.log(`\nMacro dimension score: ${first.dimensionScores.macro?.toFixed(1)} (was 50.0 before fix)`);
console.log(`Overall score: ${first.overall.toFixed(1)}`);
