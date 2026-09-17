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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  ticker: string;
  compareTicker?: string;
}

type Level = "dimensions" | "sub_dimensions" | "aspects" | "sub_aspects";

const LEVEL_LABELS: Record<Level, string> = {
  dimensions: "L1 — Dimensions (6)",
  sub_dimensions: "L2 — Sub-Dimensions (44)",
  aspects: "L3 — Aspects (135)",
  sub_aspects: "L4 — Sub-Aspects (173)",
};

export function CoefficientsPanel({ ticker, compareTicker }: Props) {
  const [level, setLevel] = useState<Level>("dimensions");
  const [activeDim, setActiveDim] = useState<string>("fundamental");

  const { data, isLoading } = useQuery({
    queryKey: ["coefficients", ticker],
    queryFn: async () => {
      const r = await fetch(`/api/coefficients/${ticker}`);
      return r.json();
    },
    enabled: !!ticker,
  });

  const compareQ = useQuery({
    queryKey: ["coefficients", compareTicker],
    queryFn: async () => {
      if (!compareTicker) return null;
      const r = await fetch(`/api/coefficients/${compareTicker}`);
      return r.json();
    },
    enabled: !!compareTicker,
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const bundle = data[level];
  const weights = bundle?.weights ?? {};
  const compareBundle = compareQ.data?.[level];
  const compareWeights = compareBundle?.weights ?? {};

  // For sub_levels, group/filter by dimension
  let entries = Object.entries(weights);
  if (level !== "dimensions") {
    entries = entries.filter(([k]) => k.startsWith(activeDim + "/") || k.startsWith(activeDim + "_"));
    if (entries.length === 0) {
      // fallback: keys starting with the dimension
      entries = Object.entries(weights).filter(([k]) =>
        k.startsWith(activeDim)
      );
    }
  }
  entries.sort((a, b) => (b[1] as number) - (a[1] as number));
  const chartData = entries.map(([k, v]) => ({
    key: level === "dimensions" ? DIMENSION_META[k as keyof typeof DIMENSION_META]?.label ?? k : k.split("/").pop() ?? k,
    weight: v as number,
    color: level === "dimensions" ? DIMENSION_META[k as keyof typeof DIMENSION_META]?.color ?? "#3b82f6" : DIMENSION_META[activeDim as keyof typeof DIMENSION_META]?.color ?? "#3b82f6",
    compare: (compareWeights[k] as number) ?? 0,
    rawKey: k,
  }));

  const coldStart = bundle?.meta?.coldStart === true;
  const drift = bundle?.driftStatus;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Per-Symbol Dynamic Coefficients</h3>
        <div className="flex items-center gap-2">
          {coldStart && (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              uniform fallback (training in progress)
            </Badge>
          )}
          {drift === "DRIFT" && (
            <Badge variant="destructive" className="text-[10px]">
              drift detected
            </Badge>
          )}
          <span className="text-[10px] text-muted-foreground">
            trained {bundle ? new Date(bundle.trainedAt).toLocaleDateString() : "—"} · {bundle?.sampleCount ?? 0} samples
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(LEVEL_LABELS) as Level[]).map((l) => (
          <button
            key={l}
            onClick={() => setLevel(l)}
            className={`rounded px-2 py-1 text-[10px] ${
              level === l
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {LEVEL_LABELS[l]}
          </button>
        ))}
      </div>

      {level !== "dimensions" && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] text-muted-foreground">dim:</span>
          {DIMENSION_KEYS.map((d) => (
            <button
              key={d}
              onClick={() => setActiveDim(d)}
              className={`rounded px-1.5 py-0.5 text-[10px] ${
                activeDim === d
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
              style={activeDim === d ? { background: DIMENSION_META[d].color } : {}}
            >
              {DIMENSION_META[d].label}
            </button>
          ))}
        </div>
      )}

      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
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
              width={90}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as { rawKey: string; weight: number; compare?: number };
                return (
                  <div className="rounded border border-border bg-background/95 p-2 text-[10px] shadow-md">
                    <div className="font-semibold">{p.rawKey}</div>
                    <div>
                      {ticker}: <span className="font-mono">{(p.weight * 100).toFixed(2)}%</span>
                    </div>
                    {compareTicker && compareWeights[p.rawKey] !== undefined && (
                      <div>
                        {compareTicker}:{" "}
                        <span className="font-mono">
                          {((compareWeights[p.rawKey] as number) * 100).toFixed(2)}%
                        </span>{" "}
                        <span className="text-muted-foreground">
                          (Δ {(((p.weight - (compareWeights[p.rawKey] as number)) * 100)).toFixed(2)}pp)
                        </span>
                      </div>
                    )}
                  </div>
                );
              }}
            />
            <Bar dataKey="weight" radius={[0, 3, 3, 0]} isAnimationActive={false}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Bar>
            {compareTicker && (
              <Bar
                dataKey="compare"
                radius={[0, 3, 3, 0]}
                fill="#94a3b8"
                fillOpacity={0.4}
                isAnimationActive={false}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[10px] sm:grid-cols-4">
        <Stat label="OOS R²" value={bundle?.oosR2?.toFixed(3) ?? "—"} />
        <Stat label="OOS IC" value={bundle?.oosIc?.toFixed(3) ?? "—"} />
        <Stat label="Regime" value={bundle?.meta?.regime ?? "—"} />
        <Stat label="Data hash" value={bundle?.dataHash?.slice(0, 8) ?? "—"} mono />
      </div>

      {bundle?.shapTopKeys && bundle.shapTopKeys.length > 0 && (
        <div className="rounded border border-border bg-muted/30 p-2 text-[10px]">
          <div className="font-semibold text-muted-foreground">
            Top SHAP features (sub-aspects)
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {bundle.shapTopKeys.map((k: string) => (
              <span key={k} className="rounded bg-background px-1.5 py-0.5 font-mono">
                {k}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded border border-border bg-muted/30 px-2 py-1">
      <div className="text-muted-foreground">{label}</div>
      <div className={`font-semibold ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}
