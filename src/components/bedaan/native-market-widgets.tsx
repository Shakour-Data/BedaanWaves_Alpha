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
import { AlertTriangle, Activity, DollarSign, Wind } from "lucide-react";
import { ResponsiveContainer, Treemap } from "recharts";
import {
  sma,
  rsi,
  macd,
  bollingerPercentB,
  adx,
  atr,
  williamsR,
  roc,
  returns,
} from "@/lib/technical-indicators";
import type { MacroIndicator } from "@/lib/real-store";

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

  const closes = bars.map((b) => b.close);
  const rsiV = closes.length > 14 ? rsi(closes, 14) : null;
  const macdV = macd(closes);
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);

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
        <CandleSvg bars={bars} height={height - 42} />
      )}
    </div>
  );
}

function IndicatorStrip({
  items,
}: {
  items: Array<{ label: string; value: string; sub?: string }>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded border border-border bg-card/50 px-2 py-1.5 text-[10px]">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          <span className="text-muted-foreground">{it.label}:</span>
          <span className="font-mono">{it.value}</span>
          {it.sub && <span className="text-[8px] text-muted-foreground">({it.sub})</span>}
        </span>
      ))}
    </div>
  );
}

function CandleSvg({ bars, height }: { bars: CandleBar[]; height: number }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const plotW = 760;
  const MARGIN = { top: 24, right: 48, bottom: 34, left: 56 };
  const fullH = Math.max(height, 260);
  const volH = Math.max(fullH * 0.32, 60);
  const candlePlotH = fullH - volH - MARGIN.top - 8;
  const volPlotH = volH - 16;

  const minPrice = Math.min(...bars.map((b) => b.low));
  const maxPrice = Math.max(...bars.map((b) => b.high));
  const rng = maxPrice - minPrice || maxPrice || 1;
  const pad = rng * 0.08;
  const hi = maxPrice + pad;
  const lo = minPrice - pad;
  const yPx = (v: number) => MARGIN.top + ((hi - v) / (hi - lo)) * candlePlotH;

  const n = bars.length;
  const slot = plotW / n;
  const bodyW = Math.max(slot * 0.6, 2);
  const maxVol = Math.max(...bars.map((b) => b.volume), 1);

  const h = hoverIdx != null ? bars[hoverIdx] : bars[bars.length - 1];
  const up = (h?.close ?? 0) >= (h?.open ?? 0);

  return (
    <div
      className="relative w-full cursor-crosshair overflow-hidden"
      onMouseLeave={() => setHoverIdx(null)}
    >
      <svg
        viewBox={`0 0 ${plotW + MARGIN.left + MARGIN.right} ${fullH}`}
        className="block h-full w-full"
      >
        {/* price grid + y labels */}
        {[0, 25, 50, 75, 100].map((p) => {
          const v = lo + (hi - lo) * (p / 100);
          const y = MARGIN.top + (p / 100) * candlePlotH;
          return (
            <g key={p} transform={`translate(0,${y})`}>
              <line
                x1={MARGIN.left}
                x2={plotW + MARGIN.left}
                stroke="#e2e8f0"
                strokeWidth={1}
              />
              <text
                x={MARGIN.left - 6}
                y={12}
                textAnchor="end"
                fontSize={10}
                fill="#94a3b8"
              >
                {priceFmt(v)}
              </text>
            </g>
          );
        })}

        {/* candles */}
        {bars.map((b, i) => {
          const x = MARGIN.left + (i + 0.5) * slot;
          const isUp = b.close >= b.open;
          const bodyFill = isUp
            ? "rgba(34,197,94,0.85)"
            : "rgba(239,68,68,0.85)";
          return (
            <g key={i} onMouseMove={() => setHoverIdx(i)}>
              <line
                x1={x}
                x2={x}
                y1={yPx(b.high)}
                y2={yPx(b.low)}
                stroke={isUp ? "#22c55e" : "#ef4444"}
                strokeWidth={1}
              />
              <rect
                x={x - bodyW / 2}
                y={Math.min(yPx(b.open), yPx(b.close))}
                width={bodyW}
                height={Math.max(Math.abs(yPx(b.close) - yPx(b.open)), 1)}
                fill={bodyFill}
                stroke={isUp ? "#22c55e" : "#ef4444"}
                strokeWidth={0.5}
                rx={1}
              />
            </g>
          );
        })}

        {/* hover guide + annotation */}
        {hoverIdx != null && (
          <>
            <line
              x1={MARGIN.left + (hoverIdx + 0.5) * slot}
              x2={MARGIN.left + (hoverIdx + 0.5) * slot}
              y1={MARGIN.top}
              y2={MARGIN.top + candlePlotH}
              stroke="#cbd5e1"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <foreignObject
              x={MARGIN.left + (hoverIdx + 0.5) * slot + 6}
              y={MARGIN.top}
              width={160}
              height={82}
            >
              <div className="rounded border border-border bg-background/95 p-1 text-[9px] shadow">
                <div className="font-mono">{h.date}</div>
                <div>O {priceFmt(h.open)}</div>
                <div>H {priceFmt(h.high)}</div>
                <div>L {priceFmt(h.low)}</div>
                <div className={up ? "text-green-600" : "text-red-500"}>
                  C {priceFmt(h.close)} ({pctFmt(((h.close - h.open) / h.open) * 100)})
                </div>
                <div>Vol {Math.round(h.volume / 1e6)}M</div>
              </div>
            </foreignObject>
          </>)}

        {/* volume histogram */}
        {bars.map((b, i) => {
          const vh = (b.volume / maxVol) * volPlotH;
          const isUp = b.close >= b.open;
          return (
            <rect
              key={i}
              x={MARGIN.left + (i + 0.5) * slot - bodyW / 2}
              y={fullH - volPlotH - 8 + (volPlotH - vh)}
              width={bodyW}
              height={Math.max(vh, 0.5)}
              fill={isUp ? "rgba(34,197,94,0.55)" : "rgba(239,68,68,0.55)"}
            />
          );
        })}

        {/* x labels */}
        <text x={MARGIN.left} y={fullH - 4} fontSize={10} fill="#94a3b8">
          {bars[0].date}
        </text>
        <text
          x={plotW + MARGIN.left}
          y={fullH - 4}
          textAnchor="end"
          fontSize={10}
          fill="#94a3b8"
        >
          {bars[bars.length - 1].date}
        </text>
      </svg>
      <div className="absolute bottom-1 right-2 text-[9px] text-muted-foreground">
        Source: yfinance · real, corporate-action adjusted (spec §1.1)
      </div>
    </div>
  );
}

