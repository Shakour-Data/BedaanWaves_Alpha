"use client";

import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Minus, Globe } from "lucide-react";

interface MacroSubAspectItem {
  key: string;
  category: string;
  score: number;
}

interface MacroDetailData {
  macroScore: number;
  thirtyAgoMacro: number;
  sectorMedianMacro: number;
  nasdaqMedianMacro: number;
  subAspectBreakdown: Record<string, MacroSubAspectItem[]>;
  latestAt: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  gdp: "GDP",
  inflation: "Inflation",
  interest_rates: "Interest Rates",
  volatility: "Volatility",
  exchange_rates: "Exchange Rates",
  commodity_prices: "Commodity Prices",
  employment: "Employment",
};

function scoreColor(score: number): string {
  if (score >= 70) return "#22c55e";
  if (score >= 55) return "#84cc16";
  if (score >= 45) return "#a3a3a3";
  if (score >= 30) return "#f87171";
  return "#dc2626";
}

function scoreLabel(score: number): string {
  if (score >= 70) return "Elevated";
  if (score >= 55) return "Above avg";
  if (score >= 45) return "Neutral";
  if (score >= 30) return "Below avg";
  return "Depressed";
}

export function MacroDetailPanel({ ticker }: { ticker: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["macro-detail", ticker],
    queryFn: async (): Promise<MacroDetailData | null> => {
      const r = await fetch(`/api/macro/${ticker}`);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`macro ${r.status}`);
      return r.json();
    },
    enabled: !!ticker,
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const macroScore = data.macroScore;
  const delta = macroScore - data.thirtyAgoMacro;
  const vsSector = macroScore - data.sectorMedianMacro;
  const vsNasdaq = macroScore - data.nasdaqMedianMacro;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <Globe className="h-4 w-4 text-primary" />
          Macro Environment
        </h3>
        <span className="text-[10px] text-muted-foreground">
          {new Date(data.latestAt).toLocaleDateString()}
        </span>
      </div>

      {/* Score header */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded border border-border bg-card p-2 text-center">
          <div className="text-[9px] text-muted-foreground">Macro Score</div>
          <div
            className="font-mono text-xl font-bold"
            style={{ color: scoreColor(macroScore) }}
          >
            {macroScore.toFixed(1)}
          </div>
          <div className="text-[9px]" style={{ color: scoreColor(macroScore) }}>
            {scoreLabel(macroScore)}
          </div>
        </div>
        <div className="rounded border border-border bg-card p-2 text-center">
          <div className="text-[9px] text-muted-foreground">30d Ago</div>
          <div className="font-mono text-sm">{data.thirtyAgoMacro.toFixed(1)}</div>
          <div
            className="text-[9px]"
            style={{ color: delta >= 0 ? "#22c55e" : "#ef4444" }}
          >
            {delta >= 0 ? "+" : ""}{delta.toFixed(1)}
          </div>
        </div>
        <div className="rounded border border-border bg-card p-2 text-center">
          <div className="text-[9px] text-muted-foreground">vs Sector</div>
          <div className="font-mono text-sm">{data.sectorMedianMacro.toFixed(1)}</div>
          <div
            className="text-[9px]"
            style={{ color: vsSector >= 0 ? "#22c55e" : "#ef4444" }}
          >
            {vsSector >= 0 ? "+" : ""}{vsSector.toFixed(1)}
          </div>
        </div>
        <div className="rounded border border-border bg-card p-2 text-center">
          <div className="text-[9px] text-muted-foreground">vs NASDAQ</div>
          <div className="font-mono text-sm">{data.nasdaqMedianMacro.toFixed(1)}</div>
          <div
            className="text-[9px]"
            style={{ color: vsNasdaq >= 0 ? "#22c55e" : "#ef4444" }}
          >
            {vsNasdaq >= 0 ? "+" : ""}{vsNasdaq.toFixed(1)}
          </div>
        </div>
      </div>

      {/* Sub-aspect breakdown by category */}
      <div className="space-y-2">
        {Object.entries(data.subAspectBreakdown).map(([category, items]) => (
          <div key={category} className="rounded border border-border bg-card/50 p-2">
            <div className="mb-1.5 flex items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {CATEGORY_LABELS[category] ?? category}
              </span>
              <span className="text-[9px] text-muted-foreground">
                ({items.length} indicator{items.length !== 1 ? "s" : ""})
              </span>
            </div>
            <div className="space-y-1">
              {items.map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between gap-2 rounded px-1.5 py-1 text-[10px]"
                  style={{
                    background: scoreColor(item.score) + "12",
                    borderLeft: `2px solid ${scoreColor(item.score)}`,
                  }}
                >
                  <span className="font-mono text-muted-foreground">
                    {item.key.replace(/_/g, " ")}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {item.score >= 55 ? (
                      <TrendingUp className="h-3 w-3" style={{ color: scoreColor(item.score) }} />
                    ) : item.score <= 45 ? (
                      <TrendingDown className="h-3 w-3" style={{ color: scoreColor(item.score) }} />
                    ) : (
                      <Minus className="h-3 w-3 text-muted-foreground" />
                    )}
                    <span
                      className="font-mono font-semibold"
                      style={{ color: scoreColor(item.score) }}
                    >
                      {item.score.toFixed(1)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}