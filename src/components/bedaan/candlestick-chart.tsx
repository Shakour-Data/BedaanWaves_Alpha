"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Minus,
  Plus,
  Radio,
  X,
} from "lucide-react";
import {
  ema as calcEma,
  sma as calcSma,
} from "@/lib/technical-indicators";
import type { Bar } from "@/lib/technical-indicators";

// ── Types ──────────────────────────────────────────────────────
interface CandlestickChartProps {
  bars: Bar[];
  ticker: string;
  height?: number;
}

type ChartType = "candle" | "ohlc" | "line" | "mountain";
type DrawTool =
  | "cursor"
  | "trendline"
  | "hline"
  | "vline"
  | "ray"
  | "fib-retrace"
  | "fib-extension"
  | "parallel-channel";

interface Pt {
  x: number;
  y: number;
}

interface Drawing {
  id: string;
  type: DrawTool;
  points: Pt[];
  color: string;
  levels?: { price: number; pct: string }[];
}

// ── Constants ──────────────────────────────────────────────────
const UP_FILL = "rgba(34,197,94,0.85)";
const UP_COLOR = "#26a69a";
const DOWN_FILL = "rgba(239,68,68,0.85)";
const DOWN_COLOR = "#ef5350";
const FIB_LEVELS = ["0.0", "23.6", "38.2", "50.0", "61.8", "78.6", "100.0"];
const EXT_LEVELS = ["0.0", "38.2", "50.0", "61.8", "100.0", "161.8", "261.8"];

// ── Helpers ────────────────────────────────────────────────────
function clamp(v: number, mn: number, mx: number) {
  return Math.max(mn, Math.min(mx, v));
}
function fmtP(v: number) {
  const a = Math.abs(v);
  if (a >= 10000) return v.toFixed(0);
  if (a >= 1000) return v.toFixed(2);
  if (a >= 1) return v.toFixed(2);
  if (a >= 0.01) return v.toFixed(4);
  return v.toFixed(6);
}

const CHART_TYPES: ChartType[] = ["candle", "ohlc", "line", "mountain"];
const TYPE_LABELS: Record<ChartType, string> = {
  candle: "Candles", ohlc: "OHLC", line: "Line", mountain: "Mountain",
};
const DRAW_TOOLS: { id: DrawTool; label: string; title: string }[] = [
  { id: "cursor", label: "Cursor", title: "Cursor / Select" },
  { id: "trendline", label: "Trend", title: "Trend Line" },
  { id: "hline", label: "H-Line", title: "Horizontal Line" },
  { id: "vline", label: "V-Line", title: "Vertical Line" },
  { id: "ray", label: "Ray", title: "Ray" },
  { id: "fib-retrace", label: "Fib", title: "Fibonacci Retracement" },
  { id: "fib-extension", label: "FibExt", title: "Fibonacci Extension" },
  { id: "parallel-channel", label: "Channel", title: "Parallel Channel" },
];

export { CHART_TYPES, TYPE_LABELS };

