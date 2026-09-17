// Test script: verify macro scores are not all 50
import { loadRealUniverse, computeMarketReturns, generateRealDay } from "@/lib/scoring/seed/real-data";
import { scoreMarket } from "@/lib/scoring/engine";
import { learnCoefficients } from "@/lib/scoring/learner";

const universe = loadRealUniverse();
if (!universe) {
  console.error("Failed to load real universe");
  process.exit(1);
}

console.log(`Loaded ${universe.tickers.length} tickers, ${universe.tradingDays.length} scoring days`);
console.log(`Macro indicators: ${Object.keys(universe.macro).length}`);

// Check macro data variance
const marketIndicators = Object.entries(universe.macro).filter(([_, pts]) => Array.isArray(pts));
console.log("\nMacro data summary:");
for (const [key, pts] of marketIndicators) {
  const values = pts.map(p => p.value);
  const unique = new Set(values).size;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = values.reduce((a,b) => a+b, 0) / values.length;
  console.log(`  ${key.padEnd(30)} ${values.length} pts, unique=${new Set(values).size}, min=${min.toFixed(2)}, max=${max.toFixed(2)}, mean=${mean.toFixed(2)}`);
}

// Generate the last scoring day and score it
const dayIdx = universe.tradingDays.length - 1;
const dateStr = universe.tradingDays[dayIdx];
const marketReturns = computeMarketReturns(universe);
const day = generateRealDay(universe, dayIdx, marketReturns);

console.log(`\nScoring day: ${dateStr}`);
console.log(`Macro values on ${dateStr}:`);
for (const [k, v] of Object.entries(day.macro).sort()) {
  const histLen = day.macroHistory[k]?.length ?? 0;
  console.log(`  ${k.padEnd(30)} value=${v?.toFixed(4)}, history=${histLen} pts`);
}

// Score without coefficients (cold-start / uniform weights)
const coeffs: Record<string, any> = {};
for (const t of universe.tickers) coeffs[t] = null;

const snapshots = scoreMarket({
  assetMetrics: day.assetMetrics,
  coefficients: coeffs,
  capturedAt: new Date().toISOString(),
  prices: day.prices,
  macroHistory: day.macroHistory,
});

// Check macro dimension scores
console.log("\n--- Macro dimension scores (should NOT all be 50) ---");
const macroScores = snapshots.map(s => ({
  ticker: s.ticker,
  macroScore: s.dimensionScores.macro ?? 0,
}));
const uniqueScores = new Set(macroScores.map(s => s.macroScore));
console.log(`Unique macro scores: ${uniqueScores.size}`);
console.log(`Score range: ${Math.min(...macroScores.map(s => s.macroScore)).toFixed(1)} - ${Math.max(...macroScores.map(s => s.macroScore)).toFixed(1)}`);

// Show a few
console.log("\nSample ticker scores:");
for (let i = 0; i < Math.min(5, snapshots.length); i++) {
  const s = snapshots[i];
  console.log(`  ${s.ticker}: overall=${s.overall.toFixed(1)}, macro=${s.dimensionScores.macro?.toFixed(1)}, fundamental=${s.dimensionScores.fundamental?.toFixed(1)}, technical=${s.dimensionScores.technical?.toFixed(1)}`);
}

// Check sub-aspect scores for macro metrics
const firstTicker = snapshots[0];
console.log(`\nAll macro sub-aspect scores for ${firstTicker.ticker}:`);
const macroSubAspects = Object.keys(firstTicker.subAspectScores).filter(k => {
  const spec = require("@/lib/scoring/metric-universe").METRIC_UNIVERSE.find((m: any) => m.subAspect === k);
  return spec && spec.dim === "macro";
});
for (const sa of macroSubAspects) {
  console.log(`  ${sa.padEnd(30)} = ${firstTicker.subAspectScores[sa]?.toFixed(1)}`);
}

// Also show a few tickers with trained coefficients to see per-ticker differentiation
console.log("\n--- Testing with simulated learned coefficients ---");
const dimKeys = ["fundamental", "technical", "sentiment", "risk", "macro", "ai"];
const simCoeffs: Record<string, any> = {};
for (const t of universe.tickers) {
  // Simulate per-symbol weight preference for macro
  const macroWeight = { macro: 0.25 };
  const weights: Record<string, number> = {};
  for (const d of dimKeys) weights[d] = 1 / dimKeys.length;
  // Vary macro weight per ticker
  const r = Math.abs(hashCode(t) % 100) / 100;
  weights.macro = 0.15 + r * 0.3; // 15-45% macro weight
  const otherW = (1 - weights.macro) / (dimKeys.length - 1);
  for (const d of dimKeys.filter(x => x !== "macro")) weights[d] = otherW;
  simCoeffs[t] = { dimensions: weights, level: "dimensions", version: "test-v1" };
}
function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
}
const snapshots2 = scoreMarket({
  assetMetrics: day.assetMetrics,
  coefficients: simCoeffs as any,
  capturedAt: new Date().toISOString(),
  prices: day.prices,
  macroHistory: day.macroHistory,
});
const macroScores2 = snapshots2.map(s => s.dimensionScores.macro ?? 0);
const unique2 = new Set(macroScores2.map(s => Math.round(s * 10) / 10));
console.log(`Unique macro scores across tickers: ${unique2.size}`);
console.log(`Macro score range: ${Math.min(...macroScores2).toFixed(1)} - ${Math.max(...macroScores2).toFixed(1)}`);
console.log("Sample ticker macro scores:");
for (let i = 0; i < Math.min(10, snapshots2.length); i++) {
  console.log(`  ${snapshots2[i].ticker}: macro=${snapshots2[i].dimensionScores.macro?.toFixed(1)}, overall=${snapshots2[i].overall.toFixed(1)}`);
}
