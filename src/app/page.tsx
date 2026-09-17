"use client";

import { useEffect, useState } from "react";
import { NewsRibbon } from "@/components/bedaan/news-ribbon";
import { MarketTicker } from "@/components/bedaan/market-ticker";
import { Header } from "@/components/bedaan/header";
import { RankingsTable } from "@/components/bedaan/rankings-table";
import { SymbolDrilldown } from "@/components/bedaan/symbol-drilldown";
import { MarketSidebar } from "@/components/bedaan/market-sidebar";
import { WatchlistAlertsPanel } from "@/components/bedaan/watchlist-alerts-panel";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";

export default function Home() {
  const [selected, setSelected] = useState<string | null>("AAPL");
  const [compareTicker, setCompareTicker] = useState<string | undefined>(undefined);
  const [rightTab, setRightTab] = useState<"drilldown" | "watchlists">("drilldown");

  // Auto-seed on first load if DB is empty (the /api/seed endpoint is idempotent).
  useEffect(() => {
    fetch("/api/seed").catch(() => null);
  }, []);

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

        {/* Bottom row: sidebar widgets (market overview + economic calendar) */}
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-[1fr_minmax(360px,_40%)]">
          <div className="rounded border border-border bg-card/50 p-2">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">NASDAQ Stock Heatmap</span>
              <span className="text-[9px] text-muted-foreground">TradingView · display only</span>
            </div>
            <div className="h-[420px] w-full">
              <TradingViewHeatmapTicker onSelect={handleSelect} />
            </div>
          </div>
          <MarketSidebar onSymbolSelect={handleSelect} />
        </div>
      </main>

      <Footer />
    </div>
  );
}

import { TradingViewWidget } from "@/components/tradingview/tradingview-widget";

function TradingViewHeatmapTicker({ onSelect: _onSelect }: { onSelect: (t: string) => void }) {
  return (
    <TradingViewWidget
      type="stock-heatmap"
      height={420}
      theme="light"
    />
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
