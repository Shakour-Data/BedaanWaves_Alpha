"use client";

import { useEffect, useState } from "react";
import { NewsRibbon } from "@/components/bedaan/news-ribbon";
import { MarketTicker } from "@/components/bedaan/market-ticker";
import { Header } from "@/components/bedaan/header";
import { RankingsTable } from "@/components/bedaan/rankings-table";
import { SymbolDrilldown } from "@/components/bedaan/symbol-drilldown";
import { MarketSidebar } from "@/components/bedaan/market-sidebar";
import { WatchlistAlertsPanel } from "@/components/bedaan/watchlist-alerts-panel";
import { TradingViewWidget } from "@/components/tradingview/tradingview-widget";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CandlestickChart, Grid3x3 } from "lucide-react";

export default function Home() {
  const [selected, setSelected] = useState<string | null>("AAPL");
  const [compareTicker, setCompareTicker] = useState<string | undefined>(undefined);
  const [rightTab, setRightTab] = useState<"drilldown" | "watchlists">("drilldown");
  // Toggle between TradingView chart (default when symbol selected) and heatmap
  const [bottomView, setBottomView] = useState<"chart" | "heatmap">("chart");

  // Auto-seed on first load if DB is empty (the /api/seed endpoint is idempotent).
  useEffect(() => {
    fetch("/api/seed").catch(() => null);
  }, []);

  // When a symbol is selected, auto-switch to chart view (deferred to avoid set-state-in-effect)
  useEffect(() => {
    if (selected) {
      Promise.resolve().then(() => setBottomView("chart"));
    }
  }, [selected]);

  const handleSelect = (t: string) => {
    setSelected(t.toUpperCase());
    setRightTab("drilldown");
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <NewsRibbon onSymbolClick={handleSelect} />
      <MarketTicker onSymbolClick={handleSelect} />
      <Header onSymbolSelect={handleSelect} />

      {/* Main content — flex grows; footer pushed naturally */}
      <main className="flex flex-1 flex-col gap-2 p-2">
        {/* Top disclaimer strip (small) */}
        <div className="flex items-center gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-1 text-[10px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>
            <span className="font-semibold">Not financial advice.</span>{" "}
            BedaanWaves scores are algorithmic research signals derived from
            cross-sectional percentile transforms + per-symbol ML coefficients.
            TradingView widgets are display-only and never feed the scoring path.
          </span>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-2 lg:grid-cols-[1fr_minmax(420px,_42%)]">
          {/* Left column: rankings */}
          <div className="flex min-h-[480px] flex-col rounded border border-border bg-card/50 p-2">
            <RankingsTable selectedTicker={selected} onSelect={handleSelect} />
          </div>

          {/* Right column: drilldown + watchlists */}
          <div className="flex min-h-[480px] flex-col rounded border border-border bg-card/50">
            <div className="flex border-b border-border bg-card">
              <button
                onClick={() => setRightTab("drilldown")}
                className={`px-3 py-1.5 text-[11px] font-medium ${
                  rightTab === "drilldown"
                    ? "border-b-2 border-primary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Symbol Drilldown
              </button>
              <button
                onClick={() => setRightTab("watchlists")}
                className={`px-3 py-1.5 text-[11px] font-medium ${
                  rightTab === "watchlists"
                    ? "border-b-2 border-primary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Watchlists & Alerts
              </button>
              {selected && (
                <Badge variant="outline" className="ml-auto my-auto mr-2 text-[9px]">
                  {selected}
                </Badge>
              )}
            </div>

            <div className="flex-1 overflow-hidden">
              {rightTab === "drilldown" ? (
                selected ? (
                  <SymbolDrilldown
                    ticker={selected}
                    onClose={() => setSelected(null)}
                    compareTicker={compareTicker}
                    onCompareChange={setCompareTicker}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    Select a symbol from the rankings or search above.
                  </div>
                )
              ) : (
                <div className="h-full overflow-y-auto p-3">
                  <WatchlistAlertsPanel onSymbolClick={handleSelect} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Bottom area: TradingView chart OR heatmap (full-width, taller) ── */}
        <div className="rounded border border-border bg-card/50 p-2">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {selected && bottomView === "chart" ? (
                <>
                  <CandlestickChart className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">
                    TradingView Advanced Chart — {selected}
                  </span>
                  <Badge variant="outline" className="text-[9px]">
                    RSI · SMA · MACD · Drawing Tools · Date Ranges
                  </Badge>
                </>
              ) : (
                <>
                  <Grid3x3 className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">
                    NASDAQ Stock Heatmap
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {selected && (
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant={bottomView === "chart" ? "default" : "outline"}
                    className="h-6 px-2 text-[10px]"
                    onClick={() => setBottomView("chart")}
                  >
                    <CandlestickChart className="mr-1 h-3 w-3" />
                    Chart
                  </Button>
                  <Button
                    size="sm"
                    variant={bottomView === "heatmap" ? "default" : "outline"}
                    className="h-6 px-2 text-[10px]"
                    onClick={() => setBottomView("heatmap")}
                  >
                    <Grid3x3 className="mr-1 h-3 w-3" />
                    Heatmap
                  </Button>
                </div>
              )}
              <span className="text-[9px] text-muted-foreground">
                TradingView · display only
              </span>
            </div>
          </div>
          {/* Full-width, 560px tall for maximum chart detail */}
          <div className="h-[560px] w-full overflow-hidden rounded border border-border bg-white">
            {selected && bottomView === "chart" ? (
              <TradingViewWidget
                type="advanced-chart"
                symbol={selected}
                theme="light"
                height={560}
                studies={[
                  "RSI@tv-basicstudies",
                  "MASimple@tv-basicstudies",
                  "MACD@tv-basicstudies",
                  "BB@tv-basicstudies",
                  "Volume@tv-basicstudies",
                  "IchimokuCloud@tv-basicstudies",
                  "ADX@tv-basicstudies",
                ]}
                extraConfig={{
                  hide_side_toolbar: false,
                  details: true,
                  withdateranges: true,
                  allow_symbol_change: true,
                  calendar: false,
                  hotlist: false,
                  news: ["headlines"],
                  fundamentals: false,
                  support_host: "https://www.tradingview.com",
                }}
                showAttribution
              />
            ) : (
              <TradingViewWidget
                type="stock-heatmap"
                height={560}
                theme="light"
              />
            )}
          </div>
        </div>

        {/* ── Market Overview + Economic Calendar (side by side, taller) ── */}
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          <div className="rounded border border-border bg-card/50 p-2">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">Market Overview</span>
              <span className="text-[9px] text-muted-foreground">
                TradingView · real-time indices & funds
              </span>
            </div>
            <div className="h-[400px] w-full overflow-hidden rounded border border-border bg-white">
              <TradingViewWidget
                type="market-overview"
                height={400}
                theme="light"
              />
            </div>
          </div>
          <div className="rounded border border-border bg-card/50 p-2">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">Economic Calendar</span>
              <span className="text-[9px] text-muted-foreground">
                TradingView · real macro events
              </span>
            </div>
            <div className="h-[400px] w-full overflow-hidden rounded border border-border bg-white">
              <TradingViewWidget
                type="events"
                height={400}
                theme="light"
              />
            </div>
          </div>
        </div>

        {/* ── Sidebar stats (universe status, taxonomy, grades, quick access) ── */}
        <MarketSidebar onSymbolSelect={handleSelect} />
      </main>

      <Footer />
    </div>
  );
}

function Footer() {
  return (
    <footer className="mt-auto border-t border-border bg-card px-3 py-3 text-[10px] text-muted-foreground">
      <div className="mx-auto flex max-w-7xl flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="font-semibold text-foreground">BedaanWaves</span> — NASDAQ-exclusive,
            per-symbol ML-learned hierarchical scoring engine. Spec v4.0 FINAL.
          </div>
          <div className="flex items-center gap-2 text-[9px]">
            <span>Invariants:</span>
            <span className="rounded bg-muted px-1">per-symbol coefficients</span>
            <span className="rounded bg-muted px-1">zero mock data</span>
            <span className="rounded bg-muted px-1">point-in-time correct</span>
            <span className="rounded bg-muted px-1">TV display-only</span>
            <span className="rounded bg-muted px-1">conformal CI</span>
          </div>
        </div>
        <div>
          <span className="font-semibold">Disclaimer:</span> BedaanWaves is a
          research/educational tool. Scores are not investment advice. Past
          performance does not guarantee future results. Always do your own
          due diligence. TradingView widgets retain their own attribution and
          licensing.
        </div>
      </div>
    </footer>
  );
}
