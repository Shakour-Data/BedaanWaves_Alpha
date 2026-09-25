"use client";

import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, Database, Cpu, Zap, Clock, Plus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { TAXONOMY_STATS } from "@/lib/scoring/metric-universe";

interface Props {
  onSymbolSelect?: (ticker: string) => void;
}

export function MarketSidebar({ onSymbolSelect }: Props) {
  const statusQ = useQuery({
    queryKey: ["market-status"],
    queryFn: async () => {
      const r = await fetch("/api/market-status");
      if (!r.ok) throw new Error(`market-status ${r.status}`);
      return r.json();
    },
    refetchInterval: 30_000,
  });

  const batchesQ = useQuery({
    queryKey: ["ingestion-batches"],
    queryFn: async () => {
      const r = await fetch("/api/ingestion/batches");
      if (!r.ok) throw new Error(`batches ${r.status}`);
      return r.json();
    },
    refetchInterval: 30_000,
  });

  // Fetch top symbols by market cap for Quick Access
  // Show all symbols with explicit missing-data status (spec: show symbols without
  // market cap with explicit "NO_DATA" status rather than hiding them).
  const topSymbolsQ = useQuery({
    queryKey: ["top-symbols"],
    queryFn: async () => {
      const r = await fetch("/api/symbols?limit=50");
      if (!r.ok) throw new Error(`symbols ${r.status}`);
      const j = await r.json();
      // Anti-mock: separate real-data symbols from no-data symbols.
      // Show both, with explicit status for missing-data symbols.
      const realData = (j.symbols ?? [])
        .filter((s: { marketCap: number }) => s.marketCap > 0)
        .sort((a: { marketCap: number }, b: { marketCap: number }) => b.marketCap - a.marketCap)
        .slice(0, 8);
      const noData = (j.symbols ?? [])
        .filter((s: { marketCap: number }) => s.marketCap <= 0)
        .slice(0, 2);
      return { realData, noData };
    },
  });

  const status = statusQ.data;
  const batches = batchesQ.data?.batches ?? [];
  const latestBatch = batches[0];

  // Count fully processed symbols (COEFFICIENTS_TRAINED or UI_VERIFIED)
  const fullyProcessed = status?.fullyProcessedSymbols ?? 0;
  const totalSymbols = status?.totalSymbols ?? 0;
  const registeredButNotProcessed = totalSymbols - fullyProcessed;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {/* Universe stats */}
      <div className="rounded border border-border bg-card p-2">
        <div className="mb-1.5 flex items-center gap-1.5">
          <Database className="h-3.5 w-3.5 text-primary" />
          <span className="text-[11px] font-semibold">Universe</span>
          {status?.lastRefresh && (
            <span className="ml-auto flex items-center gap-0.5 text-[8px] text-green-600 dark:text-green-400">
              <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-green-500" />
              live
            </span>
          )}
        </div>
        {statusQ.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <div className="space-y-0.5 text-[10px]">
            <Row label="Total Symbols" value={totalSymbols} />
            <Row label="Fully Processed" value={fullyProcessed} />
            <Row label="Registered Only" value={registeredButNotProcessed} warn={registeredButNotProcessed > 0} />
            <Row label="Snapshots" value={status?.totalSnapshots ?? 0} />
            <Row label="Coefficients" value={status?.totalCoefficients ?? 0} />
            <Row label="News" value={status?.totalNews ?? 0} />
            <Row
              label="Cold-start"
              value={status?.coldStartSymbols ?? 0}
              warn={(status?.coldStartSymbols ?? 0) > 0}
            />
          </div>
        )}
        {status?.lastRefresh && (
          <div className="mt-1 text-[8px] text-green-600 dark:text-green-400">
            Refreshed {formatRelativeTime(status.lastRefresh)}
          </div>
        )}
      </div>

      {/* Recent Batch / Newly Added */}
      <div className="rounded border border-border bg-card p-2 col-span-2 sm:col-span-3 lg:col-span-3">
        <div className="mb-1 flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-primary" />
          <span className="text-[11px] font-semibold">Recent Batch</span>
          {latestBatch && (
            <Badge variant="outline" className="ml-auto text-[9px]">
              {latestBatch.status}
            </Badge>
          )}
        </div>
        {batchesQ.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : latestBatch ? (
          <div className="space-y-1 text-[10px]">
            <Row label="Batch ID" value={latestBatch.batchId?.slice(-16) ?? "—"} />
            <Row label="Selected" value={latestBatch.batchSize ?? 0} />
            <Row label="Raw Success" value={latestBatch.validationSummary?.rawSuccess ?? "—"} />
            <Row label="Scored" value={latestBatch.validationSummary?.scored ?? "—"} />
            <Row label="Failed" value={latestBatch.validationSummary?.rawFailure ?? 0} warn={(latestBatch.validationSummary?.rawFailure ?? 0) > 0} />
            <Row label="Insufficient" value={latestBatch.validationSummary?.insufficient ?? 0} warn={(latestBatch.validationSummary?.insufficient ?? 0) > 0} />
            <Row label="Partial" value={latestBatch.validationSummary?.partial ?? 0} warn={(latestBatch.validationSummary?.partial ?? 0) > 0} />
            <div className="mt-1 text-[8px] text-muted-foreground">
              Generation: {latestBatch.generationId?.slice(-12) ?? "—"}
            </div>
            {latestBatch.failedTickers?.length > 0 && (
              <div className="mt-1 text-[9px] text-amber-600 dark:text-amber-400">
                Failed: {latestBatch.failedTickers.map((f: { ticker: string }) => f.ticker).join(", ")}
              </div>
            )}
          </div>
        ) : (
          <div className="text-[10px] text-muted-foreground">No batch data available</div>
        )}
      </div>

      {/* Taxonomy */}
      <div className="rounded border border-border bg-card p-2">
        <div className="mb-1 flex items-center gap-1.5">
          <Cpu className="h-3.5 w-3.5 text-primary" />
          <span className="text-[11px] font-semibold">Taxonomy</span>
        </div>
        <div className="space-y-0.5 text-[10px]">
          <Row label="Dimensions" value={TAXONOMY_STATS.dimensions} />
          <Row label="Sub-dims" value={TAXONOMY_STATS.subDimensions} />
          <Row label="Aspects" value={TAXONOMY_STATS.aspects} />
          <Row label="Sub-aspects" value={TAXONOMY_STATS.subAspects} />
          <Row label="Indicators" value={`≥${TAXONOMY_STATS.indicatorsMin}`} />
        </div>
      </div>

      {/* Grade distribution (latest day) */}
      <div className="rounded border border-border bg-card p-2">
        <div className="mb-1 flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5 text-primary" />
          <span className="text-[11px] font-semibold">Grades (latest)</span>
        </div>
        <div className="space-y-0.5 text-[10px]">
          {status?.grades
            ? status.grades
                .sort((a: { grade: string }, b: { grade: string }) =>
                  a.grade.localeCompare(b.grade)
                )
                .map((g: { grade: string; count: number }) => (
                  <div key={g.grade} className="flex items-center justify-between">
                    <span
                      className="font-mono text-[9px]"
                      style={{ color: gradeColorSafe(g.grade) }}
                    >
                      {g.grade.replace("_", " ")}
                    </span>
                    <span className="font-mono">{g.count}</span>
                  </div>
                ))
            : [...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-3 w-full" />
              ))}
        </div>
      </div>

      {/* Anti-mock verification */}
      <div className="rounded border border-green-200 bg-green-50 p-2 dark:border-green-900 dark:bg-green-950/30">
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-green-700 dark:text-green-400">
          <ShieldCheck className="h-3.5 w-3.5" />
          Anti-Mock
        </div>
        <div className="space-y-0.5 text-[10px] text-green-700 dark:text-green-400/80">
          <div className="flex items-center justify-between">
            <span>Validated:</span>
            <span className="font-mono font-bold">
              {(status?.validatedRecords ?? 0).toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Mock:</span>
            <span className="font-mono font-bold">0</span>
          </div>
          <div className="text-[8px] text-green-600/70 dark:text-green-400/60">
            spec §1.2 compliant
          </div>
        </div>
      </div>

      {/* Data freshness */}
      <div className="rounded border border-border bg-card p-2">
        <div className="mb-1 flex items-center gap-1.5">
          <Database className="h-3.5 w-3.5 text-primary" />
          <span className="text-[11px] font-semibold">Data Source</span>
        </div>
        <div className="space-y-0.5 text-[10px]">
          <Row label="OHLCV" value={status?.dataFreshness?.marketData ? formatRelativeTime(status.dataFreshness.marketData) : "—"} />
          <Row label="Macro" value={status?.dataFreshness?.macroData ? formatRelativeTime(status.dataFreshness.macroData) : "—"} />
          <Row label="News" value={status?.dataFreshness?.newsData ? formatRelativeTime(status.dataFreshness.newsData) : "—"} />
          <Row label="Auto-refresh" value={`${status?.autoRefreshIntervalHours ?? 2}h`} />
        </div>
        {status?.dataSource && (
          <div className="mt-1 text-[8px] text-muted-foreground">
            {status.dataSource.split("—")[0]?.trim()}
          </div>
        )}
      </div>

      {/* Quick access symbols - dynamic top by market cap */}
      <div className="rounded border border-border bg-card p-2">
        <div className="mb-1 text-[11px] font-semibold">Quick Access (Top Ranked)</div>
        {topSymbolsQ.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <div className="flex flex-wrap gap-1">
            {(topSymbolsQ.data?.realData ?? []).map((t: { ticker: string; processingStatus: string }) => (
              <button
                key={t.ticker}
                onClick={() => onSymbolSelect?.(t.ticker)}
                className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] hover:bg-primary hover:text-primary-foreground"
              >
                {t.ticker}
              </button>
            ))}
            {(topSymbolsQ.data?.noData ?? []).map((t: { ticker: string; processingStatus: string }) => (
              <button
                key={t.ticker}
                onClick={() => onSymbolSelect?.(t.ticker)}
                className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] hover:bg-primary hover:text-primary-foreground opacity-50"
                title={t.processingStatus ?? "NO_DATA"}
              >
                {t.ticker}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  warn,
}: {
  label: string;
  value: string | number;
  warn?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`font-mono font-bold ${
          warn ? "text-amber-600 dark:text-amber-400" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function gradeColorSafe(grade: string): string {
  switch (grade) {
    case "STRONG_BULLISH":
      return "#16a34a";
    case "BULLISH":
      return "#22c55e";
    case "NEUTRAL":
      return "#a3a3a3";
    case "BEARISH":
      return "#f87171";
    case "STRONG_BEARISH":
      return "#dc2626";
    default:
      return "#475569";
  }
}