interface HeatmapRow {
  ticker: string;
  name: string;
  price: number;
  priceChange: number;
  marketCap: number;
  grade: string;
  overall: number;
  sector: string;
}

// ── Heatmap (treemap by market cap, colored by real daily Δ%) ────────────────────
export function NativeHeatmap({ height = 600 }: { height?: number }) {
  const { data, isLoading, isError } = useQuery<{
    rows: HeatmapRow[];
    total: number;
    latestAt: string;
  }>({
    queryKey: ["heatmap-rankings"],
    queryFn: async () => {
      const r = await fetch("/api/rankings?pageSize=100&page=1");
      const j = await r.json();
      return { rows: j.rows, total: j.total, latestAt: j.latestAt };
    },
    staleTime: 5 * 60_000,
  });

  if (isLoading) return <Skeleton className="h-full w-full" />;
  if (isError || !data?.rows?.length) return <NoDataMessage label="No ranking data" />;

  const maxAbs = Math.max(1, ...data.rows.map((r) => Math.abs(r.priceChange)));
  const colorFor = (pc: number) =>
    pc > 0
      ? `rgba(34,197,94,${Math.max(0.25, Math.min(0.9, pc / maxAbs))})`
      : `rgba(239,68,68,${Math.max(0.25, Math.min(0.9, Math.abs(pc) / maxAbs))})`;

  const treeData = data.rows
    .slice()
    .sort((a, b) => b.marketCap - a.marketCap)
    .map((r) => ({
      name: r.ticker,
      value: r.marketCap,
      priceChange: r.priceChange,
      overall: r.overall,
      grade: r.grade,
      price: r.price,
    }));

  return (
    <div className="h-full w-full">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span>
          {data.total} real NASDAQ tickers · market-cap weighted · colored by real daily Δ%
        </span>
        <span className="text-[9px] text-muted-foreground">
          as of {new Date(data.latestAt).toLocaleDateString()}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={height - 40}>
        <Treemap
          data={treeData}
          dataKey="value"
          stroke="#ffffff22"
          isAnimationActive={true}
          content={<HeatTile colorFor={colorFor} />}
        />
      </ResponsiveContainer>
      <div className="mt-2 flex items-center justify-end gap-3 text-[9px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="block h-2 w-4 rounded bg-green-500/70" /> up
        </span>
        <span className="flex items-center gap-1">
          <span className="block h-2 w-4 rounded bg-red-500/70" /> down
        </span>
      </div>
    </div>
  );
}

interface HeatTileProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  priceChange?: number;
  colorFor: (pc: number) => string;
}
function HeatTile(props: HeatTileProps) {
  const { x, y, width, height, name, priceChange, colorFor } = props;
  // recharts clones this element with the layout node's fields spread as props
  // (x, y, width, height, name, priceChange, ...). Render only real leaf tiles;
  // skip the synthetic root (no `name`) and sub-16px slivers.
  if (!name || !x || !y || !width || !height || width < 16 || height < 16)
    return null;
  const pc = priceChange ?? 0;
  const fill = colorFor(pc);
  return (
    <g className="treemap-tile" style={{ cursor: "pointer" }}>
      <rect x={x} y={y} width={width} height={height} fill={fill} rx={3} />
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
      {height > 30 && (
        <text
          x={x + 3}
          y={y + height - 5}
          fontSize={8}
          fill="#ffffffdd"
          pointerEvents="none"
        >
          {pc > 0 ? "+" : ""}
          {pc.toFixed(1)}%
        </text>
      )}
    </g>
  );
}

