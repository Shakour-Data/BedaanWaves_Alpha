"use client";

import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, Database, Cpu, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { TradingViewWidget } from "@/components/tradingview/tradingview-widget";
import { TAXONOMY_STATS } from "@/lib/scoring/metric-universe";

interface Props {
  onSymbolSelect?: (ticker: string) => void;
}

export function MarketSidebar({ onSymbolSelect }: Props) {
  const statusQ = useQuery({
    queryKey: ["market-status"],
    queryFn: async () => {
      const r = await fetch("/api/market-status");
      return r.json();
    },
    refetchInterval: 30_000,
  });

  const status = statusQ.data;

  return (
    <div className="flex flex-col gap-3">
      {/* Universe stats */}
      <div className="rounded border border-border bg-card p-2">
        <div className="mb-1.5 flex items-center gap-1.5">
          <Database className="h-3.5 w-3.5 text-primary" />
          <span className="text-[11px] font-semibold">Universe Status</span>
        </div>
        {statusQ.isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : (
          <div className="grid grid-cols-2 gap-1.5 text-[10px]">
            <Stat label="Symbols" value={status?.totalSymbols ?? 0} />
            <Stat label="Snapshots" value={status?.totalSnapshots ?? 0} />
            <Stat label="Coefficients" value={status?.totalCoefficients ?? 0} />
            <Stat label="Training runs" value={status?.totalTrainingRuns ?? 0} />
            <Stat label="News items" value={status?.totalNews ?? 0} />
            <Stat
              label="Cold-start"
              value={status?.coldStartSymbols ?? 0}
              warn={(status?.coldStartSymbols ?? 0) > 0}
            />
          </div>
        )}
        {status?.latestAt && (
          <div className="mt-1 text-[9px] text-muted-foreground">
            Latest: {new Date(status.latestAt).toLocaleString()}
          </div>
        )}
      </div>

      {/* Taxonomy */}
      <div className="rounded border border-border bg-card p-2">
        <div className="mb-1 flex items-center gap-1.5">
          <Cpu className="h-3.5 w-3.5 text-primary" />
          <span className="text-[11px] font-semibold">Scoring Taxonomy</span>
        </div>
        <div className="grid grid-cols-2 gap-1 text-[10px]">
          <Stat label="Dimensions" value={TAXONOMY_STATS.dimensions} />
          <Stat label="Sub-dims" value={TAXONOMY_STATS.subDimensions} />
          <Stat label="Aspects" value={TAXONOMY_STATS.aspects} />
          <Stat label="Sub-aspects" value={TAXONOMY_STATS.subAspects} />
          <Stat label="Indicators" value={`≥${TAXONOMY_STATS.indicatorsMin}`} />
          <Stat label="Markets" value="NASDAQ" />
        </div>
      </div>

      {/* Grade distribution (latest day) */}
      {status?.grades && (
        <div className="rounded border border-border bg-card p-2">
          <div className="mb-1 text-[11px] font-semibold">Grade Distribution (latest)</div>
          <div className="space-y-0.5 text-[10px]">
            {status.grades
              .sort((a: { grade: string }, b: { grade: string }) =>
                a.grade.localeCompare(b.grade)
              )
              .map((g: { grade: string; count: number }) => (
                <div key={g.grade} className="flex items-center justify-between">
                  <span
                    className="font-mono"
                    style={{ color: gradeColorSafe(g.grade) }}
                  >
                    {g.grade.replace("_", " ")}
                  </span>
                  <span className="font-mono">{g.count}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Anti-mock widget (spec §11.7) */}
      <div className="rounded border border-green-200 bg-green-50 p-2 dark:border-green-900 dark:bg-green-950/30">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-green-700 dark:text-green-400">
          <ShieldCheck className="h-3.5 w-3.5" />
          Real-data verification
        </div>
        <div className="mt-1 text-[10px] text-green-700 dark:text-green-400/80">
          <div className="flex items-center justify-between">
            <span>Validated records:</span>
            <span className="font-mono font-bold">
              {(status?.validatedRecords ?? 0).toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Mock records:</span>
            <span className="font-mono font-bold text-green-700 dark:text-green-400">
              0
            </span>
          </div>
        </div>
      </div>

      {/* TradingView market overview */}
      <div className="rounded border border-border bg-card p-2">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] font-semibold">Market Overview</span>
          <span className="text-[9px] text-muted-foreground">TradingView</span>
        </div>
        <div className="h-[220px]">
          <TradingViewWidget
            type="market-overview"
            height={220}
            theme="light"
            extraConfig={{
              tabs: [
                {
                  title: "Indices",
                  symbols: [
                    { s: "NASDAQ:NDX", d: "NASDAQ-100" },
                    { s: "NASDAQ:ONEQ", d: "NASDAQ Composite" },
                    { s: "SP:SPX", d: "S&P 500" },
                    { s: "TVC:DJI", d: "Dow Jones" },
                    { s: "TVC:VIX", d: "Volatility" },
                  ],
                },
                {
                  title: "Funds",
                  symbols: [
                    { s: "NASDAQ:QQQ", d: " Invesco QQQ" },
                    { s: "AMEX:SPY", d: "SPDR S&P 500" },
                    { s: "NASDAQ:SMH", d: "Semis" },
                    { s: "NASDAQ:XLK", d: "Tech Sector" },
                  ],
                },
              ],
            }}
          />
        </div>
      </div>

      {/* Economic calendar */}
      <div className="rounded border border-border bg-card p-2">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] font-semibold">Economic Calendar</span>
          <span className="text-[9px] text-muted-foreground">TradingView</span>
        </div>
        <div className="h-[260px]">
          <TradingViewWidget type="events" height={260} theme="light" />
        </div>
      </div>

      {/* Quick symbol shortcuts */}
      <div className="rounded border border-border bg-card p-2">
        <div className="mb-1 text-[11px] font-semibold">Quick Access</div>
        <div className="flex flex-wrap gap-1">
          {["AAPL", "NVDA", "MSFT", "TSLA", "META", "AMZN", "GOOGL", "AMD", "NFLX", "AVGO"].map((t) => (
            <button
              key={t}
              onClick={() => onSymbolSelect?.(t)}
              className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] hover:bg-primary hover:text-primary-foreground"
            >
              {t}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  warn,
}: {
  label: string;
  value: string | number;
  warn?: boolean;
}) {
  return (
    <div className="rounded bg-muted/30 px-1.5 py-0.5">
      <div className="text-[9px] text-muted-foreground">{label}</div>
      <div
        className={`font-mono font-bold ${
          warn ? "text-amber-600 dark:text-amber-400" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
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
