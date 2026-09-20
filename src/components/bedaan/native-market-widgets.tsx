"use client";

// BedaanWaves — native market widgets backed by REAL local data.
//
// These replace the TradingView free-tier embeds (advanced-chart / stock-heatmap /
// events / market-overview) which could never display data because TradingView's
// data backends (data.tradingview.com, api.tradingview.com, www.tradingview.com)
// are unreachable from this environment (connection refused / 000). Every value
// here is derived from real-market-data.json / real-macro-data.json / real-news-data.json
// (yfinance + FRED + published government statistics — BEA, BLS, Fed, U.Michigan).
// Display-only per spec §12 — scoring remains BedaanWaves-native.
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Activity, Check, DollarSign, Wind, ChevronDown, TrendingUp, Globe, Calendar, Clock, BarChart3, X } from "lucide-react";
import { ResponsiveContainer, Treemap } from "recharts";
import {
  rsi,
  macd,
  bollingerPercentB,
  adx,
  atr,
  williamsR,
  roc,
  returns,
} from "@/lib/technical-indicators";
import { CandlestickChart } from "@/components/bedaan/candlestick-chart";
import { gradeColor, clamp } from "@/lib/scoring/transforms";
import type { DimensionKey } from "@/lib/scoring/metric-universe";
import type { MacroIndicator } from "@/lib/real-store";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface CandleBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const RANGE_BUTTONS = ["1M", "3M", "6M", "1Y", "MAX"] as const;
type Range = (typeof RANGE_BUTTONS)[number];

function priceFmt(v: number, unit = "") {
  const n =
    Math.abs(v) >= 1000
      ? v.toLocaleString("en-US", { maximumFractionDigits: 2 })
      : v.toFixed(2);
  return `${n}${unit}`;
}

function mcapFmt(cap: number) {
  if (cap <= 0) return "—"; // no real market cap data (anti-mock)
  if (cap >= 1e12) return `$${(cap / 1e12).toFixed(2)}T`;
  if (cap >= 1e9) return `$${(cap / 1e9).toFixed(2)}B`;
  if (cap >= 1e6) return `$${(cap / 1e6).toFixed(0)}M`;
  return `$${cap.toFixed(0)}`;
}

function pctFmt(v: number) {
  const s = v >= 0 ? "+" : "";
  return `${s}${v.toFixed(2)}%`;
}

function band(v: number | null): string {
  if (v == null) return "";
  if (v >= 70) return "overbought (>70)";
  if (v <= 30) return "oversold (<30)";
  return "neutral";
}

function NoDataMessage({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
      <AlertTriangle className="h-4 w-4" />
      <span>{label}</span>
    </div>
  );
}

