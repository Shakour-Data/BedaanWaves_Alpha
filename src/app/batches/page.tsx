"use client";

import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  ChevronDown,
  Clock,
  Database,
  Layers,
  Loader2,
  Radio,
} from "lucide-react";
import { useRouter } from "next/navigation";
import BatchCandlestickChart from "@/components/bedaan/batch-candlestick-chart";

interface BatchManifest {
  batchId: string;
  batchIndex: number;
  batchSize: number;
  sourceRevision: string | null;
  sourceHash: string | null;
  selectedTickers: unknown[];
  skippedTickers: unknown[];
  failedTickers: unknown[];
  startedAt: string;
  completedAt: string | null;
  status: string;
  rawRowsWritten: number;
  snapshotsWritten: number;
  coefficientsWritten: number;
  trainingRunsWritten: number;
  generationId: string | null;
  validationSummary: unknown | null;
  errorDetails: string | null;
}

export default function BatchesPage() {
  const router = useRouter();

  const { data, isLoading } = useQuery<{ batches: BatchManifest[] }>({
    queryKey: ["ingestion-batches"],
    queryFn: async () => {
      const r = await fetch("/api/ingestion/batches");
      return r.json();
    },
    refetchInterval: 30_000,
  });

  const batches = data?.batches ?? [];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-4 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            <h1 className="text-lg font-bold">Batch Candlestick Charts</h1>
            <Badge variant="outline" className="text-[9px]">
              {batches.length} batches
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <Radio className="h-3 w-3" /> Real-data native · MarketBar aggregate
          </div>
        </div>
      </div>

      <main className="flex-1 p-4">
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-80 w-full" />
            ))}
          </div>
        ) : batches.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            <Database className="mr-2 h-5 w-5" /> No batches found
          </div>
        ) : (
          <div className="mx-auto max-w-7xl space-y-6">
            {batches.map((batch, idx) => (
              <BatchCard key={batch.batchId} batch={batch} idx={idx} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function BatchCard({
  batch,
  idx,
}: {
  batch: BatchManifest;
  idx: number;
}) {
  return (
    <div className="rounded border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded border border-border bg-muted text-[10px] font-bold">
            {batch.batchIndex}
          </div>
          <div>
            <div className="text-sm font-semibold">{batch.batchId}</div>
            <div className="text-[10px] text-muted-foreground">
              {batch.batchSize} symbols · {batch.generationId?.slice(-12) ?? "—"}{" "}
              · started{" "}
              {batch.startedAt ? new Date(batch.startedAt).toLocaleString() : "—"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={`text-[9px] ${
              batch.status === "COMPLETED"
                ? "text-green-600 border-green-600/30"
                : batch.status === "PARTIAL"
                  ? "text-amber-600 border-amber-600/30"
                  : "text-red-600 border-red-600/30"
            }`}
          >
            {batch.status}
          </Badge>
          {batch.completedAt && (
            <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              {new Date(batch.completedAt).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      {/* Validation summary */}
      <div className="flex flex-wrap gap-3 border-b border-border/60 px-4 py-1.5">
        <Stat label="Raw Success" value={batch.validationSummary ? (batch.validationSummary as { rawSuccess?: number }).rawSuccess ?? batch.rawRowsWritten : batch.rawRowsWritten} />
        <Stat label="Snapshots" value={batch.snapshotsWritten} />
        <Stat label="Coefficients" value={batch.coefficientsWritten} />
        <Stat label="Training Runs" value={batch.trainingRunsWritten} />
        {batch.validationSummary != null && (
          <>
            <Stat
              label="Scored"
              value={(batch.validationSummary as { scored?: number }).scored ?? "—"}
            />
            <Stat
              label="Failed"
              value={(batch.validationSummary as { rawFailure?: number }).rawFailure ?? 0}
              warn={((batch.validationSummary as { rawFailure?: number }).rawFailure ?? 0) > 0}
            />
            <Stat
              label="Insufficient"
              value={(batch.validationSummary as { insufficient?: number }).insufficient ?? 0}
              warn={((batch.validationSummary as { insufficient?: number }).insufficient ?? 0) > 0}
            />
          </>
        )}
      </div>

      {/* Candlestick Chart */}
      <div className="p-3">
        <div className="mb-2 flex items-center gap-2 text-[10px] text-muted-foreground">
          <Layers className="h-3 w-3" />
          <span>Aggregate OHLCV for all {batch.batchSize} symbols in this batch</span>
        </div>
        <div className="h-[450px] w-full overflow-hidden rounded border border-border bg-card/50">
          <BatchCandlestickChart
            batchId={batch.batchId}
            batchIndex={batch.batchIndex}
            batchSize={batch.batchSize}
            status={batch.status}
            startedAt={batch.startedAt}
            completedAt={batch.completedAt}
            height={450}
          />
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
  value: number | string;
  warn?: boolean;
}) {
  return (
    <div className="flex items-center gap-1 text-[9px]">
      <span className="text-muted-foreground">{label}:</span>
      <span
        className={`font-mono font-semibold ${warn ? "text-amber-600" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