// ══════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ══════════════════════════════════════════════════════════
export function CandlestickChart({
  bars,
  ticker,
  height = 500,
}: CandlestickChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [chartType, setChartType] = useState<ChartType>("candle");
  const [activeTool, setActiveTool] = useState<DrawTool>("cursor");
  const [showSMA9, setShowSMA9] = useState(true);
  const [showSMA20, setShowSMA20] = useState(true);
  const [showSMA50, setShowSMA50] = useState(true);
  const [showEMA12, setShowEMA12] = useState(false);
  const [showEMA26, setShowEMA26] = useState(false);
  const [showBB, setShowBB] = useState(false);
  const [showPriceLine, setShowPriceLine] = useState(true);
  const [showHiLo, setShowHiLo] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);

  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [draftPts, setDraftPts] = useState<Pt[]>([]);
  const [selectedDraw, setSelectedDraw] = useState<string | null>(null);

  const [visibleBars, setVisibleBars] = useState(Math.max(40, bars.length));
  const [panOffset, setPanOffset] = useState(0);

  const [mouseSvg, setMouseSvg] = useState<Pt | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef<{ x: number; po: number } | null>(null);

  const chartW = 900;
  const chartH = height;
  const M = { top: 28, right: 64, bottom: 28, left: 56 };
  const plotW = chartW - M.left - M.right;
  const plotH = chartH - M.top - M.bottom;

  const visBars = useMemo(() => {
    if (bars.length === 0) return [];
    if (autoScroll) { const n = clamp(visibleBars, 5, bars.length); return bars.slice(bars.length - n); }
    const n = clamp(visibleBars, 5, bars.length);
    const s = clamp(panOffset, 0, bars.length - n);
    return bars.slice(s, s + n);
  }, [bars, visibleBars, panOffset, autoScroll]);

  const { hi, lo, yPx, pAtY } = useMemo(() => {
    if (visBars.length === 0) return { hi: 100, lo: 0, yPx: (_: number) => 0, pAtY: (_: number) => 0 };
    let mn = Infinity, mx = -Infinity;
    for (const b of visBars) { if (b.low < mn) mn = b.low; if (b.high > mx) mx = b.high; }
    if (mn === Infinity) { mn = 0; mx = 100; }
    const rng = mx - mn || 1; const pad = rng * 0.06;
    const hi2 = mx + pad, lo2 = mn - pad;
    const yPx2 = (v: number) => M.top + ((hi2 - v) / (hi2 - lo2)) * plotH;
    const pAtY2 = (y: number) => hi2 - ((y - M.top) / plotH) * (hi2 - lo2);
    return { hi: hi2, lo: lo2, yPx: yPx2, pAtY: pAtY2 };
  }, [visBars, plotH]);

  const lastClose = visBars.length > 0 ? visBars[visBars.length - 1].close : 0;
  const slot = plotW / Math.max(visBars.length, 1);
  const bodyW = Math.max(slot * 0.65, 1.5);

  const toSvg = useCallback((cx: number, cy: number): Pt | null => {
    const el = svgRef.current; if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: ((cx - r.left) / r.width) * chartW, y: ((cy - r.top) / r.height) * chartH };
  }, [chartW, chartH]);

  const inPlot = (p: Pt) => p.x >= M.left && p.x <= chartW - M.right && p.y >= M.top && p.y <= chartH - M.bottom;
  const barIdxAt = (x: number) => clamp(Math.floor((x - M.left) / slot), 0, visBars.length - 1);

  const indicators = useMemo(() => {
    const closes = visBars.map((b) => b.close);
    const prev = bars.length > visBars.length ? bars[bars.length - visBars.length - 1]?.close : closes[0];
    const full = [...(prev ? [prev] : []), ...closes];
    return {
      sma9: visBars.map((_, i) => calcSma(closes.slice(0, i + 1), 9)),
      sma20: visBars.map((_, i) => calcSma(closes.slice(0, i + 1), 20)),
      sma50: visBars.map((_, i) => calcSma(closes.slice(0, i + 1), 50)),
      ema12: visBars.map((_, i) => calcEma(full.slice(-30), 12)),
      ema26: visBars.map((_, i) => calcEma(full.slice(-30), 26)),
      bbUp: visBars.map((_, i) => {
        if (full.length < 20 + i) return null;
        const s = full.slice(0, i + 1).slice(-20);
        const m = s.reduce((a, b) => a + b, 0) / 20;
        const sd = Math.sqrt(s.reduce((a, b) => a + (b - m) ** 2, 0) / 20);
        return m + 2 * sd;
      }),
      bbLo: visBars.map((_, i) => {
        if (full.length < 20 + i) return null;
        const s = full.slice(0, i + 1).slice(-20);
        const m = s.reduce((a, b) => a + b, 0) / 20;
        const sd = Math.sqrt(s.reduce((a, b) => a + (b - m) ** 2, 0) / 20);
        return m - 2 * sd;
      }),
    };
  }, [visBars, bars]);

  const rsiVal = useMemo(() => {
    const c = visBars.map((b) => b.close);
    if (c.length < 15) return null;
    let g = 0, l = 0;
    for (let i = c.length - 14; i < c.length; i++) { const ch = c[i] - c[i - 1]; if (ch > 0) g += ch; else l -= ch; }
    return l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }, [visBars]);

  const maxPts = useCallback((t: DrawTool): number => {
    if (t === "hline" || t === "vline") return 1;
    if (t === "trendline" || t === "ray" || t === "fib-retrace" || t === "parallel-channel") return 2;
    if (t === "fib-extension") return 3;
    return 0;
  }, []);

  const addDrawing = useCallback((tool: DrawTool, pts: Pt[]) => {
    const colors: Record<DrawTool, string> = { cursor: "#fff", trendline: "#f59e0b", hline: "#3b82f6", vline: "#3b82f6", ray: "#8b5cf6", "fib-retrace": "#22c55e", "fib-extension": "#a855f7", "parallel-channel": "#ef4444" };
    const levels: { price: number; pct: string }[] = [];
    if (tool === "fib-retrace" && pts.length >= 2) {
      const a = pAtY(pts[0].y), b = pAtY(pts[1].y);
      const hi2 = Math.max(a, b), lo2 = Math.min(a, b);
      FIB_LEVELS.forEach((l) => { const v = parseFloat(l); levels.push({ price: lo2 + (hi2 - lo2) * (v / 100), pct: l }); });
    }
    if (tool === "fib-extension" && pts.length >= 3) {
      const a = pAtY(pts[0].y), b = pAtY(pts[1].y), c = pAtY(pts[2].y);
      const rng = b - a;
      EXT_LEVELS.forEach((l) => { const v = parseFloat(l); levels.push({ price: c + rng * (v / 100), pct: l }); });
    }
    const d: Drawing = { id: Math.random().toString(36).slice(2, 9), type: tool, points: pts.map((p) => ({ x: p.x - M.left, y: p.y - M.top })), color: colors[tool] ?? "#fff", levels };
    setDrawings((p) => [...p, d]);
    setDraftPts([]);
    setActiveTool("cursor");
  }, [pAtY]);

  const cancelDraft = useCallback(() => { setDraftPts([]); setActiveTool("cursor"); }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const pt = toSvg(e.clientX, e.clientY); if (pt) setMouseSvg(pt);
    if (isDragging && dragStart.current) {
      const ds = dragStart.current;
      const dx = e.clientX - ds.x;
      const bpp = clamp(visibleBars, 5, bars.length) / plotW;
      const bd = Math.round(dx * bpp);
      const mx2 = Math.max(0, bars.length - clamp(visibleBars, 5, bars.length));
      setPanOffset((p) => clamp(ds.po - bd, 0, mx2));
    }
  }, [isDragging, toSvg, visibleBars, bars.length, plotW]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (activeTool === "cursor") { setIsDragging(true); dragStart.current = { x: e.clientX, po: panOffset }; return; }
    const pt = toSvg(e.clientX, e.clientY); if (!pt || !inPlot(pt)) return;
    const mx = maxPts(activeTool); const all = [...draftPts, pt];
    if (all.length >= mx) addDrawing(activeTool, all); else setDraftPts(all);
  }, [activeTool, draftPts, toSvg, inPlot, maxPts, addDrawing, panOffset]);

  const handleMouseUp = useCallback(() => { setIsDragging(false); dragStart.current = null; }, []);
  const handleMouseLeave = useCallback(() => { setMouseSvg(null); setIsDragging(false); dragStart.current = null; }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault(); if (bars.length === 0) return;
    if (e.ctrlKey || e.metaKey) { setVisibleBars((p) => clamp(p + (e.deltaY > 0 ? 5 : -5), 10, bars.length)); }
    else { const d = e.deltaY > 0 ? 3 : -3; const mx = Math.max(0, bars.length - clamp(visibleBars, 5, bars.length)); setPanOffset((p) => clamp(p + d, 0, mx)); }
  }, [bars.length, visibleBars]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const mx = Math.max(0, bars.length - clamp(visibleBars, 5, bars.length));
    if (e.key === "ArrowRight") setPanOffset((p) => clamp(p + Math.floor(visibleBars * 0.1), 0, mx));
    else if (e.key === "ArrowLeft") setPanOffset((p) => clamp(p - Math.floor(visibleBars * 0.1), 0, mx));
    else if (e.key === "+" || e.key === "=") setVisibleBars((v) => clamp(v + 10, 10, bars.length));
    else if (e.key === "-") setVisibleBars((v) => clamp(v - 10, 10, bars.length));
    else if (e.key === "End") setAutoScroll(true);
    else if (e.key === "Home") { setAutoScroll(false); setPanOffset(0); }
    else if (e.key === "Enter" && draftPts.length >= maxPts(activeTool)) addDrawing(activeTool, draftPts);
    else if (e.key === "Escape") cancelDraft();
  }, [bars.length, visibleBars, draftPts, activeTool, maxPts, addDrawing, cancelDraft]);

  if (bars.length === 0) return <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No data</div>;

  const mY = mouseSvg ? pAtY(mouseSvg.y) : null;
  const mIdx = mouseSvg ? barIdxAt(mouseSvg.x) : null;
  const mBar = mIdx != null && mIdx >= 0 && mIdx < visBars.length ? visBars[mIdx] : null;
  const isDrawing = activeTool !== "cursor" && draftPts.length === 0;

  return (
    <div className="flex h-full w-full flex-col">
      <Toolbar
        chartType={chartType} setChartType={setChartType}
        activeTool={activeTool} setActiveTool={(t) => { setActiveTool(t); setDraftPts([]); }}
        showSMA9={showSMA9} setShowSMA9={setShowSMA9}
        showSMA20={showSMA20} setShowSMA20={setShowSMA20}
        showSMA50={showSMA50} setShowSMA50={setShowSMA50}
        showEMA12={showEMA12} setShowEMA12={setShowEMA12}
        showEMA26={showEMA26} setShowEMA26={setShowEMA26}
        showBB={showBB} setShowBB={setShowBB}
        showPriceLine={showPriceLine} setShowPriceLine={setShowPriceLine}
        showHiLo={showHiLo} setShowHiLo={setShowHiLo}
        autoScroll={autoScroll} setAutoScroll={setAutoScroll}
        visibleBars={visibleBars} barsLength={bars.length}
        onZoomIn={() => setVisibleBars((v) => clamp(v + 15, 10, bars.length))}
        onZoomOut={() => setVisibleBars((v) => clamp(v - 15, 10, bars.length))}
        onReset={() => { setVisibleBars(Math.max(40, bars.length)); setPanOffset(0); setAutoScroll(true); }}
        drawings={drawings} selectedDraw={selectedDraw} onSelectDraw={(id) => setSelectedDraw(id)}
        onDeleteDraw={(id) => setDrawings((p) => p.filter((d) => d.id !== id))}
      />
      <div className="flex items-center gap-3 py-0.5 text-[9px]">
        <span className="text-muted-foreground">RSI(14):</span>
        <span className="font-mono">{rsiVal != null ? rsiVal.toFixed(1) : "—"}</span>
        {rsiVal != null && <span className={rsiVal >= 70 ? "text-red-600" : rsiVal <= 30 ? "text-green-600" : "text-muted-foreground"}>({rsiVal >= 70 ? "overbought" : rsiVal <= 30 ? "oversold" : "neutral"})</span>}
        <span className="ml-auto text-[8px] text-muted-foreground">{visBars.length} bars · {visBars[0]?.date} → {visBars[visBars.length - 1]?.date}</span>
        {isDrawing && <span className="text-[9px] text-amber-600 font-semibold">Click to place points…</span>}
      </div>
      <ChartSvg
        svgRef={svgRef} containerRef={containerRef}
        chartW={chartW} chartH={chartH} M={M} plotW={plotW} plotH={plotH}
        visBars={visBars} slot={slot} bodyW={bodyW} hi={hi} lo={lo} yPx={yPx} pAtY={pAtY}
        chartType={chartType} showSMA9={showSMA9} sma9={indicators.sma9}
        showSMA20={showSMA20} sma20={indicators.sma20}
        showSMA50={showSMA50} sma50={indicators.sma50}
        showEMA12={showEMA12} ema12={indicators.ema12}
        showEMA26={showEMA26} ema26={indicators.ema26}
        showBB={showBB} bbUp={indicators.bbUp} bbLo={indicators.bbLo}
        showPriceLine={showPriceLine} lastClose={lastClose} showHiLo={showHiLo}
        drawings={drawings} selectedDraw={selectedDraw} onSelectDraw={(id) => setSelectedDraw(id)}
        draftPts={draftPts} activeTool={activeTool}
        mouseSvg={mouseSvg} isDragging={isDragging} mY={mY} mBar={mBar} isDrawing={isDrawing} ticker={ticker}
        onMouseMove={handleMouseMove} onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp} onMouseLeave={handleMouseLeave} onWheel={handleWheel} onKeyDown={handleKeyDown}
      />
    </div>
  );
}

