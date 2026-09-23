// BedaanWaves — Orchestrator entry point for automated refresh.
// Invoked by scripts/auto-refresh.sh after data ingestion.
// Runs the full V2 scoring pipeline + per-symbol coefficient training
// via seed/orchestrator.ts, which internally invokes scripts/ml/train.py
// when sufficient samples exist.
//
// Usage:
//   npx tsx scripts/run-orchestrator.ts [--force] [--incremental] [--offset N] [--limit N]
import { seedIfNeeded } from "@/lib/scoring/seed/orchestrator";
import { writeFileSync, existsSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";

const STATE_DIR = join(process.cwd(), ".kilo", "state");
const LOCK_FILE = join(STATE_DIR, "orchestrator.lock");

function acquireLock(): boolean {
  if (existsSync(LOCK_FILE)) {
    console.error("[orchestrator] Another orchestrator run is in progress (lock file exists). Exiting.");
    return false;
  }
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(LOCK_FILE, new Date().toISOString());
    return true;
  } catch {
    return false;
  }
}

function releaseLock(): void {
  try {
    if (existsSync(LOCK_FILE)) unlinkSync(LOCK_FILE);
  } catch {
    // ignore
  }
}

function parseArgs(): { force: boolean; incremental: boolean; offset: number; limit: number } {
  const args = process.argv.slice(2);
  let force = false;
  let incremental = false;
  let offset = 0;
  let limit = 0;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--force") force = true;
    else if (args[i] === "--incremental") incremental = true;
    else if (args[i] === "--offset") offset = parseInt(args[++i] ?? "0", 10);
    else if (args[i] === "--limit") limit = parseInt(args[++i] ?? "0", 10);
  }
  return { force, incremental, offset: Number.isNaN(offset) ? 0 : offset, limit: Number.isNaN(limit) ? 0 : limit };
}

async function main() {
  if (!acquireLock()) {
    process.exit(1);
  }

  const { force, incremental, offset, limit } = parseArgs();
  const hasLimit = limit > 0;
  console.log(
    `[orchestrator] Starting seed (force=${force}, incremental=${incremental}, offset=${offset}, limit=${hasLimit ? limit : "all"})`
  );
  const t0 = Date.now();
  try {
    const res = await seedIfNeeded({
      force,
      incremental,
      offset,
      ...(hasLimit ? { limit } : {}),
    });
    console.log(
      `[orchestrator] Done in ${(Date.now() - t0) / 1000}s — ` +
        `symbols=${res.symbols} snapshots=${res.snapshots} coefficients=${res.coefficients} ` +
        `trainingRuns=${res.trainingRuns} realDataPoints=${res.realDataPoints}`
    );
  } finally {
    releaseLock();
  }
}

main().catch((err) => {
  console.error("[orchestrator] Fatal error:", err);
  process.exit(1);
});