// ── Economic calendar (real published government statistics + recent news) ─────
export function NativeEconomicCalendar({ height = 450 }: { height?: number }) {
  const { data, isLoading, isError } = useQuery<{
    releases: MacroIndicator[];
    news: Array<{ headline: string; source: string; publishedAt: string; sentiment: string; tickers: string[] }>;
  }>({
    queryKey: ["macro-calendar"],
    queryFn: async () => {
      const [m, n] = await Promise.all([
        fetch("/api/macro").then((r) => r.json()),
        fetch("/api/news").then((r) => r.json()),
      ]);
      return { releases: m.releases, news: n.items ?? [] };
    },
    staleTime: 10 * 60_000,
  });

  if (isLoading) return <Skeleton className="h-full w-full" />;
  if (isError || !data?.releases?.length) return <NoDataMessage label="No economic data" />;

  return (
    <div className="h-full w-full">
      <div className="mb-2 text-xs text-muted-foreground">
        Real published statistics — sources: {data.releases[0]?.source ?? "—"}
      </div>
      <div className="overflow-y-auto" style={{ height: height - 24 }}>
        <table className="w-full text-[10px]">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="pb-1 font-medium text-muted-foreground">Release</th>
              <th className="pb-1 font-medium text-muted-foreground">Latest</th>
              <th className="pb-1 font-medium text-muted-foreground">Date</th>
              <th className="pb-1 font-medium text-muted-foreground">Source</th>
            </tr>
          </thead>
          <tbody>
            {data.releases.map((r) => (
              <tr key={r.key} className="border-b border-border/40">
                <td className="py-1">{r.label}</td>
                <td className="py-1 font-mono">
                  {priceFmt(r.value, r.unit)}{" "}
                  {r.changePct != null && (
                    <span
                      className={r.changePct >= 0 ? "text-green-600" : "text-red-500"}
                    >
                      ({r.changePct >= 0 ? "+" : ""}
                      {r.changePct.toFixed(2)}%)
                    </span>
                  )}
                </td>
                <td className="py-1 text-muted-foreground">
                  {r.releaseDate ?? r.date}
                </td>
                <td className="py-1 text-muted-foreground">{r.source ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 border-t border-border pt-2">
        <div className="mb-1 text-[10px] font-semibold">Recent Market Events</div>
        <div className="flex flex-col gap-1 overflow-y-auto text-[10px]">
          {data.news.slice(0, 6).map((n) => (
            <div key={n.headline} className="flex items-start gap-2">
              <Badge
                variant="outline"
                className={
                  "text-[9px] " +
                  (n.sentiment === "bullish"
                    ? "text-green-600"
                    : n.sentiment === "bearish"
                    ? "text-red-500"
                    : "text-muted-foreground")
                }
              >
                {n.sentiment.toUpperCase()}
              </Badge>
              <span className="text-muted-foreground">[{n.source}]</span>
              <span>{n.headline}</span>
              {n.tickers.length > 0 && (
                <span className="text-muted-foreground">
                  [{n.tickers.join(" ")}]
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Market overview (real macro + market breadth) ───────────────────────────────
export function NativeMarketOverview({ height = 450 }: { height?: number }) {
  const { data, isLoading, isError } = useQuery<{
    market: MacroIndicator[];
    breadth: { bullish: number; bearish: number; neutral: number };
  }>({
    queryKey: ["market-overview"],
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
    staleTime: 5 * 60_000,
  });

  if (isLoading) return <Skeleton className="h-full w-full" />;
  if (isError || !data?.market?.length)
    return <NoDataMessage label="No market data" />;

  return (
    <div className="h-full w-full">
      <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {data.market.map((i) => (
          <MarketCard key={i.key} i={i} />
        ))}
      </div>
      <div className="border-t border-border pt-2">
        <div className="mb-1 text-[10px] font-semibold">
          NASDAQ Breadth (real latest day)
        </div>
        <div className="flex flex-wrap items-center gap-4 text-[10px]">
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
  const Icon = i.type === "market" ? DollarSign : Wind;
  return (
    <div className="flex items-center justify-between rounded border border-border bg-card/50 px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3 w-3 text-muted-foreground" />
        <span>{i.label}</span>
      </div>
      <div className="text-right font-mono">
        <div>{priceFmt(i.value, i.unit)}</div>
        {i.changePct != null && (
          <span className={up ? "text-green-600" : "text-red-500"}>
            {up ? "+" : ""}
            {i.changePct.toFixed(2)}%
          </span>
        )}
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
