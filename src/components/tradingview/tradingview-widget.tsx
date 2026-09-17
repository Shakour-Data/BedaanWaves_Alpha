"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";

// ─── TradingView free-tier widget embedder ──────────────────────────────────
// Per spec §12: display-only. All scores remain BedaanWaves-native.
// Lazy-loaded via IntersectionObserver. Graceful fallback if blocked.

type WidgetType =
  | "advanced-chart"
  | "mini-symbol-overview"
  | "symbol-overview"
  | "technical-analysis"
  | "ticker-tape"
  | "market-overview"
  | "screener"
  | "stock-heatmap"
  | "events"
  | "symbol-info"
  | "financials"
  | "timeline";

interface TVWidgetProps {
  type: WidgetType;
  symbol?: string; // e.g. "AAPL" (mapped to NASDAQ:AAPL)
  symbols?: string[]; // for multi-symbol widgets
  theme?: "light" | "dark";
  height?: number | string;
  width?: number | string;
  autosize?: boolean;
  studies?: string[]; // for advanced-chart
  showAttribution?: boolean;
  locale?: string;
  // Arbitrary extra config
  extraConfig?: Record<string, unknown>;
}

const SCRIPT_URLS: Record<WidgetType, string> = {
  "advanced-chart": "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js",
  "mini-symbol-overview": "https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js",
  "symbol-overview": "https://s3.tradingview.com/external-embedding/embed-widget-symbol-overview.js",
  "technical-analysis": "https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js",
  "ticker-tape": "https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js",
  "market-overview": "https://s3.tradingview.com/external-embedding/embed-widget-market-overview.js",
  "screener": "https://s3.tradingview.com/external-embedding/embed-widget-screener.js",
  "stock-heatmap": "https://s3.tradingview.com/external-embedding/embed-widget-stock-heatmap.js",
  "events": "https://s3.tradingview.com/external-embedding/embed-widget-events.js",
  "symbol-info": "https://s3.tradingview.com/external-embedding/embed-widget-symbol-info.js",
  "financials": "https://s3.tradingview.com/external-embedding/embed-widget-financials.js",
  "timeline": "https://s3.tradingview.com/external-embedding/embed-widget-timeline.js",
};