// ══════════════════════════════════════════════════════════
//  TOOLBAR
// ══════════════════════════════════════════════════════════
function ToggleBtn({ a }: { a: { active: boolean; onClick: () => void; label: string; title: string; color?: string } }) {
  return (
    <Button size="sm" variant={a.active ? "default" : "ghost"} className="h-6 px-2 text-[9px]"
      style={a.active && a.color ? { backgroundColor: a.color, borderColor: a.color, color: "#fff" } : undefined}
      onClick={a.onClick} title={a.title}>{a.label}</Button>
  );
}
function Sep() { return <div className="mx-1 h-5 w-px bg-border" />; }


function Toolbar(props: {
  chartType: ChartType; setChartType: React.Dispatch<React.SetStateAction<ChartType>>;
  activeTool: DrawTool; setActiveTool: React.Dispatch<React.SetStateAction<DrawTool>>;
  showSMA9: boolean; setShowSMA9: React.Dispatch<React.SetStateAction<boolean>>;
  showSMA20: boolean; setShowSMA20: React.Dispatch<React.SetStateAction<boolean>>;
  showSMA50: boolean; setShowSMA50: React.Dispatch<React.SetStateAction<boolean>>;
  showEMA12: boolean; setShowEMA12: React.Dispatch<React.SetStateAction<boolean>>;
  showEMA26: boolean; setShowEMA26: React.Dispatch<React.SetStateAction<boolean>>;
  showBB: boolean; setShowBB: React.Dispatch<React.SetStateAction<boolean>>;
  showPriceLine: boolean; setShowPriceLine: React.Dispatch<React.SetStateAction<boolean>>;
  showHiLo: boolean; setShowHiLo: React.Dispatch<React.SetStateAction<boolean>>;
  autoScroll: boolean; setAutoScroll: React.Dispatch<React.SetStateAction<boolean>>;
  visibleBars: number; barsLength: number;
  onZoomIn: () => void; onZoomOut: () => void; onReset: () => void;
  drawings: Drawing[]; onSelectDraw: (id: string) => void;
  onDeleteDraw: (id: string) => void;
  selectedDraw: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 border-b border-border pb-1.5">
      <div className="flex items-center gap-0.5 rounded border border-border/60 p-0.5">
        {CHART_TYPES.map((t) => (
          <Button key={t} size="sm" variant={props.chartType === t ? "default" : "ghost"} className="h-6 px-2 text-[9px]" onClick={() => props.setChartType(t)}>{TYPE_LABELS[t]}</Button>
        ))}
      </div>
      <Sep />
      <ToggleBtn a={{ active: props.showSMA9, onClick: () => props.setShowSMA9((v) => !v), label: "SMA(9)", title: "SMA 9", color: "#f59e0b" }} />
      <ToggleBtn a={{ active: props.showSMA20, onClick: () => props.setShowSMA20((v) => !v), label: "SMA(20)", title: "SMA 20", color: "#3b82f6" }} />
      <ToggleBtn a={{ active: props.showSMA50, onClick: () => props.setShowSMA50((v) => !v), label: "SMA(50)", title: "SMA 50", color: "#8b5cf6" }} />
      <ToggleBtn a={{ active: props.showEMA12, onClick: () => props.setShowEMA12((v) => !v), label: "EMA(12)", title: "EMA 12", color: "#ef4444" }} />
      <ToggleBtn a={{ active: props.showEMA26, onClick: () => props.setShowEMA26((v) => !v), label: "EMA(26)", title: "EMA 26", color: "#f97316" }} />
      <ToggleBtn a={{ active: props.showBB, onClick: () => props.setShowBB((v) => !v), label: "BB(20,2)", title: "Bollinger Bands", color: "#06b6d4" }} />
      <Sep />
      {DRAW_TOOLS.map((dt) => (
        <Button key={dt.id} size="sm" variant={props.activeTool === dt.id ? "default" : "ghost"} className="h-6 px-2 text-[9px]"
          style={props.activeTool === dt.id ? { backgroundColor: "#4f46e5", borderColor: "#4f46e5" } : undefined}
          onClick={() => props.setActiveTool(dt.id)} title={dt.title}>{dt.label}</Button>
      ))}
      <Sep />
      <ToggleBtn a={{ active: props.showPriceLine, onClick: () => props.setShowPriceLine((v) => !v), label: "LastPrc", title: "Last Price Line", color: "#eab308" }} />
      <ToggleBtn a={{ active: props.showHiLo, onClick: () => props.setShowHiLo((v) => !v), label: "Hi/Lo", title: "High/Low markers", color: "#a855f7" }} />
      <Sep />
      <Button size="sm" variant={props.autoScroll ? "default" : "outline"} className="h-6 px-2 text-[9px]" onClick={() => props.setAutoScroll((v) => !v)} title="Auto-scroll"><Radio className="mr-1 h-3 w-3" />Auto</Button>
      <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[9px]" onClick={props.onReset} title="Reset view"><X className="h-3 w-3" /></Button>
      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-[9px]" onClick={props.onZoomIn} title="Zoom in (+)"><Plus className="h-3 w-3" /></Button>
      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-[9px]" onClick={props.onZoomOut} title="Zoom out (-)"><Minus className="h-3 w-3" /></Button>
      {props.drawings.length > 0 && (
        <div className="flex items-center gap-1 ml-2 border-l border-border pl-2">
          <span className="text-[8px] text-muted-foreground">Draw:</span>
          {props.drawings.map((d) => (
            <button key={d.id} className={`flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[8px] cursor-pointer ${props.selectedDraw === d.id ? "bg-indigo-100 text-indigo-700" : "bg-muted text-muted-foreground hover:bg-muted/80"}`} onClick={() => props.onSelectDraw(d.id)} title={`${d.type} — click to select, Del to remove`}>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
              {d.type === "fib-retrace" && d.levels ? `${d.levels.length}lv` : d.type === "hline" ? "H" : d.type === "vline" ? "V" : d.type === "trendline" ? "T" : d.type === "ray" ? "R" : d.type === "fib-extension" ? "FE" : d.type === "parallel-channel" ? "PC" : "?"}
              {props.selectedDraw === d.id && (
                <X className="h-2.5 w-2.5 ml-0.5" onClick={(e) => { e.stopPropagation(); props.onDeleteDraw(d.id); }} aria-label="Delete" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
//  CHART SVG
// ══════════════════════════════════════════════════════════
const ChartSvg = (props: {
  svgRef: React.RefObject<SVGSVGElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  chartW: number; chartH: number; M: { top: number; right: number; bottom: number; left: number };
  plotW: number; plotH: number;
  visBars: Bar[]; slot: number; bodyW: number; hi: number; lo: number;
  yPx: (v: number) => number; pAtY: (y: number) => number;
  chartType: ChartType;
  showSMA9: boolean; sma9: (number | null)[];
  showSMA20: boolean; sma20: (number | null)[];
  showSMA50: boolean; sma50: (number | null)[];
  showEMA12: boolean; ema12: (number | null)[];
  showEMA26: boolean; ema26: (number | null)[];
  showBB: boolean; bbUp: (number | null)[]; bbLo: (number | null)[];
  showPriceLine: boolean; lastClose: number; showHiLo: boolean;
  drawings: Drawing[]; selectedDraw: string | null; onSelectDraw: (id: string) => void;
  draftPts: Pt[]; activeTool: DrawTool;
  mouseSvg: Pt | null; isDragging: boolean; mY: number | null; mBar: Bar | null; isDrawing: boolean; ticker: string;
  onMouseMove: (e: React.MouseEvent) => void; onMouseDown: (e: React.MouseEvent) => void;
  onMouseUp: () => void; onMouseLeave: () => void; onWheel: (e: React.WheelEvent) => void; onKeyDown: (e: React.KeyboardEvent) => void;
}) => {
  const { svgRef, containerRef, chartW, chartH, M, plotW, plotH, visBars, slot, bodyW, hi, lo, yPx, pAtY, chartType,
    showSMA9, sma9, showSMA20, sma20, showSMA50, sma50, showEMA12, ema12, showEMA26, ema26, showBB, bbUp, bbLo,
    showPriceLine, lastClose, showHiLo, drawings, selectedDraw, onSelectDraw, draftPts, activeTool,
    mouseSvg, isDragging, mY, mBar, isDrawing, ticker,
    onMouseMove, onMouseDown, onMouseUp, onMouseLeave, onWheel, onKeyDown,
  } = props;
  const ms = mouseSvg;
  const mIdx = ms ? clamp(Math.floor((ms.x - M.left) / slot), 0, visBars.length - 1) : null;
  const mb = mIdx != null ? visBars[mIdx] : null;
  const last = visBars[visBars.length - 1];
  const up = last ? last.close >= last.open : true;

  return (
    <div ref={containerRef} className="relative flex-1 cursor-crosshair select-none overflow-hidden outline-none"
      onMouseMove={onMouseMove} onMouseDown={onMouseDown} onMouseUp={onMouseUp} onMouseLeave={onMouseLeave}
      onWheel={onWheel} onKeyDown={onKeyDown} tabIndex={0}>
      <svg ref={svgRef} viewBox={`0 0 ${chartW} ${chartH}`} className="block h-full w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 20, 40, 60, 80, 100].map((p) => {
          const v = lo + (hi - lo) * (p / 100);
          const y = M.top + (p / 100) * plotH;
          return <g key={p}>
            <line x1={M.left} x2={chartW - M.right} y1={y} y2={y} stroke="#e2e8f0" strokeWidth={0.5} strokeDasharray="2 2" />
            <text x={chartW - M.right + 4} y={y + 3} fontSize={9} fill="#64748b">{fmtP(v)}</text>
          </g>;
        })}
        {drawings.map((d) => <DElem key={d.id} d={d} yPx={yPx} pAtY={pAtY} sel={selectedDraw === d.id} onClick={() => onSelectDraw(d.id)} />)}
        {draftPts.length > 0 && <DPrev pts={draftPts} />}
        {showBB && <g>
          {visBars.map((b, i) => { const u = bbUp[i]; const l = bbLo[i]; if (u == null || l == null) return null; const x = M.left + (i + 0.5) * slot; return <line key={i} x1={x - slot / 2} x2={x + slot / 2} y1={yPx(u)} y2={yPx(l)} stroke="#06b6d4" strokeWidth={0.8} opacity={0.2} />; })}
          <path d={visBars.map((b, i) => { const u = bbUp[i]; if (u == null) return ""; const x = M.left + (i + 0.5) * slot; return `${i === 0 ? "M" : "L"}${x},${yPx(u)}`; }).join(" ")} fill="none" stroke="#06b6d4" strokeWidth={1} opacity={0.55} />
          <path d={visBars.map((b, i) => { const l = bbLo[i]; if (l == null) return ""; const x = M.left + (i + 0.5) * slot; return `${i === 0 ? "M" : "L"}${x},${yPx(l)}`; }).join(" ")} fill="none" stroke="#06b6d4" strokeWidth={1} opacity={0.55} />
        </g>}
        {showSMA9 && <Poly pts={sma9} xf={(i) => M.left + (i + 0.5) * slot} yf={yPx} c="#f59e0b" />}
        {showSMA20 && <Poly pts={sma20} xf={(i) => M.left + (i + 0.5) * slot} yf={yPx} c="#3b82f6" />}
        {showSMA50 && <Poly pts={sma50} xf={(i) => M.left + (i + 0.5) * slot} yf={yPx} c="#8b5cf6" />}
        {showEMA12 && <Poly pts={ema12} xf={(i) => M.left + (i + 0.5) * slot} yf={yPx} c="#ef4444" />}
        {showEMA26 && <Poly pts={ema26} xf={(i) => M.left + (i + 0.5) * slot} yf={yPx} c="#f97316" />}
        {showHiLo && visBars.map((b, i) => {
          const x = M.left + (i + 0.5) * slot; const isL = i === visBars.length - 1;
          return <g key={i}>
            <circle cx={x} cy={yPx(b.high)} r={isL ? 2.5 : 1.2} fill={DOWN_COLOR} opacity={0.65} />
            <circle cx={x} cy={yPx(b.low)} r={isL ? 2.5 : 1.2} fill={UP_COLOR} opacity={0.65} />
          </g>;
        })}
        {chartType === "mountain" && visBars.length > 0 && (
          <path d={visBars.map((b, i) => { const x = M.left + (i + 0.5) * slot; const y = yPx(b.close); return `${i === 0 ? "M" : "L"}${x},${y}`; }).join(" ") + ` L${M.left + (visBars.length - 0.5) * slot},${yPx(lo)} L${M.left + 0.5 * slot},${yPx(lo)} Z`} fill="url(#ag)" stroke="none" />
        )}
        {chartType === "line" && visBars.length > 0 && (
          <path d={visBars.map((b, i) => { const x = M.left + (i + 0.5) * slot; const y = yPx(b.close); return `${i === 0 ? "M" : "L"}${x},${y}`; }).join(" ")} fill="none" stroke="#3b82f6" strokeWidth={1.5} />
        )}
        {chartType === "ohlc" && visBars.map((b, i) => {
          const x = M.left + (i + 0.5) * slot; const isUp = b.close >= b.open; const c = isUp ? UP_COLOR : DOWN_COLOR; const w = Math.max(slot * 0.3, 1);
          return <g key={i}>
            <line x1={x} x2={x} y1={yPx(b.high)} y2={yPx(b.low)} stroke={c} strokeWidth={1} />
            <line x1={x - w} x2={x} y1={yPx(b.open)} y2={yPx(b.open)} stroke={c} strokeWidth={1} />
            <line x1={x} x2={x + w} y1={yPx(b.close)} y2={yPx(b.close)} stroke={c} strokeWidth={1} />
          </g>;
        })}
        {chartType === "candle" && visBars.map((b, i) => {
          const x = M.left + (i + 0.5) * slot; const isUp = b.close >= b.open; const f = isUp ? UP_FILL : DOWN_FILL; const s = isUp ? UP_COLOR : DOWN_COLOR;
          const bt = Math.min(yPx(b.open), yPx(b.close)); const bh = Math.max(Math.abs(yPx(b.close) - yPx(b.open)), 1);
          return <g key={i}>
            <line x1={x} x2={x} y1={yPx(b.high)} y2={yPx(b.low)} stroke={s} strokeWidth={1} />
            <rect x={x - bodyW / 2} y={bt} width={bodyW} height={bh} fill={f} stroke={s} strokeWidth={0.5} rx={0.5} />
          </g>;
        })}
        {showPriceLine && lastClose > 0 && (
          <g>
            <line x1={M.left} x2={chartW - M.right} y1={yPx(lastClose)} y2={yPx(lastClose)} stroke="#eab308" strokeWidth={0.8} strokeDasharray="4 2" opacity={0.85} />
            <rect x={chartW - M.right + 2} y={yPx(lastClose) - 7} width={56} height={14} fill="#eab308" rx={2} />
            <text x={chartW - M.right + 30} y={yPx(lastClose) + 3} textAnchor="middle" fontSize={8} fill="#fff">{fmtP(lastClose)}</text>
          </g>
        )}
        {ms && !isDragging && (
          <g pointerEvents="none">
            <line x1={M.left} x2={chartW - M.right} y1={ms.y} y2={ms.y} stroke="#94a3b8" strokeWidth={0.5} strokeDasharray="4 2" />
            <line x1={ms.x} x2={ms.x} y1={M.top} y2={chartH - M.bottom} stroke="#94a3b8" strokeWidth={0.5} strokeDasharray="4 2" />
            {mY != null && <g>
              <rect x={chartW - M.right + 2} y={ms.y - 7} width={56} height={14} fill="#1e293b" rx={2} />
              <text x={chartW - M.right + 30} y={ms.y + 3} textAnchor="middle" fontSize={8} fill="#fff">{fmtP(mY)}</text>
            </g>}
            {mb && <text x={ms.x} y={chartH - M.bottom + 14} textAnchor="middle" fontSize={8} fill="#64748b">{mb.date}</text>}
          </g>
        )}
      </svg>
      {ms && mb && !isDragging && (
        <div className="pointer-events-none absolute rounded border border-border bg-background/95 p-1.5 text-[9px] shadow-lg" style={{ left: Math.min(ms.x + 14, chartW - 200), top: Math.max(ms.y - 80, 4), width: 180 }}>
          <div className="font-mono font-semibold">{mb.date}</div>
          <div className="grid grid-cols-2 gap-x-2">
            <span className="text-muted-foreground">O</span><span className="font-mono text-right">{fmtP(mb.open)}</span>
            <span className="text-muted-foreground">H</span><span className="font-mono text-right">{fmtP(mb.high)}</span>
            <span className="text-muted-foreground">L</span><span className="font-mono text-right">{fmtP(mb.low)}</span>
            <span className="text-muted-foreground">C</span><span className={`font-mono text-right ${up ? "text-green-600" : "text-red-500"}`}>{fmtP(mb.close)}</span>
            <span className="text-muted-foreground">Δ%</span><span className={`font-mono text-right ${up ? "text-green-600" : "text-red-500"}`}>{(((mb.close - mb.open) / mb.open) * 100 >= 0 ? "+" : "")}{(((mb.close - mb.open) / mb.open) * 100).toFixed(2)}%</span>
            <span className="text-muted-foreground">Vol</span><span className="font-mono text-right">{Math.round(mb.volume / 1e6)}M</span>
          </div>
        </div>
      )}
      <div className="absolute bottom-0 left-2 right-2 flex items-center justify-between text-[8px] text-muted-foreground pointer-events-none">
        <span>{ticker}</span>
        <span>{activeTool !== "cursor" ? `Tool: ${activeTool} · Click: add · Enter: confirm · Esc: cancel` : "Scroll: zoom · Drag: pan · ←→: pan · +/-: zoom · End/Home"}</span>
      </div>
    </div>
  );
};

function DElem({ d, yPx, pAtY, sel, onClick }: {
  d: Drawing; yPx: (v: number) => number; pAtY: (y: number) => number; sel: boolean; onClick: () => void;
}) {
  const col = d.color; const sw = sel ? 2 : 1.2;
  if (d.type === "hline") {
    const p = d.points[0]; const y = yPx(pAtY(p.y));
    return <g onClick={onClick} style={{ cursor: "pointer" }}>
      <line x1={56} x2={836} y1={y} y2={y} stroke={col} strokeWidth={sw} strokeDasharray="6 3" opacity={sel ? 1 : 0.7} />
      <rect x={838} y={y - 7} width={56} height={14} fill={col} rx={2} />
      <text x={866} y={y + 3} textAnchor="middle" fontSize={8} fill="#fff">{fmtP(pAtY(p.y))}</text>
    </g>;
  }
  if (d.type === "vline") {
    const p = d.points[0];
    return <g onClick={onClick} style={{ cursor: "pointer" }}>
      <line x1={p.x} x2={p.x} y1={28} y2={472} stroke={col} strokeWidth={sw} strokeDasharray="6 3" opacity={sel ? 1 : 0.7} />
    </g>;
  }
  if (d.type === "trendline" || d.type === "ray") {
    const [p1, p2] = d.points; const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const ex = d.type === "ray" ? 3 : 0;
    return <g onClick={onClick} style={{ cursor: "pointer" }}>
      <line x1={p1.x - dx * ex} y1={p1.y - dy * ex} x2={p2.x + dx * ex} y2={p2.y + dy * ex} stroke={col} strokeWidth={sw} opacity={sel ? 1 : 0.8} />
      <circle cx={p1.x} cy={p1.y} r={sel ? 3 : 2} fill={col} />
      <circle cx={p2.x} cy={p2.y} r={sel ? 3 : 2} fill={col} />
    </g>;
  }
  if (d.type === "parallel-channel") {
    const [p1, p2] = d.points; const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dy * dy); const nx = -dy / (len || 1), ny = dx / (len || 1);
    return <g onClick={onClick} style={{ cursor: "pointer" }}>
      <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={col} strokeWidth={sw} opacity={sel ? 1 : 0.8} />
      <line x1={p1.x + nx * len} y1={p1.y + ny * len} x2={p2.x + nx * len} y2={p2.y + ny * len} stroke={col} strokeWidth={sw} opacity={sel ? 1 : 0.8} />
      <line x1={p1.x} y1={p1.y} x2={p1.x + nx * len} y2={p1.y + ny * len} stroke={col} strokeWidth={0.5} opacity={0.4} strokeDasharray="3 3" />
      <line x1={p2.x} y1={p2.y} x2={p2.x + nx * len} y2={p2.y + ny * len} stroke={col} strokeWidth={0.5} opacity={0.4} strokeDasharray="3 3" />
      <circle cx={p1.x} cy={p1.y} r={sel ? 3 : 2} fill={col} />
      <circle cx={p2.x} cy={p2.y} r={sel ? 3 : 2} fill={col} />
    </g>;
  }
  if (d.type === "fib-retrace" && d.levels) {
    return <g onClick={onClick} style={{ cursor: "pointer" }}>
      {d.levels.map((lv) => {
        const y = yPx(lv.price);
        return <g key={lv.pct}>
          <line x1={56} x2={836} y1={y} y2={y} stroke={col} strokeWidth={0.5} opacity={0.5} strokeDasharray="4 2" />
          <text x={840} y={y + 3} fontSize={7} fill={col}>{lv.pct}%</text>
        </g>;
      })}
      {d.points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={sel ? 3 : 2} fill={col} />)}
    </g>;
  }
  if (d.type === "fib-extension" && d.levels) {
    return <g onClick={onClick} style={{ cursor: "pointer" }}>
      {d.levels.map((lv) => {
        const y = yPx(lv.price);
        return <g key={lv.pct}>
          <line x1={56} x2={836} y1={y} y2={y} stroke={col} strokeWidth={0.5} opacity={0.5} strokeDasharray="4 2" />
          <text x={840} y={y + 3} fontSize={7} fill={col}>{lv.pct}%</text>
        </g>;
      })}
      {d.points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={sel ? 3 : 2} fill={col} />)}
    </g>;
  }
  return null;
}

function DPrev({ pts }: { pts: Pt[] }) {
  if (pts.length === 0) return null;
  const col = "#fbbf24";
  if (pts.length === 1) return <circle cx={pts[0].x} cy={pts[0].y} r={3} fill={col} />;
  const [p1, p2] = pts;
  return <g>
    <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={col} strokeWidth={1.5} />
    <circle cx={p1.x} cy={p1.y} r={2.5} fill={col} />
    <circle cx={p2.x} cy={p2.y} r={2.5} fill={col} />
  </g>;
}

function Poly({ pts, xf, yf, c }: { pts: (number | null)[]; xf: (i: number) => number; yf: (v: number) => number; c: string }) {
  const p: string[] = [];
  for (let i = 0; i < pts.length; i++) { const v = pts[i]; if (v == null) continue; p.push(`${xf(i)},${yf(v)}`); }
  if (p.length < 2) return null;
  return <polyline points={p.join(" ")} fill="none" stroke={c} strokeWidth={1.2} strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />;
}

