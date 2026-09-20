"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Activity, ChevronDown } from "lucide-react";
import { CandlestickChart } from "@/components/bedaan/candlestick-chart";

interface BatchCandleBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function BatchCandlestickChart({
  batchId,
  batchIndex,
  batchSize,
  status,
  startedAt,
  completedAt,
  height = 400,
}: {
  batchId: string;
  batchIndex: number;
  batchSize: number;
  status: string;
  startedAt: string;
  completedAt: string | null;
  height?: number;
}) {
  const [range, setRange] = useState<"1M" | "3M" | "6M" | "1Y" | "MAX">("3M");

  const { data, isLoading, isError } = useQuery<{
    batchId: string;
    bars: BatchCandleBar[];
    count: number;
  }>({
    queryKey: ["batch-candles", batchId, range],
    queryFn: async () => {
      const r = await fetch(`/api/batches/${batchId}/candles?range=${range}`);
      if (!r.ok) throw new Error("batch candles");
      return r.json();
    },
    enabled: !!batchId,
    staleTime: 5 * 60_000,
  });

  const bars = data?.bars ?? [];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Activity className="h-4 w-4 text-primary" />
          <span>Batch {batchIndex} — {batchId}</span>
          <span className="text-[10px] font-normal text-muted-foreground">
            {batchSize} symbols · {status} · {startedAt ? new Date(startedAt).toLocaleDateString() : "—"}
            {completedAt ? ` → ${new Date(completedAt).toLocaleDateString()}` : ""}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {(["1M", "3M", "6M", "1Y", "MAX"] as const).map((r) => (
            <button
              key={r}
              className={`rounded px-2 py-0.5 text-[10px] ${
                range === r
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-background hover:bg-accent"
              }`}
              onClick={() => setRange(r)}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : isError || bars.length === 0 ? (
        <div className="flex h-48 items-center justify-center gap-2 text-xs text-muted-foreground">
          <AlertTriangle className="h-4 w-4" />
          <span>No candle data for this batch</span>
        </div>
      ) : (
        <CandlestickChart bars={bars} ticker={`Batch-${batchIndex}`} height={height - 60} />
      )}
    </div>
  );
}

export default BatchCandlestickChart;
