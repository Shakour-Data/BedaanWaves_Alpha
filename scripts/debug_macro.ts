import { loadRealUniverse, computeMarketReturns, generateRealDay } from "../src/lib/scoring/seed/real-data";
import { METRIC_UNIVERSE } from "../src/lib/scoring/metric-universe";

const universe = loadRealUniverse();
if (!universe) { console.log("No universe"); process.exit(1); }

const macro = universe.macro;
console.log("Macro keys in universe data:", Object.keys(macro));

// Check which metric universe macro dbFields have data
const macroSpecs = METRIC_UNIVERSE.filter(m => m.dim === "macro");
console.log("\nMetric universe macro dbFields:", macroSpecs.map(s => s.dbField));
const matched = macroSpecs.filter(s => Object.keys(macro).includes(s.dbField));
console.log("Matched (have data):", matched.length, "/", macroSpecs.length);
console.log("  Matched:", matched.map(s => s.dbField));

// Generate first day and check macro values
const day0 = generateRealDay(universe, 0, computeMarketReturns(universe));
console.log("\nDay 0 macro values:");
for (const [k, v] of Object.entries(day0.macro).slice(0, 20)) {
  console.log(`  ${k} = ${v}`);
}

// Check day 1
const day1 = generateRealDay(universe, 1, computeMarketReturns(universe));
console.log("\nDay 0 vs Day 1 macro comparison:");
const fields = Object.keys(day0.macro).slice(0, 20);
for (const f of fields) {
  console.log(`  ${f}: day0=${day0.macro[f]?.toFixed(2)} day1=${day1.macro[f]?.toFixed(2)} change=${((day1.macro[f] ?? 0) - (day0.macro[f] ?? 0)).toFixed(2)}`);
}

process.exit(0);
