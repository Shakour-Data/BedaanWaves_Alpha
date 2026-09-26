// Run the BedaanWaves real-data seed pipeline.
// Requires: scripts/fetch_real_data.py + scripts/fetch_real_macro.py + scripts/add_economic_releases.py
// have been run to populate real-market-data.json and real-macro-data.json.
import { seedIfNeeded } from "../src/lib/scoring/seed/orchestrator.ts";

(async () => {
  console.log("Starting BedaanWaves REAL-DATA seed...");
  const res = await seedIfNeeded({ incremental: false, force: true });
  console.log("Real-data seed complete:", JSON.stringify(res, null, 2));
  process.exit(0);
})();
