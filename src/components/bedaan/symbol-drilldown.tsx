"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity,
  BarChart3,
  Crosshair,
  FileSearch,
  Gauge,
  Layers,
  LineChart,
  Users,
  X,
} from "lucide-react";
import { HistoricalScoreChart } from "./historical-score-chart";
import { RadarScoreChart } from "./radar-score-chart";
import { CoefficientsPanel } from "./coefficients-panel";
import { DecompositionPanel } from "./decomposition-panel";
import { PeerComparison } from "./peer-comparison";
import { TraceModal } from "./trace-modal";
import {
  NativeCandlestickChart,
  NativeTechnicalPanel,
} from "@/components/bedaan/native-market-widgets";
import { DIMENSION_KEYS, DIMENSION_META } from "@/lib/scoring/metric-universe";
import { gradeColor } from "@/lib/scoring/transforms";

interface Props {
  ticker: string;
  onClose: () => void;
  compareTicker?: string;
  onCompareChange?: (t: string | undefined) => void;
}

interface SymbolDetail {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  marketCap: number;
  isEtf: boolean;
  capturedAt: string;
  overall: number;
  grade: string;
  signals: string[];
  dimensionScores: Record<string, number>;
  coverage: number;
  ciLower: number;
  ciUpper: number;
  stabilityIndex: number;
  price: number;
  priceChange: number;
  volume: number;
  prevOverall: number | null;
  delta: number | null;
  coefficientVersion: string;
  rawDataHash: string;
  dataQuality: string;
  isProcessed: boolean;
  snapshotId: string;
}

