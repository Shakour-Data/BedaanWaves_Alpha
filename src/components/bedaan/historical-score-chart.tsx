"use client";

import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import { DIMENSION_KEYS, DIMENSION_META } from "@/lib/scoring/metric-universe";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Activity } from "lucide-react";

const RANGES = ["1W", "1M", "3M", "6M", "1Y", "MAX"] as const;
type Range = (typeof RANGES)[number];

interface HistoryPoint {
  capturedAt: string;
  overall: number;
  dimensions: Record<string, number>;
  price: number;
  priceChange: number;
  volume: number;
  coverage: number;
  ciLower: number;
  ciUpper: number;
  grade: string;
  coefficientVersion: string;
}

interface Props {
  ticker: string;
}

export function HistoricalScoreChart({ ticker }: Props) {
  const [range, setRange] = useState<Range>("3M");
  const [activeDims, setActiveDims] = useState<Set<string>>(
    new Set(DIMENSION_KEYS)
  );
  const [showOverall, setShowOverall] = useState(true);
  const [showCI, setShowCI] = useState(true);
  const [hoverPoint, setHoverPoint] = useState<HistoryPoint | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["history", ticker, range],
    queryFn: async (): Promise<HistoryPoint[]> => {
      const r = await fetch(`/api/scores/${ticker}/history?range=${range}`);
      if (r.status === 404) return [];
      if (!r.ok) throw new Error(`history ${r.status}`);
      const j = await r.json().catch(() => null);
      if (!j || !Array.isArray(j.points)) return [];
      return j.points as HistoryPoint[];
    },
    enabled: !!ticker,
  });

  const chartData = (data ?? []).map((p) => {
    const d = new Date(p.capturedAt);
    const label = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
    return {
      label,
      ...p,
      ciLower: p.ciLower,
      ciUpper: p.ciUpper,
    };
  });

  const toggleDim = (d: string) => {
    setActiveDims((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">
            Historical Score Trend
          </h3>
          <span className="text-xs text-muted-foreground">
            ({chartData.length} validated records · point-in-time correct)
          </span>
        </div>
        <div className="flex items-center gap-1">
          {RANGES.map((r) => (
            <Button
              key={r}
              size="sm"
              variant={r === range ? "default" : "outline"}
              className="h-6 px-2 text-[10px]"
              onClick={() => setRange(r)}
            >
              {r}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[10px]">
        <button
          onClick={() => setShowOverall((s) => !s)}
          className="flex items-center gap-1"
        >
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: "#0f172a", opacity: showOverall ? 1 : 0.3 }}
          />
          <span className={showOverall ? "font-semibold" : "text-muted-foreground"}>
            Overall
          </span>
        </button>
        {DIMENSION_KEYS.map((d) => {
          const meta = DIMENSION_META[d];
          const active = activeDims.has(d);
          return (
            <button
              key={d}
              onClick={() => toggleDim(d)}
              className="flex items-center gap-1"
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: meta.color, opacity: active ? 1 : 0.3 }}
              />
              <span
                className={
                  active ? "font-semibold" : "text-muted-foreground line-through"
                }
              >
                {meta.label}
              </span>
            </button>
          );
        })}
        <button
          onClick={() => setShowCI((s) => !s)}
          className="flex items-center gap-1"
        >
          <span className="inline-block h-2 w-2 rounded-full border border-dashed border-slate-500" />
          <span className={showCI ? "font-semibold" : "text-muted-foreground"}>
            90% CI
          </span>
        </button>
      </div>

      <div className="h-72 w-full">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Loading…
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Insufficient history — no validated records in this range.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
              onMouseMove={(e) => {
                if (e?.activePayload?.[0]?.payload) {
                  setHoverPoint(e.activePayload[0].payload as HistoryPoint);
                }
              }}
              onMouseLeave={() => setHoverPoint(null)}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.4} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#94a3b8" />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 10 }}
                stroke="#94a3b8"
                width={28}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as HistoryPoint;
                  return (
                    <div className="rounded border border-border bg-background/95 p-2 text-[10px] shadow-md backdrop-blur">
                      <div className="font-semibold">
                        {new Date(p.capturedAt).toUTCString().slice(0, 16)}
                      </div>
                      <div className="mt-1">
                        Overall:{" "}
                        <span className="font-bold">{p.overall.toFixed(2)}</span>{" "}
                        <span className="text-muted-foreground">({p.grade})</span>
                      </div>
                      <div className="text-muted-foreground">
                        90% CI: [{p.ciLower.toFixed(1)}, {p.ciUpper.toFixed(1)}]
                      </div>
                      <div className="text-muted-foreground">
                        Coverage: {(p.coverage * 100).toFixed(0)}%
                      </div>
                      <div className="mt-1 border-t border-border pt-1">
                        {DIMENSION_KEYS.map((d) => (
                          <div key={d} className="flex justify-between gap-3">
                            <span style={{ color: DIMENSION_META[d].color }}>
                              {DIMENSION_META[d].label}
                            </span>
                            <span>{p.dimensions[d].toFixed(1)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-1 border-t border-border pt-1 text-muted-foreground">
                        Coef v: {p.coefficientVersion === "uniform-cold-start" ? "cold-start" : "ML-trained"}
                      </div>
                    </div>
                  );
                }}
              />
              <ReferenceLine y={70} stroke="#22c55e" strokeDasharray="2 2" opacity={0.4} />
              <ReferenceLine y={50} stroke="#94a3b8" strokeDasharray="2 2" opacity={0.4} />
              <ReferenceLine y={40} stroke="#f87171" strokeDasharray="2 2" opacity={0.4} />
              {showCI && (
                <>
                  <Line
                    type="monotone"
                    dataKey="ciUpper"
                    stroke="#cbd5e1"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    dot={false}
                    legendType="none"
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="ciLower"
                    stroke="#cbd5e1"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    dot={false}
                    legendType="none"
                    isAnimationActive={false}
                  />
                </>
              )}
              {showOverall && (
                <Line
                  type="monotone"
                  dataKey="overall"
                  stroke="#0f172a"
                  strokeWidth={2.5}
                  dot={false}
                  isAnimationActive={false}
                />
              )}
              {DIMENSION_KEYS.filter((d) => activeDims.has(d)).map((d) => (
                <Line
                  key={d}
                  type="monotone"
                  dataKey={`dimensions.${d}`}
                  stroke={DIMENSION_META[d].color}
                  strokeWidth={1.4}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {hoverPoint && (
        <div className="rounded border border-border bg-muted/30 px-2 py-1 text-[10px] text-muted-foreground">
          {new Date(hoverPoint.capturedAt).toUTCString().slice(0, 16)} · Overall{" "}
          {hoverPoint.overall.toFixed(2)} ({hoverPoint.grade}) · 90% CI [
          {hoverPoint.ciLower.toFixed(1)}, {hoverPoint.ciUpper.toFixed(1)}]
        </div>
      )}
    </div>
  );
}