function buildConfig(props: TVWidgetProps): Record<string, unknown> {
  const tvSymbol = props.symbol ? `NASDAQ:${props.symbol.toUpperCase()}` : undefined;
  const tvSymbols = props.symbols
    ? props.symbols.map((s) => `NASDAQ:${s.toUpperCase()}`)
    : undefined;
  // Note: `autosize: true` is only supported by certain widgets (advanced-chart,
  // mini-symbol-overview, symbol-info). For market-overview, events, screener,
  // stock-heatmap etc. we must use explicit width/height instead.
  const widgetsNeedingAutosize = new Set([
    "advanced-chart", "mini-symbol-overview", "symbol-info", "financials", "timeline",
  ]);
  const useAutosize = widgetsNeedingAutosize.has(props.type);
  const base: Record<string, unknown> = {
    theme: props.theme ?? "dark",
    locale: props.locale ?? "en",
  };
  if (useAutosize) {
    base.autosize = props.autosize ?? true;
  } else {
    base.width = "100%";
    base.height = "100%";
  }
  switch (props.type) {
    case "advanced-chart":
      return {
        ...base,
        symbol: tvSymbol ?? "NASDAQ:AAPL",
        interval: "D",
        timezone: "America/New_York",
        style: "1", // candlestick
        toolbar_bg: "#f1f3f6",
        enable_publishing: false,
        allow_symbol_change: true,
        hide_side_toolbar: false, // show drawing tools
        hide_top_toolbar: false,
        hide_legend: false,
        save_image: true,
        details: true,
        hotlist: true,
        calendar: false,
        withdateranges: true,
        studies: props.studies ?? [
          "RSI@tv-basicstudies",
          "MASimple@tv-basicstudies",
          "MACD@tv-basicstudies",
          "Volume@tv-basicstudies",
        ],
        ...props.extraConfig,
      };
    case "mini-symbol-overview":
      return {
        ...base,
        symbol: tvSymbol ?? "NASDAQ:AAPL",
        width: "100%",
        height: "100%",
        dateRange: "3M",
        trendLineColor: "rgba(16,185,129,0.9)",
        underLineColor: "rgba(16,185,129,0.15)",
        ...props.extraConfig,
      };
    case "symbol-overview":
      return {
        ...base,
        symbols: tvSymbols ?? [tvSymbol ?? "NASDAQ:AAPL"],
        chartOnly: false,
        width: "100%",
        height: "100%",
        locale: props.locale ?? "en",
        colorTheme: props.theme ?? "dark",
        isTransparent: false,
        showSymbolLogo: true,
        ...props.extraConfig,
      };
    case "technical-analysis":
      return {
        ...base,
        symbol: tvSymbol ?? "NASDAQ:AAPL",
        interval: "1D",
        width: "100%",
        height: "100%",
        showIntervalTabs: true,
        isTransparent: false,
        ...props.extraConfig,
      };
    case "ticker-tape":
      return {
        ...base,
        symbols: tvSymbols
          ? tvSymbols.map((s) => ({ proName: s, title: s.split(":")[1] }))
          : [{ proName: "NASDAQ:AAPL", title: "AAPL" }],
        showSymbolLogo: true,
        isTransparent: true,
        displayMode: "adaptive",
        colorTheme: props.theme ?? "dark",
        ...props.extraConfig,
      };
    case "market-overview":
      return {
        ...base,
        colorTheme: props.theme ?? "light",
        dateRange: "3M",
        showChart: true,
        showSymbolLogo: true,
        showFloatingTooltip: false,
        locale: props.locale ?? "en",
        isTransparent: false,
        largeChartUrl: "",
        plotLineColorGrowing: "rgba(16,185,129,1)",
        plotLineColorFalling: "rgba(239,68,68,1)",
        gridLineColor: "rgba(240, 243, 250, 0)",
        belowLineFillColorGrowing: "rgba(16, 185, 129, 0.12)",
        belowLineFillColorFalling: "rgba(239, 68, 68, 0.12)",
        symbolActiveColor: "rgba(16, 185, 129, 0.15)",
        tabs: props.extraConfig?.tabs ?? [
          {
            title: "Indices",
            symbols: [
              { s: "NASDAQ:QQQ", d: "NASDAQ-100 ETF" },
              { s: "NYSEARCA:SPY", d: "S&P 500 ETF" },
              { s: "NASDAQ:SMH", d: "Semiconductor ETF" },
              { s: "NASDAQ:XLK", d: "Tech Sector ETF" },
              { s: "NASDAQ:IBB", d: "Biotech ETF" },
            ],
          },
          {
            title: "Futures",
            symbols: [
              { s: "CME_MINI:ES1!", d: "S&P 500 Fut" },
              { s: "CME_MINI:NQ1!", d: "NASDAQ Fut" },
              { s: "CBOT_MINI:YM1!", d: "Dow Fut" },
              { s: "COMEX:GC1!", d: "Gold Fut" },
              { s: "NYMEX:CL1!", d: "Crude Oil Fut" },
            ],
          },
          {
            title: "Forex & Crypto",
            symbols: [
              { s: "FX:EURUSD", d: "EUR/USD" },
              { s: "FX:GBPUSD", d: "GBP/USD" },
              { s: "FX:USDJPY", d: "USD/JPY" },
              { s: "BITSTAMP:BTCUSD", d: "Bitcoin" },
              { s: "BITSTAMP:ETHUSD", d: "Ethereum" },
            ],
          },
        ],
        ...props.extraConfig,
      };
    case "screener":
      return {
        ...base,
        colorTheme: props.theme ?? "dark",
        defaultColumn: "overview",
        defaultScreen: "most_capitalized",
        market: "america",
        showToolbar: true,
        width: "100%",
        height: "100%",
        locale: props.locale ?? "en",
        ...props.extraConfig,
      };
    case "stock-heatmap":
      return {
        ...base,
        dataSource: "NASDAQ",
        grouping: "sector",
        blockSize: "market_cap_basic",
        colorRatio: "change",
        blockColor: "change",
        locale: props.locale ?? "en",
        hasTopBar: true,
        hasFundamentals: true,
        isTransparent: false,
        ...props.extraConfig,
      };
    case "events":
      return {
        ...base,
        colorTheme: props.theme ?? "light",
        isTransparent: false,
        locale: props.locale ?? "en",
        importanceFilter: "-1,0,1",
        country: "us",
        ...props.extraConfig,
      };
    case "symbol-info":
      return {
        ...base,
        symbol: tvSymbol ?? "NASDAQ:AAPL",
        width: "100%",
        height: "100%",
        locale: props.locale ?? "en",
        colorTheme: props.theme ?? "dark",
        isTransparent: false,
        ...props.extraConfig,
      };
    case "financials":
      return {
        ...base,
        symbol: tvSymbol ?? "NASDAQ:AAPL",
        colorTheme: props.theme ?? "dark",
        isTransparent: false,
        displayMode: "regular",
        width: "100%",
        height: "100%",
        locale: props.locale ?? "en",
        ...props.extraConfig,
      };
    case "timeline":
      return {
        ...base,
        symbol: tvSymbol ?? "NASDAQ:AAPL",
        colorTheme: props.theme ?? "dark",
        isTransparent: false,
        displayMode: "regular",
        width: "100%",
        height: "100%",
        locale: props.locale ?? "en",
        feedMode: "symbol",
        ...props.extraConfig,
      };
    default:
      return base;
  }
}

