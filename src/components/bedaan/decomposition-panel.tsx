"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DIMENSION_KEYS, DIMENSION_META } from "@/lib/scoring/metric-universe";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  ticker: string;
}

type Level = "dimensions" | "sub_dimensions" | "aspects" | "sub_aspects";

export function DecompositionPanel({ ticker }: Props) {
  const [level, setLevel] = useState<Level>("dimensions");
  const [activeDim, setActiveDim] = useState<string>("fundamental");

  const { data, isLoading } = useQuery({
    queryKey: ["decomposition", ticker],
    queryFn: async () => {
      const r = await fetch(`/api/decomposition/${ticker}`);
      if (!r.ok) throw new Error(`decomposition ${r.status}`);
      return r.json();
    },
    enabled: !!ticker,
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Build the chart rows for the selected level + dimension filter
  let rows: Array<{ key: string; score: number; weight: number; contribution: number; color: string }> = [];
  if (level === "dimensions") {
    const w = data.dimensionWeights ?? {};
    const totalW = DIMENSION_KEYS.reduce((a, d) => a + (w[d] ?? 1 / 6), 0) || 1;
    rows = DIMENSION_KEYS.map((d) => {
      const score = data.dimensionScores[d] ?? 50;
      const weight = (w[d] ?? 1 / 6) / totalW;
      return {
        key: DIMENSION_META[d].label,
        score,
        weight,
        contribution: score * weight,
        color: DIMENSION_META[d].color,
      };
    });
  } else if (level === "sub_dimensions") {
    const w = data.subDimensionWeights ?? {};
    const keys = Object.keys(data.subDimensionScores).filter((k) =>
      k.startsWith(activeDim + "/")
    );
    const totalW = keys.reduce((a, k) => a + (w[k] ?? 0), 0) || keys.length;
    rows = keys
      .map((k) => {
        const score = data.subDimensionScores[k] ?? 50;
        const weight = (w[k] ?? 1 / keys.length) / totalW;
        return {
          key: k.split("/")[1],
          score,
          weight,
          contribution: score * weight,
          color: DIMENSION_META[activeDim as keyof typeof DIMENSION_META]?.color ?? "#3b82f6",
        };
      })
      .sort((a, b) => b.contribution - a.contribution);
  } else if (level === "aspects") {
    const keys = Object.keys(data.aspectScores).filter((k) =>
      k.startsWith(activeDim + "/")
    );
    rows = keys
      .map((k) => {
        const score = data.aspectScores[k] ?? 50;
        return {
          key: k.split("/")[2] ?? k,
          score,
          weight: 1 / keys.length,
          contribution: score / keys.length,
          color: DIMENSION_META[activeDim as keyof typeof DIMENSION_META]?.color ?? "#3b82f6",
        };
      })
      .sort((a, b) => b.contribution - a.contribution);
  } else {
    // sub_aspects
    const keys = Object.keys(data.subAspectScores).filter((k) => {
      const parent = data.subDimensionScores ? true : false;
      void parent;
      return k.length > 0;
    });
    // Filter by parent dimension via a lookup of sub-aspect → dim.
    // For simplicity, we keep ALL sub-aspects but show top 30 by |score - 50|.
    rows = keys
      .map((k) => {
        const score = data.subAspectScores[k] ?? 50;
        return {
          key: k,
          score,
          weight: 1,
          contribution: score,
          color: score >= 70 ? "#22c55e" : score >= 55 ? "#84cc16" : score >= 45 ? "#a3a3a3" : score >= 30 ? "#f87171" : "#dc2626",
        };
      })
      .sort((a, b) => Math.abs(b.score - 50) - Math.abs(a.score - 50))
      .slice(0, 30);
  }

  const sumContribution = rows.reduce((a, r) => a + r.contribution, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Score Decomposition Waterfall</h3>
        <div className="text-[10px] text-muted-foreground">
          Σ contribution = <span className="font-mono font-semibold">{sumContribution.toFixed(2)}</span> · overall ={" "}
          <span className="font-mono font-semibold">{data.overall.toFixed(2)}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["dimensions", "sub_dimensions", "aspects", "sub_aspects"] as Level[]).map((l) => (
          <button
            key={l}
            onClick={() => setLevel(l)}
            className={`rounded px-2 py-1 text-[10px] ${
              level === l
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {l === "dimensions" ? "L1 Dimensions" : l === "sub_dimensions" ? "L2 Sub-Dims" : l === "aspects" ? "L3 Aspects" : "L4 Sub-Aspects"}
          </button>
        ))}
      </div>

      {(level === "sub_dimensions" || level === "aspects") && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] text-muted-foreground">dim:</span>
          {DIMENSION_KEYS.map((d) => (
            <button
              key={d}
              onClick={() => setActiveDim(d)}
              className="rounded px-1.5 py-0.5 text-[10px]"
              style={{
                background: activeDim === d ? DIMENSION_META[d].color : undefined,
                color: activeDim === d ? "white" : undefined,
              }}
            >
              <span className={activeDim === d ? "" : "text-muted-foreground"}>
                {DIMENSION_META[d].label}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.4} horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 9 }} stroke="#94a3b8" />
            <YAxis
              type="category"
              dataKey="key"
              tick={{ fontSize: 9 }}
              stroke="#94a3b8"
              width={100}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as { key: string; score: number; weight: number; contribution: number };
                return (
                  <div className="rounded border border-border bg-background/95 p-2 text-[10px] shadow-md">
                    <div className="font-semibold">{p.key}</div>
                    <div>Score: <span className="font-mono">{p.score.toFixed(2)}</span></div>
                    {level !== "sub_aspects" && (
                      <>
                        <div>Weight: <span className="font-mono">{(p.weight * 100).toFixed(2)}%</span></div>
                        <div>Contribution: <span className="font-mono">{p.contribution.toFixed(3)}</span></div>
                      </>
                    )}
                  </div>
                );
              }}
            />
            <Bar dataKey="contribution" radius={[0, 3, 3, 0]} isAnimationActive={false}>
              {rows.map((r, i) => (
                <Cell key={i} fill={r.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
