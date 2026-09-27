"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar,
  Clock,
  Globe,
  HelpCircle,
  Info,
  BookOpen,
  ChevronDown,
  Activity,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  X,
  ChevronRight,
  FileText,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { apiFetchSafe } from "@/lib/api-client";
import { gradeColor, clamp } from "@/lib/scoring/transforms";
import type { MacroIndicator } from "@/lib/real-store";

interface EconomicImpactItem {
  key: string;
  label: string;
  impact: number;
  direction: "bullish" | "bearish" | "neutral";
  confidence: number;
}

interface SymbolImpactData {
  symbol: string;
  totalImpact: number;
  impactItems: EconomicImpactItem[];
  latestAt: string;
}

interface SymbolImpactDataWithNull extends SymbolImpactData {
  symbol: string;
  totalImpact: number;
  impactItems: EconomicImpactItem[];
  latestAt: string;
}

interface EnhancedEconomicCalendarProps {
  height?: number;
  selectedSymbol?: string | null;
}

function priceFmt(v: number, unit = "") {
  const n =
    Math.abs(v) >= 1000
      ? v.toLocaleString("en-US", { maximumFractionDigits: 2 })
      : v.toFixed(2);
  return `${n}${unit}`;
}

const CATEGORY_LABELS: Record<string, string> = {
  gdp: "GDP",
  inflation: "Inflation",
  interest_rates: "Interest Rates",
  volatility: "Volatility",
  exchange_rates: "Exchange Rates",
  commodity_prices: "Commodity Prices",
  employment: "Employment",
};

