# BedaanWaves — Build Worklog (Updated 2026-09-22)

## ML Trainer Integration & Coefficient Pipeline Fix

### Problem
The Python ML trainer (`scripts/ml/train.py`) was dead code. `auto-refresh.sh`
invoked it with `artifacts/training_samples.json` as input, but that file was
never generated. `learner.ts`'s `loadCoefficients()` read from an empty
`artifacts/coefficient_store/` directory. Production never used the ML ensemble
— it fell through to a uniform-weight cold-start every time.

Additionally, `train.py` produced weights keyed as generic `feat_0..feat_49`
instead of actual level keys (`fundamental`, `technical/trend`,
`fundamental/quality/profitability.roe`, etc.), so downstream code couldn't
look them up by name.

### Actions Taken

1. **`scripts/ml/train.py` — fixed weight calculation**
   - Weights are now keyed by the actual level keys (matching `METRIC_UNIVERSE`),
     not generic `feat_N` names.
   - Per-key weight = `|corr(key_score, ensemble OOF prediction)|`, computed from
     RF + GBM + HGB cross-validated predictions — model-informed importance,
     not raw feature importances.
   - Added `_parse_ts()` fallback so `build_features` doesn't crash on missing
     timestamps.

2. **`scripts/ml/train.py` — verified end-to-end**
   - Synthetic test: 2 tickers × 4 levels. Weights valid, non-uniform, divergent
     across tickers. All checks passed.

3. **`src/lib/scoring/seed/orchestrator.ts` — wired up the trainer**
   - Serializes `trainingSamplesByTicker` → `artifacts/training_samples.json`
   - Invokes `scripts/ml/train.py` with all tickers, output to
     `artifacts/coefficient_store/`
   - Loads trained coefficients; falls back to TypeScript `|corr|` learner if
     Python fails
   - Records `trainedBy: "python-ensemble"` or `"typescript-corr"` in meta

4. **`src/lib/scoring/learner.ts` — restored per-symbol learning**
   - Restored the `|corr(score, forward_return)|` learning at all 4 levels that
     commit `756d1dd` had deleted
   - Each level learned independently: L4 sub-aspects, L3 aspects, L2
     sub-dimensions, L1 dimensions
   - Cold start (<50 samples) still uses uniform `1/n` fallback

5. **`src/lib/scoring/engine.ts` — bundle validation**
   - Strips the `level` metadata key before `isValidCoefficients`, so bundles
     with extra fields aren't rejected

6. **`scripts/auto-refresh.sh` — single entry point**
   - Now delegates to `npx tsx scripts/run-orchestrator.ts` for scoring + training
     instead of calling `train.py` directly with a non-existent input file

7. **`scripts/run-orchestrator.ts` — new entry point**
   - Thin wrapper around `seedIfNeeded()` for the refresh pipeline

8. **`prisma/schema.prisma` — drift detection + retrain scheduling**
   - Added `nextRetrainAt`, `retrainCount` to `Symbol`
   - Added `RetrainSchedule` model (trigger: drift | calendar | manual)
   - Added `RetrainRun` model (drift history per ticker/level)
   - Orchestrator now compares current driftPsi against the previous training
     run and schedules a retrain when drift exceeds the threshold or the
     calendar interval elapses

### Verification
- `bun run typecheck` — passes
- `bun run test` — 46/46 pass
- `bun run test:ml` — 8/8 pass
- `python -m unittest` — 14/14 pass (1 skipped)
- End-to-end trainer test: 2 tickers × 4 levels, weights valid, non-uniform,
  divergent across tickers

### Remaining
- Full end-to-end run of the orchestrator against real data has not been
  executed yet. `artifacts/training_samples.json` and
  `artifacts/coefficient_store/` are still empty. Requires running the seed
  (e.g. `POST /api/seed?force=true`) to confirm the integration works.