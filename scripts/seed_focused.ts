// Run the BedaanWaves real-data seed pipeline with a focused subset of tickers.
import { seedIfNeeded } from "../src/lib/scoring/seed/orchestrator";

(async () => {
  console.log("Starting focused seed...");
  const res = await seedIfNeeded({ incremental: false, force: false, limit: 100 });
  console.log("Focused seed complete:", JSON.stringify(res, null, 2));
  process.exit(0);
})();