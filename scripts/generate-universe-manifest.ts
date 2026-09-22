import fs from "fs";
import path from "path";
import { SEED_TICKERS_DEDUP } from "@/lib/scoring/seed/universe";
import { createHash } from "crypto";

interface TickerEntry {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  marketCap: number;
  isEtf: boolean;
  beta: number;
}

interface UniverseManifest {
  version: string;
  generatedAt: string;
  source: string;
  sourceRevision: string;
  count: number;
  tickers: TickerEntry[];
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

function isValidNasdaqTicker(ticker: string): boolean {
  // Valid NASDAQ tickers: 1-5 uppercase letters, optionally with digits
  // No OTC markers or special symbols (except . for units/warrants)
  return /^[A-Z][A-Z0-9.]*(?<!\.)$/.test(ticker) || /^[A-Z][A-Z0-9]+\.[A-Z]$/.test(ticker);
}

function isTestIssue(ticker: string, name: string): boolean {
  const testPatterns = [
    /test issue/i,  // Explicit "test issue" designation
    /\bTEST\b.*\(i\)\s*\(/i,  // Common format for test issues
    /testing\b/i,  // Generic testing
    /\bTEMP\b/i,
    /\bDEAD\b/i,
  ];
  return testPatterns.some((p) => p.test(name));
}

function generateManifest(): UniverseManifest {
  const byTicker: Record<string, string> = {};
  const testIssueExamples: string[] = [];

  for (const t of SEED_TICKERS_DEDUP) {
    if (isTestIssue(t.ticker, t.name)) {
      testIssueExamples.push(t.ticker);
    }
  }

  const tickers: TickerEntry[] = SEED_TICKERS_DEDUP.map((t) => ({
    ticker: t.ticker,
    name: t.name,
    sector: t.sector,
    industry: t.industry,
    marketCap: t.marketCap,
    isEtf: t.isEtf,
    beta: t.beta,
  }));

  for (const t of tickers) {
    byTicker[t.ticker] = createHash("sha256").update(JSON.stringify(t)).digest("hex").slice(0, 16);
  }

  const uniqueTickers = new Set(tickers.map((t) => t.ticker)).size === tickers.length;
  const validFormat = tickers.every((t) => isValidNasdaqTicker(t.ticker));
  const noTestIssues = testIssueExamples.length === 0;
  const etfFlagConsistent = tickers.every((t) => {
    if (t.isEtf) return t.sector === "ETF" && t.industry.includes("ETF");
    return true;
  });

  const tickersHash = createHash("sha256")
    .update(JSON.stringify(tickers))
    .digest("hex");

  return {
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    source: "SEED_TICKERS_DEDUP (src/lib/scoring/seed/universe.ts)",
    sourceRevision: "seed-universe-v1",
    count: tickers.length,
    tickers,
    checksums: {
      tickers: tickersHash,
      byTicker,
    },
    validation: {
      uniqueTickers,
      validFormat,
      noTestIssues,
      etfFlagConsistent,
      testIssueExamples,
    },
  };
}

const manifest = generateManifest();
const outPath = path.join(process.cwd(), "src/lib/scoring/seed/universe-manifest.json");
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));
console.log(`Generated universe-manifest.json with ${manifest.count} tickers`);
console.log("Validation results:", manifest.validation);