export function SymbolDrilldown({ ticker, onClose, compareTicker, onCompareChange }: Props) {
  const [tab, setTab] = useState("history");
  const [traceOpen, setTraceOpen] = useState(false);

  const q = useQuery({
    queryKey: ["symbol-detail", ticker],
    queryFn: async () => {
      const r = await fetch(`/api/scores/${ticker}`);
      return r.json();
    },
    enabled: !!ticker,
  });

  const detail: SymbolDetail | undefined = q.data;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card px-3 py-2">
        {q.isLoading || !detail ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">
                  {detail.ticker}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {detail.name}
                </span>
                <Badge
                  variant="outline"
                  className="text-[10px]"
                  style={{
                    color: gradeColor(detail.grade as never),
                    borderColor: gradeColor(detail.grade as never),
                  }}
                >
                  {detail.grade.replace("_", " ")}
                </Badge>
                {detail.coefficientVersion === "uniform-cold-start" && (
                  <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400">
                    cold-start (training in progress)
                  </Badge>
                )}
                <span className="text-[10px] text-muted-foreground">
                  {detail.sector} · {detail.industry}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px]">
                <div>
                  <span className="text-muted-foreground">Overall:</span>{" "}
                  <span
                    className="font-mono text-base font-bold"
                    style={{ color: gradeColor(detail.grade as never) }}
                  >
                    {detail.overall.toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Δ:</span>{" "}
                  {detail.delta !== null ? (
                    <span
                      className="font-mono"
                      style={{ color: detail.delta >= 0 ? "#22c55e" : "#ef4444" }}
                    >
                      {detail.delta >= 0 ? "+" : ""}
                      {detail.delta.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
                <div>
                  <span className="text-muted-foreground">90% CI:</span>{" "}
                  <span className="font-mono">
                    [{detail.ciLower.toFixed(1)}, {detail.ciUpper.toFixed(1)}]
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Stability:</span>{" "}
                  <span className="font-mono">{detail.stabilityIndex.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Coverage:</span>{" "}
                  <span className="font-mono">{(detail.coverage * 100).toFixed(0)}%</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Price:</span>{" "}
                  <span className="font-mono">${detail.price.toFixed(2)}</span>{" "}
                  <span
                    className="font-mono"
                    style={{ color: detail.priceChange >= 0 ? "#22c55e" : "#ef4444" }}
                  >
                    ({detail.priceChange >= 0 ? "+" : ""}
                    {detail.priceChange.toFixed(2)}%)
                  </span>
                </div>
              </div>
              {/* Dimension chips */}
              <div className="mt-1.5 flex flex-wrap gap-1">
                {DIMENSION_KEYS.map((d) => {
                  const v = detail.dimensionScores[d] ?? 50;
                  return (
                    <span
                      key={d}
                      className="rounded px-1.5 py-0.5 text-[10px] font-mono"
                      style={{
                        background: DIMENSION_META[d].color + "22",
                        color: DIMENSION_META[d].color,
                        border: `1px solid ${DIMENSION_META[d].color}44`,
                      }}
                      title={DIMENSION_META[d].description}
                    >
                      {DIMENSION_META[d].label}: {v.toFixed(0)}
                    </span>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[10px]"
                onClick={() => setTraceOpen(true)}
              >
                <FileSearch className="h-3 w-3" /> Trace
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex-1 overflow-hidden">
        <Tabs value={tab} onValueChange={setTab} className="h-full flex flex-col">
          <TabsList className="h-8 w-full justify-start overflow-x-auto rounded-none border-b border-border bg-card px-2">
            <TabsTrigger value="history" className="text-[10px]">
              <LineChart className="mr-1 h-3 w-3" /> History
            </TabsTrigger>
            <TabsTrigger value="radar" className="text-[10px]">
              <Crosshair className="mr-1 h-3 w-3" /> Radar
            </TabsTrigger>
            <TabsTrigger value="coefficients" className="text-[10px]">
              <Layers className="mr-1 h-3 w-3" /> Coefficients
            </TabsTrigger>
            <TabsTrigger value="decomposition" className="text-[10px]">
              <BarChart3 className="mr-1 h-3 w-3" /> Decomposition
            </TabsTrigger>
            <TabsTrigger value="peers" className="text-[10px]">
              <Users className="mr-1 h-3 w-3" /> Peers
            </TabsTrigger>
            <TabsTrigger value="tv-chart" className="text-[10px]">
              <Gauge className="mr-1 h-3 w-3" /> TV Chart
            </TabsTrigger>
            <TabsTrigger value="tv-tech" className="text-[10px]">
              <Activity className="mr-1 h-3 w-3" /> TV Tech
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto p-3">
            <TabsContent value="history" className="mt-0">
              <HistoricalScoreChart ticker={ticker} />
              <div className="mt-4 text-[10px] text-muted-foreground">
                <span className="font-semibold">Spec §11.1:</span> Hover tooltip shows exact score, date, grade, conformal CI, and per-dimension breakdown at that timestamp. No gaps filled with mock data.
              </div>
            </TabsContent>
            <TabsContent value="radar" className="mt-0">
              <RadarScoreChart ticker={ticker} />
              <div className="mt-4 text-[10px] text-muted-foreground">
                <span className="font-semibold">Spec §11.2:</span> 6-axis radar with current + 30d-ago + NASDAQ median + sector median overlays. Hover on vertex shows dimension score + top-3 contributing sub-dimensions.
              </div>
            </TabsContent>
            <TabsContent value="coefficients" className="mt-0">
              <CoefficientsPanel ticker={ticker} compareTicker={compareTicker} />
              <div className="mt-4 text-[10px] text-muted-foreground">
                <span className="font-semibold">Spec §3.1 / §11.3:</span> Per-symbol ML-learned weights at all 4 levels (L1/L2/L3/L4). Compare against another ticker to confirm divergence — AAPL ≠ NVDA at the same timestamp.
              </div>
              {!compareTicker && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 h-7 text-[10px]"
                  onClick={() => onCompareChange?.("NVDA")}
                >
                  Compare against NVDA
                </Button>
              )}
              {compareTicker && (
                <div className="mt-2 flex items-center gap-2 text-[10px]">
                  <span className="text-muted-foreground">Comparing against:</span>
                  <Badge variant="secondary">{compareTicker}</Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 px-2 text-[10px]"
                    onClick={() => onCompareChange?.(undefined)}
                  >
                    clear
                  </Button>
                </div>
              )}
            </TabsContent>
            <TabsContent value="decomposition" className="mt-0">
              <DecompositionPanel ticker={ticker} />
              <div className="mt-4 text-[10px] text-muted-foreground">
                <span className="font-semibold">Spec §11.8:</span> Waterfall breaks the overall score into per-level contributions. Drill L1 → L2 → L3 → L4 to answer "why is this stock 72 instead of 85?".
              </div>
            </TabsContent>
            <TabsContent value="peers" className="mt-0">
              <PeerComparison ticker={ticker} />
            </TabsContent>
            <TabsContent value="tv-chart" className="mt-0">
              <div className="mb-2 text-[10px] text-muted-foreground">
                <span className="font-semibold">Spec §12.4:</span> Real candlestick chart (display only).
                TradingView free-tier embeds are disabled because their data backends are
                unreachable; this chart renders from real yfinance OHLCV instead.
              </div>
              <div className="h-[420px] w-full overflow-hidden rounded border border-border bg-card">
                <NativeCandlestickChart ticker={ticker} height={420} />
              </div>
            </TabsContent>
            <TabsContent value="tv-tech" className="mt-0">
              <NativeTechnicalPanel ticker={ticker} />
            </TabsContent>
          </div>
        </Tabs>
      </div>

      <TraceModal ticker={ticker} open={traceOpen} onOpenChange={setTraceOpen} />
    </div>
  );
}