// ── Candlestick chart (real OHLCV, no external embed) ───────────────────────────
export function NativeCandlestickChart({
  ticker,
  height = 420,
}: {
  ticker: string;
  height?: number;
}) {
  const [range, setRange] = useState<Range>("3M");
  const {
    data,
    isLoading,
    isError,
  } = useQuery<{
    ticker: string;
    bars: CandleBar[];
    meta: { name: string; sector: string; industry: string; marketCap: number; beta: number; trailingPE: number | null } | null;
  }>({
    queryKey: ["candles", ticker, range],
    queryFn: async () => {
      const r = await fetch(`/api/candles/${ticker}?range=${range}`);
      if (!r.ok) throw new Error("candles");
      return r.json();
    },
    enabled: !!ticker,
    staleTime: 5 * 60_000,
  });

  const bars = data?.bars ?? [];
  const meta = data?.meta;

  return (
    <div className="flex h-full w-full flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Activity className="h-4 w-4 text-primary" />
          <span>{ticker} — Real Candlestick</span>
          {meta && (
            <span className="text-xs font-normal text-muted-foreground">
              {meta.sector} · {meta.industry} · {mcapFmt(meta.marketCap)} MCap · β{meta.beta.toFixed(2)}
              {meta.trailingPE != null && ` · PE ${meta.trailingPE.toFixed(1)}`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {RANGE_BUTTONS.map((r) => (
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

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : isError || bars.length === 0 ? (
        <NoDataMessage label="No real candle data available" />
      ) : (
        <CandlestickChart bars={bars} ticker={ticker} height={height - 80} />
      )}
    </div>
  );
}

interface HeatmapRow {
  ticker: string;
  overall: number;
  grade: string;
  priceChange: number;
  marketCap: number;
  sector: string;
  dimFundamental: number;
  dimTechnical: number;
  dimSentiment: number;
  dimRisk: number;
  dimMacro: number;
  dimAi: number;
}

type ColorMode =
  | "priceChange"
  | "overall"
  | "grade"
  | "fundamental"
  | "technical"
  | "sentiment"
  | "risk"
  | "macro"
  | "ai";

const COLOR_MODES: Array<{ key: ColorMode; label: string }> = [
  { key: "priceChange", label: "Δ%" },
  { key: "overall", label: "Overall" },
  { key: "grade", label: "Grade" },
  { key: "fundamental", label: "Fund." },
  { key: "technical", label: "Tech" },
  { key: "sentiment", label: "Sent." },
  { key: "risk", label: "Risk" },
  { key: "macro", label: "Macro" },
  { key: "ai", label: "AI" },
];

const DIM_LABELS: Record<DimensionKey, string> = {
  fundamental: "Fundamental",
  technical: "Technical",
  sentiment: "Sentiment",
  risk: "Risk",
  macro: "Macro",
  ai: "AI",
};

function scoreGradient(s: number): string {
  const cl = clamp(s, 0, 100);
  const hue = (cl / 100) * 140;
  return `hsl(${hue}, 72%, 42%)`;
}

function priceChangeColor(pc: number, maxAbs: number): string {
  const ratio = Math.min(1, Math.abs(pc) / maxAbs);
  if (pc > 0) return `rgba(22,100,55,${0.4 + ratio * 0.55})`;
  if (pc < 0) return `rgba(180,25,25,${0.4 + ratio * 0.55})`;
  return "rgba(148,163,184,0.4)";
}

function gradeToScore(grade: string | undefined): number {
  switch (grade) {
    case "STRONG_BULLISH": return 92;
    case "BULLISH": return 77;
    case "NEUTRAL": return 55;
    case "BEARISH": return 30;
    case "STRONG_BEARISH": return 12;
    default: return 50;
  }
}

function getTileScore(props: HeatTileProps, mode: ColorMode): number {
  switch (mode) {
    case "priceChange":
      return props.priceChange ?? 0;
    case "overall":
      return props.overall ?? 50;
    case "grade":
      return gradeToScore(props.grade);
    case "fundamental":
      return props.dimFundamental ?? 50;
    case "technical":
      return props.dimTechnical ?? 50;
    case "sentiment":
      return props.dimSentiment ?? 50;
    case "risk":
      return props.dimRisk ?? 50;
    case "macro":
      return props.dimMacro ?? 50;
    case "ai":
      return props.dimAi ?? 50;
    default:
      return 0;
  }
}

function getModeFill(score: number, mode: ColorMode, maxAbs: number): string {
  switch (mode) {
    case "priceChange":
      return priceChangeColor(score, maxAbs);
    case "grade":
      return gradeColor(score as never);
    default:
      return scoreGradient(score);
  }
}

// ── Heatmap (treemap by market cap, colored by selected metric) ────────────────────
export function NativeHeatmap({ height = 600 }: { height?: number }) {
  const { data, isLoading, isError } = useQuery<{
    rows: HeatmapRow[];
    total: number;
    latestAt: string;
  }>({
    queryKey: ["heatmap-rankings"],
    queryFn: async () => {
      const r = await fetch("/api/heatmap");
      return r.json();
    },
    staleTime: 5 * 60_000,
  });

  const [colorMode, setColorMode] = useState<ColorMode>("priceChange");

  if (isLoading) return <Skeleton className="h-full w-full" />;
  if (isError || !data?.rows?.length) return <NoDataMessage label="No ranking data" />;

  const maxPriceChangeAbs = Math.max(1, ...data.rows.map((r) => Math.abs(r.priceChange)));

  const treeData = data.rows
    .slice()
    .filter((r) => r.marketCap > 0) // anti-mock: exclude symbols with no real market cap
    .sort((a, b) => b.marketCap - a.marketCap)
    .map((r) => ({
      name: r.ticker,
      value: r.marketCap,
      priceChange: r.priceChange,
      overall: r.overall,
      grade: r.grade,
      dimFundamental: r.dimFundamental ?? 50,
      dimTechnical: r.dimTechnical ?? 50,
      dimSentiment: r.dimSentiment ?? 50,
      dimRisk: r.dimRisk ?? 50,
      dimMacro: r.dimMacro ?? 50,
      dimAi: r.dimAi ?? 50,
    }));

  const modeLabel =
    colorMode === "priceChange"
      ? "daily Δ%"
      : colorMode === "overall"
      ? "overall score"
      : colorMode === "grade"
      ? "grade"
      : `${DIM_LABELS[colorMode]} score`;
  const currentMode = COLOR_MODES.find((m) => m.key === colorMode)!;

  return (
    <div className="relative h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <Treemap
          data={treeData}
          dataKey="value"
          stroke="#ffffff22"
          isAnimationActive={true}
          content={<HeatTile colorMode={colorMode} maxPriceChangeAbs={maxPriceChangeAbs} />}
        />
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-2 px-1 pt-1">
        <div className="flex items-center gap-2 text-xs">
          <span>{data.rows.length} real NASDAQ tickers · market-cap weighted</span>
          <button
            className="flex items-center gap-0.5 rounded border border-border bg-background px-2 py-0.5 text-[10px] hover:bg-accent"
            onClick={() => {
              const idx = COLOR_MODES.findIndex((m) => m.key === colorMode);
              const next = COLOR_MODES[(idx + 1) % COLOR_MODES.length];
              setColorMode(next.key);
            }}
          >
            <span className="font-semibold">{currentMode.label}</span>
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>
        <span className="text-[9px] text-muted-foreground">
          colored by {modeLabel} · as of {new Date(data.latestAt).toLocaleDateString()}
        </span>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-end gap-2 px-1 pb-1 text-[9px] text-muted-foreground">
        <ColorModeLegend mode={colorMode} />
      </div>
    </div>
  );
}

function ColorModeLegend({ mode }: { mode: ColorMode }) {
  if (mode === "priceChange") {
    return (
      <>
        <span className="flex items-center gap-1">
          <span className="block h-2 w-3 rounded" style={{ backgroundColor: "rgba(22,100,55,0.8)" }} /> up
        </span>
        <span className="flex items-center gap-1">
          <span className="block h-2 w-3 rounded" style={{ backgroundColor: "rgba(180,25,25,0.8)" }} /> down
        </span>
      </>
    );
  }
  if (mode === "grade") {
    return (
      <>
        {(["STRONG_BULLISH", "BULLISH", "NEUTRAL", "BEARISH", "STRONG_BEARISH"] as const).map((g) => (
          <span key={g} className="flex items-center gap-1">
            <span className="block h-2 w-3 rounded" style={{ backgroundColor: gradeColor(g) }} />
            {g.replace("_", " ").split(" ")[0]}
          </span>
        ))}
      </>
    );
  }
  return (
    <span className="flex items-center gap-1">
      <span className="block h-2 w-10 rounded" style={{ background: "linear-gradient(90deg, #dc2626, #eab308, #16a34a)" }} /> low → high
    </span>
  );
}

interface HeatTileProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  priceChange?: number;
  overall?: number;
  grade?: string;
  dimFundamental?: number;
  dimTechnical?: number;
  dimSentiment?: number;
  dimRisk?: number;
  dimMacro?: number;
  dimAi?: number;
  colorMode: ColorMode;
  maxPriceChangeAbs: number;
}
function HeatTile(props: HeatTileProps) {
  const { x, y, width, height, name, colorMode, maxPriceChangeAbs } = props;
  // recharts clones this element with the layout node's fields spread as props
  // (x, y, width, height, name, priceChange, ...). Render only real leaf tiles;
  // skip the synthetic root (no `name`). Use null/undefined checks — x=0 or y=0
  // are valid positions at the top-left of the treemap.
  if (!name || x == null || y == null || !width || !height) return null;
  const score = getTileScore(props, colorMode);
  const fill = getModeFill(score, colorMode, maxPriceChangeAbs);
  const showLabel = width >= 30 && height >= 20;
  const showScore = height >= 28;
  let scoreText = "";
  switch (colorMode) {
    case "priceChange":
      scoreText = `${score > 0 ? "+" : ""}${score.toFixed(1)}%`;
      break;
    case "grade":
      scoreText = props.grade ?? "";
      break;
    default:
      scoreText = score.toFixed(0);
  }
  return (
    <g className="treemap-tile" style={{ cursor: "pointer" }}>
      <rect x={x} y={y} width={width} height={height} fill={fill} rx={3} />
      {showLabel && (
        <text
          x={x + 3}
          y={y + 12}
          fontSize={10}
          fill="#ffffff"
          fontWeight={600}
          pointerEvents="none"
        >
          {name}
        </text>
      )}
      {showScore && (
        <text
          x={x + 3}
          y={y + height - 5}
          fontSize={8}
          fill="#ffffffdd"
          pointerEvents="none"
        >
          {scoreText}
        </text>
      )}
    </g>
  );
}

// ── Economic calendar (real published government statistics + global indicators) ─
export function NativeEconomicCalendar({ height = 450 }: { height?: number }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [countryFilter, setCountryFilter] = useState<string | null>(null);
  const [countryPopoverOpen, setCountryPopoverOpen] = useState(false);
  const { data, isLoading, isError } = useQuery<{
    releases: MacroIndicator[];
    market: MacroIndicator[];
    news: Array<{ headline: string; source: string; publishedAt: string; sentiment: string; tickers: string[] }>;
  }>({
    queryKey: ["macro-calendar", refreshKey],
    queryFn: async () => {
      const [m, n] = await Promise.all([
        fetch("/api/macro").then((r) => r.json()),
        fetch("/api/news").then((r) => r.json()),
      ]);
      // Include international market indicators as economic calendar entries
      const intlMarket = (m.market || []).filter((i: MacroIndicator) =>
        ["UK","Japan","Australia","Canada","Switzerland","China","India","Mexico","Brazil","South Africa","South Korea","Singapore","Sweden","Norway","New Zealand","Hong Kong","Germany","Netherlands"].includes(i.country)
      );
      return { releases: m.releases, market: intlMarket, news: n.items ?? [] };
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  if (isLoading) return <Skeleton className="h-full w-full" />;
  if (isError || !data?.releases?.length) return <NoDataMessage label="No economic data" />;

  const allItems = [...data.releases, ...data.market];
  const countries = Array.from(new Set(allItems.map((r) => r.country))).sort();
  const filtered = countryFilter
    ? allItems.filter((r) => r.country === countryFilter)
    : allItems;

  const groupedByCountry = filtered.reduce((acc, r) => {
    if (!acc[r.country]) acc[r.country] = [];
    acc[r.country].push(r);
    return acc;
  }, {} as Record<string, MacroIndicator[]>);

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold">Economic Calendar</span>
          <Badge variant="outline" className="text-[9px]">
            {filtered.length} indicators · {countries.length} countries
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1">
            <Popover
              open={countryPopoverOpen}
              onOpenChange={setCountryPopoverOpen}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-[150px] justify-between px-2.5 text-[10px] font-medium"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="truncate">
                      {countryFilter ?? "All countries"}
                    </span>
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                sideOffset={6}
                className="w-[220px] p-0"
              >
                <Command className="rounded-md border bg-popover">
                  <CommandInput
                    placeholder="Search countries..."
                    className="h-8 border-b border-border text-[10px]"
                  />
                  <CommandList className="max-h-[260px] py-1">
                    <CommandEmpty className="px-3 py-4 text-center text-[10px] text-muted-foreground">
                      No countries found
                    </CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="__all__"
                        onSelect={() => {
                          setCountryFilter(null);
                          setCountryPopoverOpen(false);
                        }}
                        className="h-7 px-2.5 text-[10px]"
                      >
                        <Check
                          className={
                            countryFilter === null
                              ? "h-3.5 w-3.5"
                              : "h-3.5 w-3.5 opacity-0"
                          }
                        />
                        <span className="truncate">All countries</span>
                        <span className="ml-auto pl-2 text-muted-foreground">
                          {countries.length}
                        </span>
                      </CommandItem>
                      {countries.map((country) => (
                        <CommandItem
                          key={country}
                          value={country}
                          onSelect={() => {
                            setCountryFilter(country);
                            setCountryPopoverOpen(false);
                          }}
                          className="h-7 px-2.5 text-[10px]"
                        >
                          <Check
                            className={
                              countryFilter === country
                                ? "h-3.5 w-3.5"
                                : "h-3.5 w-3.5 opacity-0"
                            }
                          />
                          <span className="truncate">{country}</span>
                          <span className="ml-auto pl-2 text-muted-foreground">
                            {allItems.filter((item) => item.country === country).length}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {countryFilter && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground"
                onClick={() => setCountryFilter(null)}
                aria-label="Clear country filter"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <div className="mx-1 h-4 w-px bg-border" />
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[9px]"
            onClick={() => setRefreshKey((k) => k + 1)}
          >
            <Activity className="mr-1 h-3 w-3" />
            Refresh
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {Object.entries(groupedByCountry).map(([country, items]) => (
          <div key={country} className="border-b border-border/40">
            <div className="sticky top-0 z-10 flex items-center gap-2 bg-card/95 px-3 py-1.5 backdrop-blur">
              <Globe className="h-3 w-3 text-primary" />
              <span className="text-[10px] font-semibold uppercase tracking-wide">
                {country}
              </span>
              <Badge variant="secondary" className="text-[8px] px-1 py-0">
                {items.length}
              </Badge>
            </div>
            <table className="w-full text-[10px]">
              <thead>
                <tr className="border-b border-border/30 text-left">
                  <th className="px-3 pb-1 font-medium text-muted-foreground">Indicator</th>
                  <th className="pb-1 font-medium text-muted-foreground text-right">Latest</th>
                  <th className="pb-1 font-medium text-muted-foreground text-right">Prior</th>
                  <th className="pb-1 font-medium text-muted-foreground text-right">Change</th>
                  <th className="pb-1 font-medium text-muted-foreground text-right">Forecast</th>
                  <th className="pb-1 font-medium text-muted-foreground text-right">Date</th>
                  <th className="pb-1 font-medium text-muted-foreground">Source</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.key} className="border-b border-border/20 hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-1.5 font-medium">{r.label}</td>
                    <td className="py-1.5 text-right font-mono font-semibold tabular-nums">
                      {priceFmt(r.value, r.unit)}
                    </td>
                    <td className="py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                      {r.priorValue != null ? priceFmt(r.priorValue, r.unit) : "—"}
                    </td>
                    <td className="py-1.5 text-right font-mono tabular-nums">
                      {r.changePct != null ? (
                        <span
                          className={
                            r.changePct > 0
                              ? "text-green-500"
                              : r.changePct < 0
                              ? "text-red-500"
                              : "text-muted-foreground"
                          }
                        >
                          {r.changePct > 0 ? "+" : ""}{r.changePct.toFixed(2)}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                      {r.forecast != null ? priceFmt(r.forecast, r.unit) : "—"}
                    </td>
                    <td className="py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                      {r.releaseDate ?? r.date}
                    </td>
                    <td className="py-1.5 text-muted-foreground">{r.source ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
      <div className="border-t border-border bg-muted/20 px-3 py-1.5">
        <div className="flex items-center gap-1.5 text-[9px]">
          <Clock className="h-2.5 w-2.5 text-muted-foreground" />
          <span className="font-semibold text-muted-foreground">Recent Market Events</span>
          <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-0.5">
            {data.news.slice(0, 6).map((n) => (
              <div key={n.headline} className="flex items-center gap-1.5">
                <Badge
                  variant="outline"
                  className={
                    "text-[8px] px-1 py-0 " +
                    (n.sentiment === "bullish"
                      ? "text-green-600 border-green-600/30"
                      : n.sentiment === "bearish"
                      ? "text-red-500 border-red-500/30"
                      : "text-muted-foreground")
                  }
                >
                  {n.sentiment}
                </Badge>
                <span className="text-muted-foreground">[{n.source}]</span>
                <span className="truncate max-w-[200px]">{n.headline}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Market overview (real macro + market breadth) ───────────────────────────────
export function NativeMarketOverview({ height = 450 }: { height?: number }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const { data, isLoading, isError } = useQuery<{
    market: MacroIndicator[];
    breadth: { bullish: number; bearish: number; neutral: number };
  }>({
    queryKey: ["market-overview", refreshKey],
    queryFn: async () => {
      const [m, ranks] = await Promise.all([
        fetch("/api/macro").then((r) => r.json()),
        fetch("/api/rankings?pageSize=100&page=1").then((r) => r.json()),
      ]);
      const breadth = { bullish: 0, bearish: 0, neutral: 0 };
      for (const row of ranks.rows) {
        if (row.priceChange > 0) breadth.bullish++;
        else if (row.priceChange < 0) breadth.bearish++;
        else breadth.neutral++;
      }
      return { market: m.market, breadth };
    },
    staleTime: 60_000, // 1 minute — near real-time
    refetchInterval: 60_000, // auto-refresh every 60s
  });

  if (isLoading) return <Skeleton className="h-full w-full" />;
  if (isError || !data?.market?.length)
    return <NoDataMessage label="No market data" />;

  const lastUpdated = data.market[0]?.date
    ? new Date(data.market[0].date).toLocaleTimeString()
    : null;

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold">Market Overview</span>
          <Badge variant="outline" className="text-[9px]">
            {data.market.length} indicators · real-time
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          {lastUpdated && (
            <span className="text-[9px] text-muted-foreground flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" />
              Updated {lastUpdated}
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[9px]"
            onClick={() => setRefreshKey((k) => k + 1)}
          >
            <Activity className="mr-1 h-3 w-3" />
            Refresh
          </Button>
        </div>
      </div>
      <div className="grid flex-1 grid-cols-2 gap-2 p-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {data.market.map((i) => (
          <MarketCard key={i.key} i={i} />
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-border px-3 py-1.5">
        <div className="flex flex-wrap items-center gap-3 text-[10px]">
          <span className="font-semibold text-muted-foreground">NASDAQ Breadth:</span>
          <BreadthBar label="Advancing" value={data.breadth.bullish} color="#22c55e" />
          <BreadthBar label="Declining" value={data.breadth.bearish} color="#ef4444" />
          <BreadthBar label="Unchanged" value={data.breadth.neutral} color="#94a3b8" />
        </div>
      </div>
    </div>
  );
}

function MarketCard({ i }: { i: MacroIndicator }) {
  const up = i.changePct == null ? true : i.changePct >= 0;
  const isIndex = ["sp500", "nasdaq", "dow_jones", "dax", "ftse_100", "nikkei_225", "hang_seng", "bse_sensex", "asx_200", "aex", "swiss_market", "ipc_mexico"].includes(i.key);
  const Icon = isIndex ? TrendingUp : i.type === "market" ? DollarSign : Wind;
  return (
    <div className="flex flex-col justify-between rounded border border-border bg-card/50 px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3 w-3 text-muted-foreground" />
        <span className="truncate">{i.label}</span>
      </div>
      <div className="text-right font-mono">
        <div className={i.changePct != null && i.changePct < 0 ? "text-red-500" : i.changePct != null && i.changePct > 0 ? "text-green-600" : ""}>
          {priceFmt(i.value, i.unit)}
        </div>
        <div className="flex items-center justify-end gap-1 text-[9px]">
          {i.changePct != null && (
            <span className={up ? "text-green-600" : "text-red-500"}>
              {up ? "+" : ""}{i.changePct.toFixed(2)}%
            </span>
          )}
          {i.priorValue != null && (
            <span className="text-muted-foreground">
              P: {priceFmt(i.priorValue, i.unit)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function BreadthBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-18 text-muted-foreground">{label}</span>
      <span className="font-mono" style={{ color }}>
        {value}
      </span>
    </div>
  );
}

// ── Technical panel (replaces TV Technical Analysis tab — real indicators) ────────
export function NativeTechnicalPanel({ ticker }: { ticker: string }) {
  const {
    data,
    isLoading,
    isError,
  } = useQuery<{ ticker: string; bars: CandleBar[] }>({
    queryKey: ["technical", ticker],
    queryFn: async () => fetch(`/api/candles/${ticker}?range=3M`).then((r) => r.json()),
    enabled: !!ticker,
    staleTime: 5 * 60_000,
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (isError || !data?.bars?.length)
    return <NoDataMessage label="No candle data" />;

  const bars = data.bars as CandleBar[];
  const closes = bars.map((b) => b.close);
  const ret = returns(closes);
  const r14 = rsi(closes, 14);
  const mv = macd(closes);
  const bb = bollingerPercentB(closes, 20, 2);
  const a = adx(bars, 14);
  const v = atr(bars, 14);
  const w = williamsR(bars, 14);
  const rc = roc(closes, 12);
  const recent = ret.slice(-30);
  const vol =
    Math.sqrt(recent.reduce((s, r) => s + r * r, 0) / Math.max(1, recent.length)) *
    100 *
    Math.sqrt(252);

  const items = [
    { label: "RSI(14)", value: r14 != null ? r14.toFixed(1) : "—", sub: band(r14) },
    { label: "MACD Histogram", value: mv ? mv.histogram.toFixed(3) : "—" },
    { label: "Bollinger %B", value: bb != null ? bb.toFixed(1) : "—" },
    { label: "ADX(14)", value: a != null ? a.toFixed(1) : "—" },
    { label: "ATR(14)", value: v != null ? priceFmt(v) : "—" },
    { label: "Williams %R", value: w != null ? w.toFixed(1) : "—" },
    { label: "ROC(12)", value: rc != null ? pctFmt(rc) : "—" },
    { label: "30-day Volatility", value: `${vol.toFixed(1)}%` },
  ];

  return (
    <div className="space-y-3 text-[10px]">
      <div className="flex items-center justify-between">
        <span className="font-semibold">
          Real Technical Indicators (computed from real candles)
        </span>
        <Badge variant="outline" className="text-[9px]">
          window {bars[0].date} → {bars[bars.length - 1].date}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {items.map((it) => (
          <div key={it.label} className="rounded border border-border bg-card p-2">
            <div className="text-muted-foreground">{it.label}</div>
            <div className="font-mono text-lg">{it.value}</div>
            {it.sub && (
              <div className="mt-0.5 text-[8px] text-muted-foreground">{it.sub}</div>
            )}
          </div>
        ))}
      </div>
      <div className="text-[8px] text-muted-foreground">
        BedaanWaves technical score (per-symbol ML weights) lives in the Coefficients
        &amp; Decomposition tabs. These indicators are display-only (spec §12).
      </div>
    </div>
  );
}