export function TradingViewWidget(props: TVWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  // Start with inView=true so widgets load immediately (no scroll needed)
  const [inView, setInView] = useState(true);
  const configKey = JSON.stringify({
    type: props.type,
    symbol: props.symbol,
    symbols: props.symbols,
    theme: props.theme,
    studies: props.studies,
    extraConfig: props.extraConfig,
  });

  // Lazy-load via IntersectionObserver as backup (in case initial render is below fold)
  useEffect(() => {
    const el = containerRef.current;
    if (!el || inView) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          obs.disconnect();
        }
      },
      { rootMargin: "300px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [inView]);

  // Inject the TradingView script — re-initializes when configKey changes
  // (e.g. when switching from advanced-chart to stock-heatmap)
  useEffect(() => {
    if (!inView) return;
    // Defer status update to avoid synchronous setState-in-effect
    Promise.resolve().then(() => setStatus("loading"));
    const el = containerRef.current;
    if (!el) return;
    // clear children (remove old iframe + script)
    el.innerHTML = "";
    const script = document.createElement("script");
    script.src = SCRIPT_URLS[props.type];
    script.async = true;
    script.innerHTML = JSON.stringify(buildConfig(props));
    script.onload = () => setStatus("ready");
    script.onerror = () => setStatus("error");
    el.appendChild(script);
    // Fallback timeout
    const timer = setTimeout(() => {
      setStatus((cur) => (cur === "loading" ? "error" : cur));
    }, 8000);
    return () => {
      clearTimeout(timer);
    };
  }, [inView, configKey]);

  const heightStyle =
    typeof props.height === "number"
      ? `${props.height}px`
      : (props.height as string) ?? "400px";
  const widthStyle =
    typeof props.width === "number"
      ? `${props.width}px`
      : (props.width as string) ?? "100%";

  return (
    <div
      className="tradingview-widget-container relative w-full"
      style={{ height: heightStyle, width: widthStyle }}
    >
      {!inView && (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="ml-2 text-xs">lazy-loading widget…</span>
        </div>
      )}
      <div
        ref={containerRef}
        className="tradingview-widget-container__widget w-full h-full"
        style={{ minHeight: heightStyle }}
      />
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/30 text-center text-xs text-muted-foreground">
          <AlertTriangle className="h-4 w-4" />
          <span>
            TradingView widget unavailable (network/CSP).{" "}
            <span className="text-foreground/70">
              BedaanWaves-native charts remain unaffected.
            </span>
          </span>
        </div>
      )}
      {props.showAttribution !== false && status === "ready" && (
        <div className="pointer-events-none absolute bottom-1 right-2 text-[10px] text-muted-foreground/60">
          Powered by TradingView
        </div>
      )}
    </div>
  );
}
