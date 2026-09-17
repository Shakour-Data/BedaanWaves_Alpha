// Run the BedaanWaves seed pipeline.
import { seedIfNeeded } from "../src/lib/scoring/seed/orchestrator";

(async () => {
  console.log("Starting BedaanWaves seed...");
  const res = await seedIfNeeded(true);
  console.log("Seed complete:", JSON.stringify(res, null, 2));
  process.exit(0);
})();