export function EnhancedEconomicCalendar({
  height = 450,
  selectedSymbol,
}: EnhancedEconomicCalendarProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [countryFilter, setCountryFilter] = useState<string | null>(null);
  const [countryPopoverOpen, setCountryPopoverOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [impactPanelOpen, setImpactPanelOpen] = useState(true);

  const { data, isLoading, isError } = useQuery<{
    releases: MacroIndicator[];
    market: MacroIndicator[];
    news: Array<{ headline: string; source: string; publishedAt: string; sentiment: string; tickers: string[] }>;
  }>({
    queryKey: ["macro-calendar", refreshKey],
    queryFn: async () => {
      const [m, n] = await Promise.all([
        apiFetchSafe<{ releases: MacroIndicator[]; market: MacroIndicator[] }>("/api/macro"),
        apiFetchSafe<{ items: Array<{ headline: string; source: string; publishedAt: string; sentiment: string; tickers: string[] }> }>("/api/news"),
      ]);
      const intlMarket = (m.market || []).filter((i: MacroIndicator) =>
        ["UK","Japan","Australia","Canada","Switzerland","China","India","Mexico","Brazil","South Africa","South Korea","Singapore","Sweden","Norway","New Zealand","Hong Kong","Germany","Netherlands"].includes(i.country)
      );
      return { releases: m.releases, market: intlMarket, news: n.items ?? [] };
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const { data: symbolImpact, isLoading: impactLoading, error: impactError } = useQuery<
  SymbolImpactData,
  Error
>({
  queryKey: ["symbol-impact", selectedSymbol],
  queryFn: async () => {
    if (!selectedSymbol) {
      // This shouldn't happen due to enabled check, but for type safety
      throw new Error("No symbol provided");
    }
    const r = await apiFetchSafe<SymbolImpactData>(`/api/macro/${selectedSymbol}/impact`);
    return r;
  },
  enabled: !!selectedSymbol,
  staleTime: 300_000,
  retry: false,
});

  const allItems = data ? [...(data.releases || []), ...(data.market || [])] : [];
  const countries = Array.from(new Set(allItems.map((r) => r.country))).sort();
  const filtered = countryFilter
    ? allItems.filter((r) => r.country === countryFilter)
    : allItems;

  const groupedByCountry = filtered.reduce((acc, r) => {
    if (!acc[r.country]) acc[r.country] = [];
    acc[r.country].push(r);
    return acc;
  }, {} as Record<string, MacroIndicator[]>);

  const impactStats = useMemo(() => {
    if (!symbolImpact?.impactItems || !symbolImpact.impactItems.length) return null;
    const bullish = symbolImpact.impactItems.filter((i: EconomicImpactItem) => i.direction === "bullish").length;
    const bearish = symbolImpact.impactItems.filter((i: EconomicImpactItem) => i.direction === "bearish").length;
    const neutral = symbolImpact.impactItems.filter((i: EconomicImpactItem) => i.direction === "neutral").length;
    return { bullish, bearish, neutral, total: symbolImpact.impactItems.length };
  }, [symbolImpact]);

  if (isLoading) return <Skeleton className="h-full w-full" />;
  if (isError || !data?.releases?.length) return <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No economic data</div>;

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold">Economic Calendar</span>
          <Badge variant="outline" className="text-[9px]">
            {filtered.length} indicators · {countries.length} countries
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          {selectedSymbol && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[9px]"
              onClick={() => setImpactPanelOpen(!impactPanelOpen)}
            >
              <TrendingUp className="mr-1 h-3 w-3" />
              Impact {impactPanelOpen ? "▲" : "▼"}
            </Button>
          )}
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
                        <ChevronDown
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
                          <ChevronDown
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
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground"
            onClick={() => setHelpOpen(!helpOpen)}
            aria-label="Help"
            title="Calendar Help"
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Help Panel */}
      {helpOpen && (
        <div className="border-b border-border bg-card/95 px-4 py-3 backdrop-blur">
          <div className="flex items-start gap-3">
            <BookOpen className="h-5 w-5 shrink-0 text-primary" />
            <div className="flex-1 space-y-2">
              <h4 className="text-sm font-semibold">Economic Calendar Guide</h4>
              <p className="text-xs text-muted-foreground">
                The Economic Calendar displays real published government statistics 
                (BEA, BLS, Fed, U. Michigan) and international market indicators.
              </p>
              <div className="space-y-2 text-xs">
                <div className="rounded border border-border bg-background p-2">
                  <span className="font-semibold">Reading the Calendar:</span>
                  <ul className="mt-1 list-disc pl-4 space-y-1 text-muted-foreground">
                    <li>Indicator values show actual releases vs forecast</li>
                    <li>Change % compares latest to prior period</li>
                    <li>Higher deviation from forecast = larger market impact</li>
                  </ul>
                </div>
                <div className="rounded border border-border bg-background p-2">
                  <span className="font-semibold">Symbol-Specific Impact:</span>
                  <ul className="mt-1 list-disc pl-4 space-y-1 text-muted-foreground">
                    <li>When a symbol is selected, impact analysis appears below</li>
                    <li>Shows how each economic event affects the chosen stock</li>
                    <li>Bullish impact = positive expected effect on price</li>
                    <li>Bearish impact = negative expected effect on price</li>
                    <li>Confidence score: 0-100% accuracy of prediction</li>
                  </ul>
                </div>
                <div className="rounded border border-border bg-background p-2">
                  <span className="font-semibold">Interpreting Impact Scores:</span>
                  <div className="mt-1 space-y-1 text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-3 h-3 rounded bg-green-500/20 border border-green-500/30" />
                      <span>+50 to +100: Strong bullish impact</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-3 h-3 rounded bg-green-500/10 border border-green-500/20" />
                      <span>+10 to +49: Mild bullish impact</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-3 h-3 rounded bg-gray-500/10 border border-gray-500/20" />
                      <span>-10 to +9: Neutral / minimal impact</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-3 h-3 rounded bg-red-500/10 border border-red-500/20" />
                      <span>-49 to -10: Mild bearish impact</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-3 h-3 rounded bg-red-500/20 border border-red-500/30" />
                      <span>-100 to -50: Strong bearish impact</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Symbol Impact Panel */}
      {selectedSymbol && impactPanelOpen && (
        <div className="border-b border-border bg-muted/20">
          {impactLoading ? (
            <div className="p-3">
              <Skeleton className="h-4 w-1/3 mb-2" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : impactError ? (
            <div className="p-3 text-center text-xs text-muted-foreground">
              <AlertTriangle className="mx-auto h-4 w-4 mb-1" />
              Error loading impact data
            </div>
          ) : symbolImpact ? (
            <div className="p-3">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-xs font-semibold flex items-center gap-1.5">
                  <TrendingUp className="h-3 w-3 text-primary" />
                  Impact Analysis: {symbolImpact.symbol}
                </h4>
                <Badge variant="outline" className="text-[8px]">
                  {impactStats?.total} events analyzed
                </Badge>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="rounded border border-border bg-card p-2 text-center">
                  <div className="text-[9px] text-muted-foreground">Bullish</div>
                  <div className="font-mono text-sm font-bold text-green-600">{impactStats?.bullish}</div>
                </div>
                <div className="rounded border border-border bg-card p-2 text-center">
                  <div className="text-[9px] text-muted-foreground">Neutral</div>
                  <div className="font-mono text-sm font-bold text-muted-foreground">{impactStats?.neutral}</div>
                </div>
                <div className="rounded border border-border bg-card p-2 text-center">
                  <div className="text-[9px] text-muted-foreground">Bearish</div>
                  <div className="font-mono text-sm font-bold text-red-600">{impactStats?.bearish}</div>
                </div>
              </div>
              <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                {(symbolImpact.impactItems || [])
                  .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
                  .slice(0, 10)
                  .map((item) => (
                    <div
                      key={item.key}
                      className="flex items-center justify-between rounded border border-border/50 bg-background px-2 py-1.5 text-[10px]"
                    >
                      <span className="flex items-center gap-1.5">
                        {item.direction === "bullish" ? (
                          <TrendingUp className="h-3 w-3 text-green-500" />
                        ) : item.direction === "bearish" ? (
                          <TrendingDown className="h-3 w-3 text-red-500" />
                        ) : (
                          <div className="h-3 w-3 text-muted-foreground" />
                        )}
                        {item.label}
                      </span>
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-mono font-semibold ${
                            item.impact > 0
                              ? "text-green-600"
                              : item.impact < 0
                              ? "text-red-500"
                              : "text-muted-foreground"
                          }`}
                        >
                          {item.impact > 0 ? "+" : ""}{item.impact.toFixed(1)}%
                        </span>
                        <span className="text-[9px] text-muted-foreground w-10 text-right">
                          {(item.confidence * 100).toFixed(0)}% conf
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
              <div className="mt-2 text-[9px] text-muted-foreground">
                Total impact score: {(symbolImpact.totalImpact ?? 0) > 0 ? "+" : ""}{(symbolImpact.totalImpact ?? 0).toFixed(1)}% · Real-time analysis
              </div>
            </div>
          ) : (
            <div className="p-3 text-center text-xs text-muted-foreground">
              <Info className="mx-auto h-4 w-4 mb-1" />
              No impact data available for this symbol
            </div>
          )}
        </div>
      )}

      {/* Calendar Table */}
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

      {/* Recent Market Events Footer */}
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