"use client";

import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { DIMENSION_KEYS, DIMENSION_META } from "@/lib/scoring/metric-universe";
import { gradeColor } from "@/lib/scoring/transforms";

interface Props {
  ticker: string;
}

export function PeerComparison({ ticker }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["peers", ticker],
    queryFn: async () => {
      const r = await fetch(`/api/peers/${ticker}`);
      return r.json();
    },
    enabled: !!ticker,
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const rows = data.peers;
  // selected symbol is the first row (if it's in the peer set), else prepended
  const selected = data.symbol.ticker;
  const selectedRow = rows.find((r: { ticker: string }) => r.ticker === selected);
  const others = rows.filter((r: { ticker: string }) => r.ticker !== selected);
  const ordered = selectedRow ? [selectedRow, ...others] : rows;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          Peer Comparison — {data.symbol.sector}
        </h3>
        <span className="text-[10px] text-muted-foreground">
          5 nearest peers by market cap · percentile rank within group
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="px-1.5 py-1 text-left">Ticker</th>
              <th className="px-1.5 py-1 text-right">Overall</th>
              <th className="px-1.5 py-1 text-right">Grade</th>
              <th className="px-1.5 py-1 text-right">Price</th>
              <th className="px-1.5 py-1 text-right">Δ%</th>
              {DIMENSION_KEYS.map((d) => (
                <th key={d} className="px-1.5 py-1 text-right" style={{ color: DIMENSION_META[d].color }}>
                  {DIMENSION_META[d].label.slice(0, 4)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordered.map((r: {
              ticker: string;
              name: string;
              overall: number;
              grade: string;
              price: number;
              priceChange: number;
              dimensions: Record<string, number>;
            }) => (
              <tr
                key={r.ticker}
                className={`border-b border-border/50 ${r.ticker === selected ? "bg-primary/5" : ""}`}
              >
                <td className="px-1.5 py-1 font-semibold">
                  {r.ticker}
                  {r.ticker === selected && (
                    <span className="ml-1 text-[9px] text-primary">★</span>
                  )}
                  <div className="text-[9px] font-normal text-muted-foreground">
                    {r.name.slice(0, 22)}
                  </div>
                </td>
                <td className="px-1.5 py-1 text-right font-mono font-semibold">
                  {r.overall.toFixed(1)}
                </td>
                <td className="px-1.5 py-1 text-right" style={{ color: gradeColor(r.grade as never) }}>
                  {r.grade.replace("_", " ").slice(0, 8)}
                </td>
                <td className="px-1.5 py-1 text-right font-mono">
                  ${r.price.toFixed(2)}
                </td>
                <td
                  className="px-1.5 py-1 text-right font-mono"
                  style={{ color: r.priceChange >= 0 ? "#22c55e" : "#ef4444" }}
                >
                  {r.priceChange >= 0 ? "+" : ""}{r.priceChange.toFixed(2)}%
                </td>
                {DIMENSION_KEYS.map((d) => {
                  const v = r.dimensions[d] ?? 50;
                  const pct = data.percentileRanks[r.ticker]?.[d] ?? 50;
                  return (
                    <td
                      key={d}
                      className="px-1.5 py-1 text-right font-mono"
                      style={{
                        color: v >= 60 ? "#22c55e" : v <= 40 ? "#ef4444" : "#475569",
                      }}
                      title={`${DIMENSION_META[d].label} · ${v.toFixed(1)} · ${pct}th pct`}
                    >
                      {v.toFixed(0)}
                      <span className="ml-0.5 text-[8px] text-muted-foreground">
                        {pct}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-[9px] text-muted-foreground">
        Numbers: dimension score (0–100) with peer-group percentile rank subscript. Selected symbol highlighted.
      </div>
    </div>
  );
}
