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
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${r.status}`);
      }
      const data = await r.json();
      if (typeof data.overall !== "number") {
        throw new Error("Malformed symbol detail response");
      }
      return data;
    },
    enabled: !!ticker,
  });

  const detail: SymbolDetail | undefined = q.data;
  const effectiveGrade = detail?.grade ?? "NEUTRAL";

  return (
    <div className="flex flex-col">
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
                    color: gradeColor(effectiveGrade as never),
                    borderColor: gradeColor(effectiveGrade as never),
                  }}
                >
                  {effectiveGrade.replace("_", " ")}
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
                    style={{ color: gradeColor(effectiveGrade as never) }}
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
      <div className="h-auto overflow-visible">
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

          <div className="h-auto p-3">
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
        <div className="mt-3 rounded border border-border bg-card/50 p-3">
          <ScoreSummary ticker={ticker} detail={detail} hasSymbol={!!detail} />
        </div>
      </div>

      <TraceModal ticker={ticker} open={traceOpen} onOpenChange={setTraceOpen} />
    </div>
  );
}

function ScoreSummary({ ticker, detail, hasSymbol }: { ticker: string; detail: SymbolDetail | undefined; hasSymbol: boolean }) {
  const currentScore = detail?.overall ?? 0;
  const currentGrade = detail?.grade ?? "NEUTRAL";
  const dimColors: Record<string, string> = {
    fundamental: "#3b82f6",
    technical: "#22c55e",
    sentiment: "#f59e0b",
    risk: "#ef4444",
    macro: "#8b5cf6",
    ai: "#06b6d4",
  };
  const dimLabels: Record<string, string> = {
    fundamental: "Fundamental",
    technical: "Technical",
    sentiment: "Sentiment",
    risk: "Risk",
    macro: "Macro",
    ai: "AI",
  };

  return (
    <div className="flex flex-col items-center gap-3 py-1">
      {/* Gauge — center, big */}
      <ScoreGauge value={currentScore} />

      {/* Score label */}
      <div className="text-center">
        <div className="text-3xl font-mono font-bold" style={{ color: gradeColor(currentGrade as never) }}>
          {currentScore.toFixed(1)}
        </div>
        <div className="text-[10px] text-muted-foreground">
          {hasSymbol ? `${ticker} Overall Score` : "Overall Market Score"}
        </div>
      </div>

      {/* Stats */}
      {detail && (
        <>
          <div className="grid grid-cols-3 gap-2 w-full text-[10px]">
            <div className="rounded border border-border bg-card p-2 text-center">
              <div className="text-muted-foreground">Coverage</div>
              <div className="font-mono font-bold">{(detail.coverage * 100).toFixed(0)}%</div>
            </div>
            <div className="rounded border border-border bg-card p-2 text-center">
              <div className="text-muted-foreground">Stability</div>
              <div className="font-mono font-bold">{detail.stabilityIndex.toFixed(2)}</div>
            </div>
            <div className="rounded border border-border bg-card p-2 text-center">
              <div className="text-muted-foreground">90% CI</div>
              <div className="font-mono font-bold">
                [{detail.ciLower.toFixed(0)},{detail.ciUpper.toFixed(0)}]
              </div>
            </div>
          </div>
          <div className="grid grid-cols-6 gap-1 w-full text-[9px]">
            {DIMENSION_KEYS.map((d) => {
              const v = detail.dimensionScores[d] ?? 50;
              return (
                <div
                  key={d}
                  className="rounded p-1 text-center"
                  style={{ background: dimColors[d] + "18", border: `1px solid ${dimColors[d]}44` }}
                >
                  <div style={{ color: dimColors[d] }} className="font-mono font-bold">{v.toFixed(0)}</div>
                  <div className="text-muted-foreground truncate">{dimLabels[d]}</div>
                </div>
              );
            })}
          </div>
          <div className="rounded border border-border bg-card p-2 text-[10px]">
            <div className="mb-1 font-semibold text-muted-foreground">Coefficient Info</div>
            <div className="flex items-center justify-between">
              <span>Version</span>
              <span className="font-mono">{detail.coefficientVersion}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Data Hash</span>
              <span className="font-mono">{detail.rawDataHash.slice(0, 8)}…</span>
            </div>
            {detail.coefficientVersion === "uniform-cold-start" && (
              <div className="mt-1 text-amber-600 dark:text-amber-400">
                ⚠ Cold-start — using uniform weights (training in progress)
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ScoreGauge({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const angle = (180 - (clamped / 100) * 180) * (Math.PI / 180);
  const cx = 80;
  const cy = 70;
  const r = 60;
  const needleLen = r - 12;
  const nx = cx + needleLen * Math.cos(angle);
  const ny = cy - needleLen * Math.sin(angle);

  return (
    <div className="flex flex-col items-center">
      <svg width="160" height="90" viewBox="0 0 160 90">
        <defs>
          <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="40%" stopColor="#eab308" />
            <stop offset="70%" stopColor="#22c55e" />
            <stop offset="100%" stopColor="#16a34a" />
          </linearGradient>
        </defs>
        {/* Background arc */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="10"
          strokeLinecap="round"
          className="dark:stroke-gray-700"
        />
        {/* Gradient arc */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="url(#gaugeGrad)"
          strokeWidth="6"
          strokeLinecap="round"
          opacity="0.85"
        />
        {/* Tick marks */}
        {[0, 25, 50, 75, 100].map((s) => {
          const tickAngle = (180 - (s / 100) * 180) * (Math.PI / 180);
          const tx1 = cx + (r - 10) * Math.cos(tickAngle);
          const ty1 = cy - (r - 10) * Math.sin(tickAngle);
          const tx2 = cx + (r - 4) * Math.cos(tickAngle);
          const ty2 = cy - (r - 4) * Math.sin(tickAngle);
          return (
            <line
              key={s}
              x1={tx1} y1={ty1} x2={tx2} y2={ty2}
              stroke="#9ca3af" strokeWidth="1"
            />
          );
        })}
        {/* Needle */}
        <line
          x1={cx} y1={cy} x2={nx} y2={ny}
          stroke="#1e293b" strokeWidth="2.5" strokeLinecap="round"
        />
        {/* Center dot */}
        <circle cx={cx} cy={cy} r="5" fill="#1e293b" />
        <circle cx={cx} cy={cy} r="2.5" fill="#f8fafc" />
        {/* Score in center */}
        <text x={cx} y={cy + 18} fontSize="14" fontWeight="bold" fill="#1e293b" textAnchor="middle" fontFamily="monospace">
          {clamped.toFixed(1)}
        </text>
      </svg>
    </div>
  );
}
