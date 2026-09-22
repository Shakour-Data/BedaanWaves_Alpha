// BedaanWaves — Orchestrator entry point for automated refresh.
// Invoked by scripts/auto-refresh.sh after data ingestion.
// Runs the full V2 scoring pipeline + per-symbol coefficient training
// via seed/orchestrator.ts, which internally invokes scripts/ml/train.py
// when sufficient samples exist.
//
// Usage:
//   npx tsx scripts/run-orchestrator.ts [--force] [--offset N] [--limit N]
import { seedIfNeeded } from "@/lib/scoring/seed/orchestrator";

function parseArgs(): { force: boolean; offset: number; limit: number } {
  const args = process.argv.slice(2);
  let force = false;
  let offset = 0;
  let limit = 0;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--force") force = true;
    else if (args[i] === "--offset") offset = parseInt(args[++i] ?? "0", 10);
    else if (args[i] === "--limit") limit = parseInt(args[++i] ?? "0", 10);
  }
  return { force, offset: Number.isNaN(offset) ? 0 : offset, limit: Number.isNaN(limit) ? 0 : limit };
}

async function main() {
  const { force, offset, limit } = parseArgs();
  const hasLimit = limit > 0;
  console.log(
    `[orchestrator] Starting seed (force=${force}, offset=${offset}, limit=${hasLimit ? limit : "all"})`
  );
  const t0 = Date.now();
  const res = await seedIfNeeded({
    force,
    offset,
    ...(hasLimit ? { limit } : {}),
  });
  console.log(
    `[orchestrator] Done in ${(Date.now() - t0) / 1000}s — ` +
      `symbols=${res.symbols} snapshots=${res.snapshots} coefficients=${res.coefficients} ` +
      `trainingRuns=${res.trainingRuns} realDataPoints=${res.realDataPoints}`
  );
}

main().catch((err) => {
  console.error("[orchestrator] Fatal error:", err);
  process.exit(1);
});