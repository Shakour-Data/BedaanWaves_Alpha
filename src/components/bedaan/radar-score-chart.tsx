"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";
import { DIMENSION_KEYS, DIMENSION_META } from "@/lib/scoring/metric-universe";

interface Props {
  ticker: string;
}

type OverlayKey = "current" | "thirtyAgo" | "nasdaqMedian" | "sectorMedian";

const OVERLAY_META: Record<
  OverlayKey,
  { label: string; color: string; dash?: string }
> = {
  current: { label: "Current", color: "#0f172a" },
  thirtyAgo: { label: "30d ago", color: "#64748b", dash: "4 2" },
  nasdaqMedian: { label: "NASDAQ median", color: "#a3a3a3", dash: "2 2" },
  sectorMedian: { label: "Sector median", color: "#8b5cf6", dash: "2 2" },
};

export function RadarScoreChart({ ticker }: Props) {
  const [overlays, setOverlays] = useState<Set<OverlayKey>>(
    new Set(["current", "thirtyAgo", "nasdaqMedian", "sectorMedian"])
  );

  const { data, isLoading } = useQuery({
    queryKey: ["radar", ticker],
    queryFn: async () => {
      const r = await fetch(`/api/radar/${ticker}`);
      return r.json();
    },
    enabled: !!ticker,
  });

  if (isLoading || !data) {
    return (
      <div className="flex h-72 items-center justify-center text-xs text-muted-foreground">
        Loading radar…
      </div>
    );
  }

  const chartData = DIMENSION_KEYS.map((d) => {
    const row: Record<string, unknown> = { dimension: DIMENSION_META[d].label };
    if (overlays.has("current") && data.current)
      row["current"] = data.current[d];
    if (overlays.has("thirtyAgo") && data.thirtyAgo)
      row["thirtyAgo"] = data.thirtyAgo[d];
    if (overlays.has("nasdaqMedian") && data.nasdaqMedian)
      row["nasdaqMedian"] = data.nasdaqMedian[d];
    if (overlays.has("sectorMedian") && data.sectorMedian)
      row["sectorMedian"] = data.sectorMedian[d];
    return row;
  });

  const toggle = (k: OverlayKey) => {
    setOverlays((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">6-Dimension Radar Profile</h3>
        <div className="flex flex-wrap gap-2 text-[10px]">
          {(Object.keys(OVERLAY_META) as OverlayKey[]).map((k) => (
            <button
              key={k}
              onClick={() => toggle(k)}
              className="flex items-center gap-1"
            >
              <span
                className="inline-block h-2 w-3 rounded-sm"
                style={{
                  background: overlays.has(k) ? OVERLAY_META[k].color : "transparent",
                  border: `1px solid ${OVERLAY_META[k].color}`,
                }}
              />
              <span
                className={
                  overlays.has(k) ? "font-semibold" : "text-muted-foreground"
                }
              >
                {OVERLAY_META[k].label}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={chartData} outerRadius="72%">
            <PolarGrid stroke="#e5e7eb" />
            <PolarAngleAxis
              dataKey="dimension"
              tick={{ fontSize: 10, fill: "#475569" }}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 100]}
              tick={{ fontSize: 9, fill: "#94a3b8" }}
              tickCount={5}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const dim = payload[0].payload.dimension;
                const dimKey = DIMENSION_KEYS.find(
                  (d) => DIMENSION_META[d].label === dim
                );
                const topSubs = dimKey ? data.topSubDims?.[dimKey] ?? [] : [];
                return (
                  <div className="rounded border border-border bg-background/95 p-2 text-[10px] shadow-md backdrop-blur">
                    <div className="font-semibold">{dim}</div>
                    {payload.map((p) => (
                      <div key={p.dataKey as string} className="flex justify-between gap-3">
                        <span style={{ color: p.color }}>{p.dataKey}</span>
                        <span>{(p.value as number).toFixed(1)}</span>
                      </div>
                    ))}
                    {topSubs.length > 0 && (
                      <div className="mt-1 border-t border-border pt-1 text-muted-foreground">
                        <div className="font-semibold">Top sub-dims:</div>
                        {topSubs.map((s: { key: string; score: number }) => (
                          <div key={s.key} className="flex justify-between">
                            <span>{s.key}</span>
                            <span>{s.score.toFixed(1)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {(Object.keys(OVERLAY_META) as OverlayKey[]).filter((k) =>
              overlays.has(k)
            ).map((k) => (
              <Radar
                key={k}
                name={OVERLAY_META[k].label}
                dataKey={k}
                stroke={OVERLAY_META[k].color}
                strokeWidth={1.8}
                strokeDasharray={OVERLAY_META[k].dash}
                fill={OVERLAY_META[k].color}
                fillOpacity={k === "current" ? 0.12 : 0.04}
                isAnimationActive={false}
              />
            ))}
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
