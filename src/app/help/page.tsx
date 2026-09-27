"use client";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  BookOpen,
  ChevronRight,
  Database,
  TrendingUp,
  BarChart3,
  ShieldCheck,
  Activity,
  Users,
  Settings,
  Layers,
  Clock,
  Globe,
  Gauge,
  FileSearch,
  LineChart,
  Search,
  Bell,
  Bookmark,
  X,
  AlertTriangle,
  ArrowUpDown,
  SlidersHorizontal,
  Columns,
  Download,
  Filter,
  Target,
  GitBranch,
  Hash,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Zap,
  Cpu,
  Star,
  Sparkles,
  Wrench,
  Code,
  Server,
  ArrowRight,
  ExternalLink,
  Table,
  Grid3x3,
  CandlestickChart,
  RefreshCw,
  CheckCircle2,
  Circle,
  TriangleAlert,
  Info,
  Lightbulb,
  PenTool,
  MousePointerClick,
  Keyboard,
} from "lucide-react";

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-primary/5 to-transparent">
        <div className="mx-auto max-w-6xl px-4 py-12 md:py-16">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <BookOpen className="h-5 w-5" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
              BedaanWaves Help Center
            </h1>
          </div>
          <p className="text-muted-foreground text-lg md:text-xl">
            Everything you need to know about the NASDAQ ML Scoring Engine.
            Complete documentation for all features, components, and workflows.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Badge variant="outline" className="text-xs">
              Spec v4.0 FINAL
            </Badge>
            <Badge variant="outline" className="text-xs">
              6 Dimensions · 44 Sub-Dimensions · 135 Aspects · 173 Sub-Aspects · 865+ Indicators
            </Badge>
            <Badge variant="outline" className="text-xs">
              Real Data · No Mock
            </Badge>
          </div>
        </div>
      </section>

      {/* Wrap main content with TooltipProvider */}
      <div className="mx-auto max-w-6xl px-4 py-8">
        <TooltipProvider>
        {/* Table of Contents */}
        <section className="mb-12">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
            <Target className="h-5 w-5 text-primary" />
            Table of Contents
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { title: "Getting Started", desc: "Quick start and authentication", tooltip: "Learn how to open the page, search symbols, and navigate the dashboard" },
              { title: "Dashboard Overview", desc: "Main layout and components", tooltip: "Explore the header, main content areas, and sidebar layout" },
              { title: "Rankings Table", desc: "Search, sort, filter, and export" },
              { title: "Symbol Drilldown", desc: "Deep dive into any ticker" },
              { title: "Market Sidebar", desc: "Universe stats, taxonomy, data freshness" },
              { title: "Watchlists & Alerts", desc: "Create lists and set price/score alerts" },
              { title: "Charts & Visualizations", desc: "Candlestick, heatmap, radar, gauge" },
              { title: "ML Scoring Engine", desc: "How the 6-dimension scoring works" },
              { title: "Technical Indicators", desc: "865+ indicators across all timeframes" },
              { title: "Data Sources & Freshness", desc: "yfinance, FRED, SEC, BEA, BLS" },
              { title: "Anti-Mock Verification", desc: "Guarantee of real, validated data" },
              { title: "Batch Processing", desc: "Processing pipeline and status tracking" },
              { title: "Export & API", desc: "CSV, JSON, and REST API endpoints", tooltip: "Export rankings and use API endpoints" },
              { title: "Provenance & Invariants", desc: "Data lineage and system guarantees" },
            ].map((item, i) => (
              <a key={i} href={`#section-${i + 1}`} className="group flex items-center gap-3 rounded-lg border border-border bg-card p-3 hover:bg-muted/50 hover:shadow-sm transition-all">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-primary/10 text-primary text-sm font-bold">
                  {i + 1}
                </div>
                <div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-primary/10 text-primary text-sm font-bold">
                        {i + 1}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent sideOffset={4} className="text-xs">
                      {item.tooltip}
                    </TooltipContent>
                  </Tooltip>
                  <div>
                    <div className="text-sm font-semibold group-hover:text-primary transition-colors">
                      {item.title}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {item.desc}
                    </div>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </section>

        {/* Section 1: Getting Started */}
<section id="section-1" className="mb-12">
           <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
             <Sparkles className="h-5 w-5 text-primary" /> 1. Getting Started
           </h2>
           <p className="mb-4 text-muted-foreground">
             BedaanWaves is a NASDAQ-exclusive, per-symbol machine learning
             hierarchical scoring and ranking engine. No mock data — every score
             traces to real, validated data from yfinance, FRED, SEC EDGAR, and
             published government statistics.
           </p>
           <Accordion type="single" collapsible className="w-full">
             <AccordionItem value="how-it-works">
               <AccordionTrigger>How Does the Scoring Work?</AccordionTrigger>
               <AccordionContent>
                 <div className="space-y-4">
                   <p>
                     BedaanWaves uses a 4-level hierarchical scoring architecture:
                   </p>
                   <div className="rounded-lg border border-border bg-card p-4">
                     <div className="flex items-center gap-2 text-sm font-semibold mb-3">
                       <GitBranch className="h-4 w-4 text-primary" />
                       Scoring Pipeline
                     </div>
                     <div className="flex flex-wrap items-center gap-2 text-xs">
                       <Badge>Level 1: Dimension</Badge>
                       <ArrowRight className="h-3 w-3 text-muted-foreground" />
                       <Badge variant="secondary">Level 2: Sub-Dimension</Badge>
                       <ArrowRight className="h-3 w-3 text-muted-foreground" />
                       <Badge variant="outline">Level 3: Aspect</Badge>
                       <ArrowRight className="h-3 w-3 text-muted-foreground" />
                       <Badge variant="outline">Level 4: Sub-Aspect → Indicator</Badge>
                     </div>
                   </div>
                   <p className="text-sm text-muted-foreground">
                     6 Dimensions → 44 Sub-Dimensions → 135 Aspects → 173 Sub-Aspects → 865+ Indicators.
                     Each symbol gets per-symbol ML-learned coefficients that weight each indicator.
                     The final score ranges from 0–100 with a 90% conformal confidence interval.
                   </p>
                 </div>
               </AccordionContent>
             </AccordionItem>
             <AccordionItem value="quick-start">
               <AccordionTrigger>Quick Start Guide</AccordionTrigger>
               <AccordionContent>
                 <ol className="list-decimal space-y-2 text-sm text-muted-foreground">
                   <li>Open the page — the rankings table loads automatically with all NASDAQ symbols.</li>
                   <li>Use the search bar in the header to find a specific ticker.</li>
                   <li>Click any symbol in the rankings table to see its detailed drilldown.</li>
                   <li>Explore the tabs: History, Radar, Macro, Coefficients, Decomposition, Peers, TV Chart, TV Tech.</li>
                   <li>Add the symbol to a watchlist or set an alert using the right panel.</li>
                 </ol>
               </AccordionContent>
             </AccordionItem>
             <AccordionItem value="color-codes">
               <AccordionTrigger>Grade Color Codes</AccordionTrigger>
               <AccordionContent>
                 <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                   {[
                     { grade: "STRONG_BULLISH", color: "#16a34a", desc: "Highest conviction signal" },
                     { grade: "BULLISH", color: "#22c55e", desc: "Strong positive signal" },
                     { grade: "NEUTRAL", color: "#a3a3a3", desc: "No clear directional bias" },
                     { grade: "BEARISH", color: "#f87171", desc: "Negative signal" },
                     { grade: "STRONG_BEARISH", color: "#dc2626", desc: "Highest conviction negative" },
                     { grade: "NO_DATA", color: "#6b7280", desc: "Insufficient data for scoring" },
                   ].map((g) => (
                     <div key={g.grade} className="flex items-center gap-2 rounded border border-border bg-card p-2">
                       <div className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: g.color }} />
                       <div>
                         <div className="text-xs font-mono font-bold">{g.grade.replace("_", " ")}</div>
                         <div className="text-[9px] text-muted-foreground">{g.desc}</div>
                       </div>
                     </div>
                   ))}
                 </div>
               </AccordionContent>
             </AccordionItem>
           </Accordion>
         </section>

        {/* Section 2: Dashboard Overview */}
        <section id="section-2" className="mb-12">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
            <Activity className="h-5 w-5 text-primary" /> 2. Dashboard Overview
          </h2>
          <p className="mb-4 text-muted-foreground">
            The main dashboard is organized into several key areas, each providing
            different views of the NASDAQ universe and individual symbol data.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2">Area</th>
                  <th className="px-3 py-2">Component</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">Location</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { area: "Header", component: "Search Bar", desc: "Real-time symbol search with autocomplete", loc: "Top-center" },
                  { area: "Header", component: "Export Button", desc: "Download rankings as CSV or JSON", loc: "Top-right" },
                  { area: "Header", component: "Batches Link", desc: "View batch processing status", loc: "Top-right" },
                  { area: "Ticker Strip", component: "MarketTicker", desc: "Scrolling ticker with live price updates", loc: "Below header" },
                  { area: "Main Left", component: "RankingsTable", desc: "Sortable, filterable symbol rankings", loc: "Left column" },
                  { area: "Main Right", component: "SymbolDrilldown", desc: "Detailed analysis for selected symbol", loc: "Right column" },
                  { area: "Main Bottom", component: "CandlestickChart", desc: "Real OHLCV candlestick chart (yfinance)", loc: "Bottom-left" },
                  { area: "Main Bottom", component: "Heatmap", desc: "NASDAQ stock heatmap visualization", loc: "Bottom-left" },
                  { area: "Main Bottom", component: "MarketOverview", desc: "Rates, commodities, FX overview", loc: "Bottom-right" },
                  { area: "Main Bottom", component: "EconomicCalendar", desc: "Government economic events calendar", loc: "Bottom-right" },
                  { area: "Sidebar", component: "MarketSidebar", desc: "Universe stats, taxonomy, data freshness", loc: "Bottom of screen" },
                  { area: "Footer", component: "Footer", desc: "Disclaimer and system status", loc: "Bottom of page" },
                ].map((row, i) => (
                  <tr key={i} className="border-b border-border/30 hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium">{row.area}</td>
                    <td className="px-3 py-2 font-mono text-xs">{row.component}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.desc}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{row.loc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 3: Rankings Table */}
        <section id="section-3" className="mb-12">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
            <Table className="h-5 w-5 text-primary" /> 3. Rankings Table
          </h2>
          <p className="mb-4 text-muted-foreground">
            The rankings table is the primary interface for browsing the NASDAQ
            universe. It displays real-time scores with multiple sorting, filtering,
            and export capabilities.
          </p>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="columns">
              <AccordionTrigger>Understanding Table Columns</AccordionTrigger>
              <AccordionContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-2 py-1 text-left">Column</th>
                        <th className="px-2 py-1 text-left">Description</th>
                        <th className="px-2 py-1 text-left">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ["#", "Rank position in the current sort order", "Number"],
                        ["Ticker", "Stock symbol and company name", "Text"],
                        ["Overall", "Final ML-scored value (0–100)", "Number"],
                        ["Δ", "Score change since last refresh", "Number"],
                        ["Grade", "BULLISH/BEARISH category", "Text"],
                        ["Price", "Current trading price", "Number"],
                        ["Δ%", "Percentage price change", "Number"],
                        ["Coverage", "% of indicators available for scoring", "Number"],
                        ["Status", "Processing pipeline status", "Text"],
                        ["Quality", "Data quality assessment", "Text"],
                        ...["fundamental", "technical", "sentiment", "risk", "macro", "ai"].map((d) => [
                          `${d.charAt(0).toUpperCase() + d.slice(1)} Score`,
                          `Dimension score (0–100)`,
                          "Number"
                        ]),
                      ].map(([col, desc, type], i) => (
                        <tr key={i} className="border-b border-border/30">
                          <td className="px-2 py-1 font-mono">{col}</td>
                          <td className="px-2 py-1 text-muted-foreground">{desc}</td>
                          <td className="px-2 py-1">{type}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Column visibility can be toggled using the <Columns className="inline h-3 w-3" /> button.
                  Preferences are saved to localStorage.
                </p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="sorting">
              <AccordionTrigger>Sorting</AccordionTrigger>
              <AccordionContent>
                <p className="mb-2 text-sm text-muted-foreground">
                  Click any column header to sort by that column. Click again to toggle between ascending and descending order.
                </p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ArrowUpDown className="h-4 w-4" />
                  Click column header → Sort
                  <span className="text-muted-foreground">|</span>
                  <ArrowUpDown className="h-4 w-4" />
                  Click again → Toggle direction
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="filtering">
              <AccordionTrigger>Filtering</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Each column has a filter button (
                    <SlidersHorizontal className="inline h-3 w-3" />). Click to open a filter popover:
                  </p>
                  <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                    <h4 className="text-sm font-semibold">Text Filters</h4>
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <div><kbd className="rounded bg-muted px-1">Contains</kbd> — Filter by substring match</div>
                      <div><kbd className="rounded bg-muted px-1">Does not contain</kbd> — Exclude matching rows</div>
                      <div><kbd className="rounded bg-muted px-1">Equals</kbd> — Exact match</div>
                      <div><kbd className="rounded bg-muted px-1">Starts with / Ends with</kbd> — Prefix/suffix match</div>
                      <div><kbd className="rounded bg-muted px-1">Is empty / Is not empty</kbd> — Null check</div>
                    </div>
                    <h4 className="text-sm font-semibold">Number Filters</h4>
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <div><kbd className="rounded bg-muted px-1">Greater than / Less than</kbd> — Range filter</div>
                      <div><kbd className="rounded bg-muted px-1">Between</kbd> — Range between two values</div>
                      <div><kbd className="rounded bg-muted px-1">Equals / Does not equal</kbd> — Exact numeric match</div>
                    </div>
                    <h4 className="text-sm font-semibold">Quick Filters</h4>
                    <div className="flex flex-wrap gap-1">
                      <span className="text-xs text-muted-foreground">Sector:</span>
                      <Badge variant="outline" className="cursor-pointer hover:bg-primary hover:text-primary-foreground">All</Badge>
                      <Badge variant="outline" className="cursor-pointer hover:bg-primary hover:text-primary-foreground">Technology</Badge>
                      <Badge variant="outline" className="cursor-pointer hover:bg-primary hover:text-primary-foreground">Healthcare</Badge>
                      <Badge variant="outline" className="cursor-pointer hover:bg-primary hover:text-primary-foreground">Finance</Badge>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <span className="text-xs text-muted-foreground">Grade:</span>
                      {["All grades", "STRONG_BULLISH", "BULLISH", "NEUTRAL", "BEARISH", "STRONG_BEARISH", "NO_DATA"].map((g) => (
                        <Badge key={g} variant="outline" className="cursor-pointer hover:bg-primary hover:text-primary-foreground text-[9px]">
                          {g.replace("_", " ")}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <span className="text-xs text-muted-foreground">Status:</span>
                      {["All statuses", "COEFFICIENTS_TRAINED", "UI_VERIFIED", "SCORED", "METRICS_READY", "RAW_VALIDATED", "RAW_FETCHED", "REGISTERED", "PARTIAL", "FAILED", "INSUFFICIENT_DATA"].map((s) => (
                        <Badge key={s} variant="outline" className="cursor-pointer hover:bg-primary hover:text-primary-foreground text-[9px]">
                          {s.replace("_", " ")}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="export">
              <AccordionTrigger>Exporting Data</AccordionTrigger>
              <AccordionContent>
                <p className="mb-3 text-sm text-muted-foreground">
                  You can export the current rankings in two formats:
                </p>
                <div className="space-y-2">
                  <Button variant="outline" className="w-full justify-start" onClick={() => window.open("/api/export?format=csv", "_blank")}>
                    <Download className="mr-2 h-4 w-4" /> Export as CSV
                  </Button>
                  <Button variant="outline" className="w-full justify-start" onClick={() => window.open("/api/export?format=json", "_blank")}>
                    <Download className="mr-2 h-4 w-4" /> Export as JSON
                  </Button>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Exports include all visible columns and current filters applied.
                </p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="cold-start">
              <AccordionTrigger>What is Cold-Start?</AccordionTrigger>
              <AccordionContent>
                <p className="mb-2 text-sm text-muted-foreground">
                  When a symbol is newly registered and hasn't completed its ML training cycle,
                  it displays a "cold-start" badge and uses uniform weights instead of per-symbol
                  coefficients. This is indicated by a yellow warning badge.
                </p>
                <p className="mb-2 text-sm text-muted-foreground">
                  The symbol will transition to full scoring once the training pipeline completes.
                  You can monitor its progress in the Market Sidebar under "Recent Batch".
                </p>
                <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400">
                  ⚠ Cold-start — training in progress
                </Badge>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>

        {/* Section 4: Symbol Drilldown */}
        <section id="section-4" className="mb-12">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
            <Target className="h-5 w-5 text-primary" /> 4. Symbol Drilldown
          </h2>
          <p className="mb-4 text-muted-foreground">
            Clicking any symbol in the rankings table opens its detailed analysis panel
            with multiple tabs for comprehensive investigation.
          </p>
          <div className="rounded-lg border border-border bg-card p-4 mb-4">
            <h3 className="mb-3 text-sm font-semibold">Header Information</h3>
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              {[
                ["Overall Score", "0–100 with conformal CI", "score"],
                ["Grade", "STRONG_BULLISH to STRONG_BEARISH", "grade"],
                ["Coverage", "% of indicators available", "coverage"],
                ["Stability Index", "Score consistency over time", "stability"],
                ["90% CI", "Confidence interval range", "ci"],
                ["Δ (Delta)", "Score change from previous", "delta"],
                ["Price", "Current trading price", "price"],
                ["Price Change %", "Percentage change", "change%"],
              ].map(([label, desc, key]) => (
                <div key={key} className="rounded border border-border bg-card p-2">
                  <div className="text-[9px] text-muted-foreground">{label}</div>
                  <div className="font-mono font-bold text-sm">{desc}</div>
                </div>
              ))}
            </div>
          </div>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="history-tab">
              <AccordionTrigger>Tab: History</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    The History tab displays a time-series chart of the symbol's overall score over time.
                  </p>
                  <ul className="list-disc space-y-1 text-sm text-muted-foreground pl-4">
                    <li>Hover tooltips show exact score, date, grade, conformal CI, and per-dimension breakdown</li>
                    <li>No gaps filled with mock data — only actual scored timestamps are shown</li>
                    <li>Spec reference: <code className="rounded bg-muted px-1 text-[10px]">§11.1</code></li>
                  </ul>
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="radar-tab">
              <AccordionTrigger>Tab: Radar</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    A 6-axis radar chart showing the current score plus historical and comparative overlays.
                  </p>
                  <ul className="list-disc space-y-1 text-sm text-muted-foreground pl-4">
                    <li>Current score + 30 days ago + NASDAQ median + Sector median overlays</li>
                    <li>Hover on vertex shows dimension score + top 3 contributing sub-dimensions</li>
                    <li>Spec reference: <code className="rounded bg-muted px-1 text-[10px]">§11.2</code></li>
                  </ul>
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="macro-tab">
              <AccordionTrigger>Tab: Macro</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Per-symbol macro dimension score broken down by sub-aspects from real published data.
                  </p>
                  <ul className="list-disc space-y-1 text-sm text-muted-foreground pl-4">
                    <li>GDP, Inflation, Interest Rates, FX, Commodities, Employment breakdown</li>
                    <li>Scores reflect real published data with time-series context</li>
                    <li>Data sourced from: BEA, BLS, Federal Reserve, U. Michigan</li>
                  </ul>
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="coefficients-tab">
              <AccordionTrigger>Tab: Coefficients</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Per-symbol ML-learned weights at all 4 hierarchy levels (L1/L2/L3/L4).
                  </p>
                  <ul className="list-disc space-y-1 text-sm text-muted-foreground pl-4">
                    <li>Confirm divergence — e.g., AAPL ≠ NVDA at the same timestamp</li>
                    <li>Compare against another ticker using the "Compare" search field</li>
                    <li>Spec reference: <code className="rounded bg-muted px-1 text-[10px]">§3.1 / §11.3</code></li>
                  </ul>
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="decomposition-tab">
              <AccordionTrigger>Tab: Decomposition</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    A waterfall chart breaking the overall score into per-level contributions.
                  </p>
                  <ul className="list-disc space-y-1 text-sm text-muted-foreground pl-4">
                    <li>Drill from L1 (Dimension) → L2 (Sub-Dimension) → L3 (Aspect) → L4 (Sub-Aspect)</li>
                    <li>Answers: "Why is this stock 72 instead of 85?"</li>
                    <li>Spec reference: <code className="rounded bg-muted px-1 text-[10px]">§11.8</code></li>
                  </ul>
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="peers-tab">
              <AccordionTrigger>Tab: Peers</AccordionTrigger>
              <AccordionContent>
                <p className="text-sm text-muted-foreground">
                  Side-by-side comparison of the selected symbol against its sector peers,
                  showing relative scores across all dimensions.
                </p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="tv-chart-tab">
              <AccordionTrigger>Tab: TV Chart</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Real candlestick chart rendered from yfinance OHLCV data (display-only per spec §12).
                  </p>
                  <ul className="list-disc space-y-1 text-sm text-muted-foreground pl-4">
                    <li>Supports zoom, pan, crosshair, and horizontal lines</li>
                    <li>Available time ranges: 1M, 3M, 6M, 1Y, MAX</li>
                    <li>TradingView free-tier embeds disabled due to data backend unreachability</li>
                    <li>Spec reference: <code className="rounded bg-muted px-1 text-[10px]">§12.4</code></li>
                  </ul>
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="tv-tech-tab">
              <AccordionTrigger>Tab: TV Tech</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Native technical analysis panel with 865+ indicators computed from real OHLCV data.
                  </p>
                  <div className="rounded-lg border border-border bg-card p-3">
                    <h4 className="mb-2 text-xs font-semibold">Available Indicator Categories</h4>
                    <div className="flex flex-wrap gap-1">
                      {["RSI", "MACD", "Bollinger Bands", "ADX", "ATR", "Stochastic", "Williams %R", "ROC", "OBV", "CMF", "VWAP", "Ichimoku", "Parabolic SAR", "Supertrend", "Vortex", "Z-Score", "Fisher Transform"].map((ind) => (
                        <Badge key={ind} variant="secondary" className="text-[9px]">{ind}</Badge>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    All indicators are computed natively from real market data.
                    Band indicators show overbought/oversold status.
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>

        {/* Section 5: Market Sidebar */}
        <section id="section-5" className="mb-12">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
            <Layers className="h-5 w-5 text-primary" /> 5. Market Sidebar
          </h2>
          <p className="mb-4 text-muted-foreground">
            The market sidebar provides real-time system status and universe-level statistics.
          </p>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="universe-stats">
              <AccordionTrigger>Universe Statistics</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span>Total Symbols</span><span className="font-mono">—</span></div>
                  <div className="flex justify-between"><span>Fully Processed</span><span className="font-mono">—</span></div>
                  <div className="flex justify-between"><span>Registered Only</span><span className="font-mono text-amber-600">—</span></div>
                  <div className="flex justify-between"><span>Snapshots</span><span className="font-mono">—</span></div>
                  <div className="flex justify-between"><span>Coefficients</span><span className="font-mono">—</span></div>
                  <div className="flex justify-between"><span>News Articles</span><span className="font-mono">—</span></div>
                  <div className="flex justify-between"><span>Cold-start Symbols</span><span className="font-mono text-amber-600">—</span></div>
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="taxonomy">
              <AccordionTrigger>Taxonomy Breakdown</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-1 text-sm">
                  {[
                    ["Dimensions", "6"],
                    ["Sub-Dimensions", "44"],
                    ["Aspects", "135"],
                    ["Sub-Aspects", "173"],
                    ["Indicators (min)", "865+"],
                    ["Daily Feature Variants", "5 per sub-aspect"],
                    ["Total Feature Entries", "865+ × 5 = 4,325+"],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-mono font-bold">{value}</span>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="grade-distribution">
              <AccordionTrigger>Grade Distribution</AccordionTrigger>
              <AccordionContent>
                <p className="mb-2 text-sm text-muted-foreground">
                  Real-time distribution of symbols across grade categories.
                </p>
                <div className="space-y-1 text-sm">
                  {[
                    ["STRONG_BULLISH", "#16a34a"],
                    ["BULLISH", "#22c55e"],
                    ["NEUTRAL", "#a3a3a3"],
                    ["BEARISH", "#f87171"],
                    ["STRONG_BEARISH", "#dc2626"],
                    ["NO_DATA", "#6b7280"],
                  ].map(([grade, color]) => (
                    <div key={grade} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                        <span className="font-mono">{grade.replace("_", " ")}</span>
                      </div>
                      <span className="font-mono">—</span>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="data-freshness">
              <AccordionTrigger>Data Freshness</AccordionTrigger>
              <AccordionContent>
                <p className="mb-2 text-sm text-muted-foreground">
                  Last updated timestamps for each data source. Auto-refreshes every
                  {` `}2 hours by default.
                </p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span>OHLCV (yfinance)</span><span>—</span></div>
                  <div className="flex justify-between"><span>Macro (FRED)</span><span>—</span></div>
                  <div className="flex justify-between"><span>News (SEC/Bloomberg)</span><span>—</span></div>
                  <div className="flex justify-between"><span>Auto-refresh Interval</span><span>2h</span></div>
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="quick-access">
              <AccordionTrigger>Quick Access (Top Ranked)</AccordionTrigger>
              <AccordionContent>
                <p className="mb-2 text-sm text-muted-foreground">
                  Click any symbol badge to quickly navigate to its drilldown.
                  Symbols without market cap data appear with reduced opacity
                  and show their processing status on hover.
                </p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>

        {/* Section 6: Watchlists & Alerts */}
        <section id="section-6" className="mb-12">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
            <Bookmark className="h-5 w-5 text-primary" /> 6. Watchlists & Alerts
          </h2>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="watchlists">
              <AccordionTrigger>Watchlists</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 text-sm">
                  <h4 className="font-semibold">Creating a Watchlist</h4>
                  <ol className="list-decimal space-y-1 pl-4 text-muted-foreground">
                    <li>Type a name in the "New list name" input</li>
                    <li>Click the + button or press Enter</li>
                    <li>Add symbols by typing a ticker in the list's input field</li>
                    <li>Click the + button or press Enter to add</li>
                    <li>Click the × on a badge to remove it</li>
                  </ol>
                  <h4 className="font-semibold">Managing Watchlists</h4>
                  <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                    <li>Click a badge to navigate to the symbol's drilldown</li>
                    <li>Delete a whole list using the trash icon</li>
                    <li>Watchlists persist across sessions</li>
                  </ul>
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="alerts">
              <AccordionTrigger>Alerts</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 text-sm">
                  <h4 className="font-semibold">Creating an Alert</h4>
                  <div className="rounded-lg border border-border bg-card p-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-muted-foreground">Ticker</label>
                        <input className="w-full rounded border border-border bg-background px-2 py-1 text-xs" placeholder="e.g. AAPL" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Threshold</label>
                        <input type="number" className="w-full rounded border border-border bg-background px-2 py-1 text-xs" placeholder="e.g. 80" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Metric</label>
                        <select className="w-full rounded border border-border bg-background px-2 py-1 text-xs">
                          <option>overall</option>
                          <option>fundamental</option>
                          <option>technical</option>
                          <option>sentiment</option>
                          <option>risk</option>
                          <option>macro</option>
                          <option>ai</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Condition</label>
                        <select className="w-full rounded border border-border bg-background px-2 py-1 text-xs">
                          <option>crosses_above</option>
                          <option>crosses_below</option>
                        </select>
                      </div>
                    </div>
                    <Button size="sm" className="mt-2 w-full">
                      <Bell className="mr-1 h-3 w-3" /> Create Alert
                    </Button>
                  </div>
                  <h4 className="font-semibold">Alert Conditions</h4>
                  <div className="space-y-1 text-muted-foreground">
                    <div><kbd className="rounded bg-muted px-1">crosses_above</kbd> — Alert when metric rises above threshold</div>
                    <div><kbd className="rounded bg-muted px-1">crosses_below</kbd> — Alert when metric falls below threshold</div>
                  </div>
                  <h4 className="font-semibold">Triggered Alerts</h4>
                  <p className="text-muted-foreground">
                    When an alert is triggered, a red "triggered" badge appears.
                    You can delete alerts using the trash icon.
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>

        {/* Section 7: Charts & Visualizations */}
        <section id="section-7" className="mb-12">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
            <BarChart3 className="h-5 w-5 text-primary" /> 7. Charts & Visualizations
          </h2>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="candlestick">
              <AccordionTrigger>Candlestick Chart</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 text-sm">
                  <div className="rounded-lg border border-border bg-card p-3">
                    <h4 className="mb-2 font-semibold">Features</h4>
                    <ul className="list-disc space-y-1 text-muted-foreground pl-4">
                      <li><strong>Crosshair</strong> — Move mouse to see exact OHLCV values</li>
                      <li><strong>Zoom</strong> — Scroll to zoom in/out on time range</li>
                      <li><strong>Pan</strong> — Click and drag to navigate time range</li>
                      <li><strong>H-Lines</strong> — Horizontal lines for support/resistance</li>
                      <li><strong>Time Ranges</strong> — 1M, 3M, 6M, 1Y, MAX buttons</li>
                      <li><strong>SMA/EMA/BB</strong> — Moving averages and Bollinger Bands overlaid</li>
                    </ul>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Data sourced from yfinance real OHLCV. Display-only per spec §12.
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="heatmap">
              <AccordionTrigger>Heatmap</AccordionTrigger>
              <AccordionContent>
                <p className="text-sm text-muted-foreground">
                  The NASDAQ stock heatmap provides a bird's-eye view of the entire market.
                  Each cell's size represents market cap and its color represents the score direction.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="secondary" className="bg-green-500/20 text-green-400">Strong Bullish</Badge>
                  <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-400">Bullish</Badge>
                  <Badge variant="secondary" className="bg-gray-500/20 text-gray-400">Neutral</Badge>
                  <Badge variant="secondary" className="bg-red-500/20 text-red-400">Bearish</Badge>
                  <Badge variant="secondary" className="bg-red-600/20 text-red-500">Strong Bearish</Badge>
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="market-overview">
              <AccordionTrigger>Market Overview & Economic Calendar</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 text-sm">
                  <h4 className="font-semibold">Market Overview</h4>
                  <p className="text-muted-foreground">
                    Real rates, commodities, and FX rates sourced from yfinance + FRED.
                    Includes: Fed Funds Rate, Treasury Yields, Gold, Oil, DXY, EUR/USD, GBP/USD, JPY/USD.
                  </p>
                  <h4 className="font-semibold">Economic Calendar</h4>
                  <p className="text-muted-foreground">
                    Real published government statistics from BEA, BLS, Federal Reserve, and U. Michigan.
                    Includes: GDP, CPI, PPI, Unemployment, Non-Farm Payrolls, Consumer Sentiment,
                    Housing Permits, Industrial Production.
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>

        {/* Section 8: ML Scoring Engine */}
        <section id="section-8" className="mb-12">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
            <Cpu className="h-5 w-5 text-primary" /> 8. ML Scoring Engine
          </h2>
          <p className="mb-4 text-muted-foreground">
            The core of BedaanWaves is its machine learning scoring engine that produces
            per-symbol, per-timestamp hierarchical scores.
          </p>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="scoring-pipeline">
              <AccordionTrigger>Scoring Pipeline</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 text-sm">
                  <div className="rounded-lg border border-border bg-card p-4">
                    <h4 className="mb-2 font-semibold">Pipeline Steps</h4>
                    <ol className="list-decimal space-y-1 text-muted-foreground pl-4">
                      <li>Data Ingestion — Fetch raw OHLCV, macro, news data</li>
                      <li>Validation — Validate raw data quality and completeness</li>
                      <li>Metric Computation — Calculate 865+ indicators from raw data</li>
                      <li>Feature Engineering — Create 5 variants per sub-aspect (raw, normalized, rolling_mean, rolling_volatility, lag_1)</li>
                      <li>Coefficient Training — ML-learned per-symbol weights at 4 hierarchy levels</li>
                      <li>Score Aggregation — Weighted sum across all dimensions → final 0–100 score</li>
                      <li>Conformal CI — Calculate 90% confidence interval</li>
                    </ol>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="coefficients">
              <AccordionTrigger>Per-Symbol Coefficients</AccordionTrigger>
              <AccordionContent>
                <p className="mb-2 text-sm text-muted-foreground">
                  Each symbol receives its own unique ML-learned coefficients that determine
                  how much weight each indicator contributes to the final score.
                </p>
                <p className="mb-2 text-sm text-muted-foreground">
                  This means AAPL and NVDA will have different coefficient weights at the same
                  timestamp, confirming divergence rather than uniform scoring.
                </p>
                <Badge variant="outline">Spec §3.1</Badge>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="conformal-ci">
              <AccordionTrigger>Conformal Confidence Intervals</AccordionTrigger>
              <AccordionContent>
                <p className="mb-2 text-sm text-muted-foreground">
                  Every score comes with a 90% conformal confidence interval, providing
                  statistical rigor to the scoring process.
                </p>
                <div className="rounded-lg border border-border bg-card p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Score:</span>
                    <span className="font-mono font-bold">72.5</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">90% CI:</span>
                    <span className="font-mono">[68.2, 76.8]</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Stability:</span>
                    <span className="font-mono">0.87</span>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="stability">
              <AccordionTrigger>Stability Index</AccordionTrigger>
              <AccordionContent>
                <p className="text-sm text-muted-foreground">
                  The stability index measures how consistent a symbol's score has been over time.
                  Values closer to 1.0 indicate high consistency; lower values indicate volatile scoring.
                </p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>

        {/* Section 9: Technical Indicators */}
        <section id="section-9" className="mb-12">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
            <Wrench className="h-5 w-5 text-primary" /> 9. Technical Indicators
          </h2>
          <p className="mb-4 text-muted-foreground">
            BedaanWaves computes 865+ technical indicators natively from real OHLCV data
            across multiple timeframes and categories.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-2 py-1 text-left">Category</th>
                  <th className="px-2 py-1 text-left">Indicators</th>
                  <th className="px-2 py-1 text-left">Timeframes</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Moving Averages", "SMA(20/50/200), EMA(12/26/50), WMA(10/20), DEMA, TEMA, T3, HULK, VWMA, TMA, SMMA", "Multiple"],
                  ["Momentum", "RSI(14), MACD Histogram, Stoch K/D/J, CCI(20), Williams %R, ROC(12/20), TRIX(15), Stoch RSI, Fisher Transform, Awesome Oscillator, Ultimate Oscillator, PVO, TSI", "12/14/15/20"],
                  ["Volatility", "BB %B, ATR Ratio, KAMA, Donchian Position, Stddev(20), Variance, Keltner Position, Mass Index, BB Width, Donchian Width", "10/20"],
                  ["Trend", "ADX(14), Ichimoku Score, Parabolic SAR, AROON Oscillator, Supertrend, Elder Ray, Vortex, Chandelier Exit", "14"],
                  ["Volume", "OBV Slope, CMF(20), AD Line Slope, VPT Slope, MFI(14), Ease of Movement, Chaikin Oscillator, Force Index, VWAP Distance, Volume ROC", "14/20"],
                  ["Support/Resistance", "Pivot Position, Fibonacci Position, Ichimoku Cloud Position", "Multiple"],
                  ["Cycles", "HMA Cycle, TMA Cycle", "Multiple"],
                ].map(([cat, ind, tf], i) => (
                  <tr key={i} className="border-b border-border/30">
                    <td className="px-2 py-1 font-medium">{cat}</td>
                    <td className="px-2 py-1 text-muted-foreground">{ind}</td>
                    <td className="px-2 py-1">{tf}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Feature Engineering: Each sub-aspect generates 5 daily variants (raw, normalized, rolling_mean, rolling_volatility, lag_1),
            producing ≥865 feature entries per day per symbol.
          </p>
        </section>

        {/* Section 10: Data Sources */}
        <section id="section-10" className="mb-12">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
            <Database className="h-5 w-5 text-primary" /> 10. Data Sources & Freshness
          </h2>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="yfinance">
              <AccordionTrigger>yfinance (OHLCV & Market Data)</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 text-sm">
                  <p>
                    Provides real OHLCV data, current prices, market caps, and market indicators.
                    Used for: candlestick charts, heatmap, market overview, price data.
                  </p>
                  <div className="rounded-lg border border-border bg-card p-3">
                    <h4 className="mb-1 font-semibold">Data Points</h4>
                    <ul className="list-disc space-y-1 text-muted-foreground pl-4">
                      <li>Open/High/Low/Close/Volume (OHLCV)</li>
                      <li>Current price, market cap, beta, trailing P/E</li>
                      <li>Market overview: Fed Funds Rate, Treasuries, Gold, Oil, DXY</li>
                    </ul>
                  </div>
                  <Badge variant="outline">Spec §12</Badge>
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="fred">
              <AccordionTrigger>FRED (Macroeconomic Data)</AccordionTrigger>
              <AccordionContent>
                <p className="text-sm text-muted-foreground">
                  Federal Reserve Economic Data provides real macro indicators including:
                  GDP, CPI, PPI, Interest Rates, Unemployment, Consumer Sentiment,
                  Housing Permits, Industrial Production, and more.
                </p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="sec">
              <AccordionTrigger>SEC EDGAR (Financial Fundamentals)</AccordionTrigger>
              <AccordionContent>
                <p className="text-sm text-muted-foreground">
                  SEC EDGAR provides official financial filings and fundamental data
                  including revenue, earnings, balance sheet items, and financial ratios.
                </p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="news">
              <AccordionTrigger>News Sources</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 text-sm">
                  <p>Real news aggregation from multiple sources:</p>
                  <ul className="list-disc space-y-1 text-muted-foreground pl-4">
                    <li>RSS Feeds — Aggregated financial news</li>
                    <li>SEC EDGAR — SEC filings and press releases</li>
                    <li>Yahoo Finance — Financial news and market commentary</li>
                  </ul>
                  <p className="text-xs text-muted-foreground">
                    Used for: Sentiment dimension scoring, news ribbon, news sentiment analysis.
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="refresh">
              <AccordionTrigger>Auto-Refresh & Data Freshness</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 text-sm">
                  <div className="rounded-lg border border-border bg-card p-3">
                    <h4 className="mb-2 font-semibold">Refresh Intervals</h4>
                    <div className="space-y-1">
                      <div className="flex justify-between"><span>OHLCV Data</span><span>Every 2 hours</span></div>
                      <div className="flex justify-between"><span>Macro Data</span><span>Every 2 hours</span></div>
                      <div className="flex justify-between"><span>News Data</span><span>Continuous</span></div>
                      <div className="flex justify-between"><span>Rankings Score</span><span>Every 30 seconds (stale query)</span></div>
                      <div className="flex justify-between"><span>Market Status</span><span>Every 30 seconds</span></div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Data freshness is displayed in the Market Sidebar under "Data Source".
                    Green indicators show recent updates; timestamps show last refresh time.
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>

        {/* Section 11: Anti-Mock Verification */}
        <section id="section-11" className="mb-12">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
            <ShieldCheck className="h-5 w-5 text-green-500" /> 11. Anti-Mock Verification
          </h2>
          <p className="mb-4 text-muted-foreground">
            BedaanWaves guarantees zero mock data. Every score, price, and indicator
            traces to real, validated data. The following invariants are enforced:
          </p>
          <div className="space-y-3">
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/30">
              <h3 className="mb-2 flex items-center gap-2 font-semibold text-green-700 dark:text-green-400">
                <CheckCircle2 className="h-5 w-5" />
                Invariant Checklist
              </h3>
              <ul className="space-y-1 text-sm text-green-700 dark:text-green-400">
                <li>✓ Zero mock records in the entire scoring pipeline</li>
                <li>✓ All displayed scores trace to validated raw_performance_scores rows</li>
                <li>✓ Point-in-time correct data (no look-ahead bias)</li>
                <li>✓ Per-symbol coefficients are unique (AAPL ≠ NVDA)</li>
                <li>✓ TradingView widgets are display-only, never feed scoring</li>
                <li>✓ Conformal confidence intervals calculated for all scores</li>
              </ul>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="mb-2 font-semibold">How to Verify</h3>
              <p className="mb-2 text-sm text-muted-foreground">
                Check the "Anti-Mock" panel in the Market Sidebar for real-time verification status.
              </p>
              <div className="rounded border border-green-200 bg-green-50 p-2 text-xs dark:border-green-900 dark:bg-green-950/30">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Validated Records</span>
                  <span className="font-mono font-bold">—</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Mock Records</span>
                  <span className="font-mono font-bold">0</span>
                </div>
                <div className="mt-1 text-[8px] text-green-600/70">spec §1.2 compliant</div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 12: Batch Processing */}
        <section id="section-12" className="mb-12">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
            <GitBranch className="h-5 w-5 text-primary" /> 12. Batch Processing
          </h2>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="pipeline">
              <AccordionTrigger>Processing Pipeline</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 text-sm">
                  <h4 className="font-semibold">Pipeline Stages</h4>
                  <div className="space-y-1">
                    {[
                      ["REGISTERED", "Symbol registered in the system"],
                      ["RAW_FETCHED", "Raw data fetched from sources"],
                      ["RAW_VALIDATED", "Raw data validated for quality"],
                      ["METRICS_READY", "All 865+ indicators computed"],
                      ["SCORED", "Scores computed with ML coefficients"],
                      ["COEFFICIENTS_TRAINED", "Per-symbol ML coefficients trained"],
                      ["UI_VERIFIED", "UI display verified"],
                      ["PARTIAL", "Partial processing (some data missing)"],
                      ["FAILED", "Processing failed — see error details"],
                      ["INSUFFICIENT_DATA", "Not enough data for scoring"],
                    ].map(([status, desc]) => (
                      <div key={status} className="flex items-start gap-2">
                        <Badge variant="outline" className="text-[9px] font-mono shrink-0">{status}</Badge>
                        <span className="text-muted-foreground">{desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="batches">
              <AccordionTrigger>Batch Status Tracking</AccordionTrigger>
              <AccordionContent>
                <p className="mb-2 text-sm text-muted-foreground">
                  The Market Sidebar "Recent Batch" section shows the latest processing batch:
                </p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span>Batch ID</span><span className="font-mono">—</span></div>
                  <div className="flex justify-between"><span>Selected Symbols</span><span className="font-mono">—</span></div>
                  <div className="flex justify-between"><span>Raw Success</span><span className="font-mono">—</span></div>
                  <div className="flex justify-between"><span>Scored</span><span className="font-mono">—</span></div>
                  <div className="flex justify-between"><span>Failed</span><span className="font-mono text-red-500">—</span></div>
                  <div className="flex justify-between"><span>Insufficient Data</span><span className="font-mono text-amber-500">—</span></div>
                  <div className="flex justify-between"><span>Partial</span><span className="font-mono text-amber-500">—</span></div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Click the "Batches" link in the header to view all batch processing history.
                </p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="seed">
              <AccordionTrigger>Seed & Data Generation</AccordionTrigger>
              <AccordionContent>
                <p className="mb-2 text-sm text-muted-foreground">
                  The seed endpoint (/api/seed) triggers full data generation for the NASDAQ universe.
                  This fetches real data from all sources and processes it through the scoring pipeline.
                </p>
                <div className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-center justify-between">
                    <span>Status</span>
                    <Badge variant="outline">—</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Symbols</span>
                    <span className="font-mono">—</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Snapshots</span>
                    <span className="font-mono">—</span>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>

        {/* Section 13: Export & API */}
        <section id="section-13" className="mb-12">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
            <Code className="h-5 w-5 text-primary" /> 13. Export & API
          </h2>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="export-csv">
              <AccordionTrigger>CSV Export</AccordionTrigger>
              <AccordionContent>
                <p className="mb-2 text-sm text-muted-foreground">
                  Export current rankings to CSV format. Includes all visible columns and active filters.
                </p>
                <div className="rounded-lg border border-border bg-card p-3">
                  <code className="text-xs">GET /api/export?format=csv</code>
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="export-json">
              <AccordionTrigger>JSON Export</AccordionTrigger>
              <AccordionContent>
                <p className="mb-2 text-sm text-muted-foreground">
                  Export current rankings to JSON format with full symbol details.
                </p>
                <div className="rounded-lg border border-border bg-card p-3">
                  <code className="text-xs">GET /api/export?format=json</code>
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="api-endpoints">
              <AccordionTrigger>API Endpoints Reference</AccordionTrigger>
              <AccordionContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-2 py-1 text-left">Endpoint</th>
                        <th className="px-2 py-1 text-left">Method</th>
                        <th className="px-2 py-1 text-left">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ["/api/rankings", "GET", "Fetch paginated rankings with filters"],
                        ["/api/scores/:ticker", "GET", "Get detailed score for a symbol"],
                        ["/api/scores/:ticker/history", "GET", "Get historical score timeline"],
                        ["/api/symbols", "GET", "Search/lookup symbols"],
                        ["/api/candles/:symbol", "GET", "Get OHLCV candle data"],
                        ["/api/market-status", "GET", "Get universe processing status"],
                        ["/api/watchlists", "GET", "Get all watchlists"],
                        ["/api/watchlists", "POST", "Create a new watchlist"],
                        ["/api/watchlists/:id/entries", "POST", "Add entry to watchlist"],
                        ["/api/watchlists/:id/entries", "DELETE", "Remove entry from watchlist"],
                        ["/api/watchlists/:id", "DELETE", "Delete watchlist"],
                        ["/api/alerts", "GET", "Get all alerts"],
                        ["/api/alerts", "POST", "Create a new alert"],
                        ["/api/alerts/:id", "DELETE", "Delete an alert"],
                        ["/api/export", "GET", "Export rankings (CSV/JSON)"],
                        ["/api/seed", "GET", "Trigger full data seed"],
                        ["/api/refresh", "GET", "Trigger data refresh"],
                        ["/api/ingestion/batches", "GET", "Get batch processing status"],
                      ].map(([endpoint, method, desc], i) => (
                        <tr key={i} className="border-b border-border/30">
                          <td className="px-2 py-1 font-mono text-primary">{endpoint}</td>
                          <td className="px-2 py-1">
                            <Badge variant={method === "GET" ? "secondary" : "default"} className="text-[9px]">
                              {method}
                            </Badge>
                          </td>
                          <td className="px-2 py-1 text-muted-foreground">{desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>

        {/* Section 14: Provenance & Invariants */}
        <section id="section-14" className="mb-12">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
            <Lock className="h-5 w-5 text-primary" /> 14. Provenance & Invariants
          </h2>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="provenance">
              <AccordionTrigger>Data Provenance</AccordionTrigger>
              <AccordionContent>
                <p className="mb-2 text-sm text-muted-foreground">
                  Every score and data point includes provenance information:
                </p>
                <div className="space-y-1 text-sm">
                  {[
                    ["Version", "Coefficient version identifier"],
                    ["Data Hash", "SHA hash of raw data used"],
                    ["Batch ID", "Processing batch identifier"],
                    ["Generation ID", "Full generation run identifier"],
                    ["Data Quality", "Quality assessment of the data"],
                    ["Snapshot ID", "Unique identifier for the scoring snapshot"],
                    ["Raw Data Hash", "Hash of the underlying raw data"],
                  ].map(([field, desc]) => (
                    <div key={field} className="flex items-center justify-between rounded border border-border bg-card p-2">
                      <span className="font-medium">{field}</span>
                      <span className="font-mono text-xs text-muted-foreground">{desc}</span>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="invariants">
              <AccordionTrigger>System Invariants</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 text-sm">
                  {[
                    "Per-symbol coefficients: Each symbol has unique ML weights",
                    "Zero mock data: No synthetic or generated data in the pipeline",
                    "Point-in-time correct: No look-ahead bias in historical scoring",
                    "TV display-only: TradingView widgets never influence scoring",
                    "Conformal CI: All scores include 90% confidence intervals",
                    "Anti-mock invariant verified: 0 mock records detected",
                  ].map((inv, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500 mt-0.5" />
                      <span>{inv}</span>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="spec">
              <AccordionTrigger>Technical Specification References</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-1 text-sm">
                  {[
                    ["§1", "Overview and architecture"],
                    ["§2", "Metric Universe taxonomy"],
                    ["§3", "Scoring algorithm"],
                    ["§11", "Visualization and display specs"],
                    ["§11.1", "History chart tooltip details"],
                    ["§11.2", "Radar chart overlays"],
                    ["§11.3", "Coefficient comparison"],
                    ["§11.8", "Waterfall decomposition"],
                    ["§12", "Data sourcing and display-only policy"],
                    ["§12.4", "Candlestick chart implementation"],
                  ].map(([ref, desc]) => (
                    <div key={ref} className="flex items-center gap-2">
                      <code className="rounded bg-muted px-1 text-xs font-mono">{ref}</code>
                      <span className="text-muted-foreground">{desc}</span>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>

        {/* Section 15: Keyboard Shortcuts & Interactions */}
        <section id="section-15" className="mb-12">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
            <Keyboard className="h-5 w-5 text-primary" /> 15. Keyboard Shortcuts & Interactions
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left">Action</th>
                  <th className="px-3 py-2 text-left">Shortcut</th>
                  <th className="px-3 py-2 text-left">Description</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Focus search", "Ctrl+K", "Open symbol search"],
                  ["Select symbol", "Enter", "Select highlighted symbol"],
                  ["Navigate tabs", "Alt+1-8", "Switch drilldown tabs"],
                  ["Sort column", "Click header", "Sort by column"],
                  ["Toggle column", "Click Columns", "Show/hide columns"],
                  ["Apply filter", "Click filter + Apply", "Filter table by column"],
                  ["Clear filters", "Click Clear all", "Reset all column filters"],
                  ["Export CSV", "Click CSV", "Download as CSV"],
                  ["Export JSON", "Click JSON", "Download as JSON"],
                  ["Switch chart view", "Chart/Heatmap buttons", "Toggle between chart and heatmap"],
                  ["Add to watchlist", "Type ticker + Enter", "Add symbol to current list"],
                  ["Create alert", "Fill form + Create", "Set new alert"],
                  ["Navigate to batches", "Click Batches link", "View batch processing"],
                  ["Refresh data", "Click Refresh", "Trigger data refresh"],
                ].map(([action, shortcut, desc]) => (
                  <tr key={action} className="border-b border-border/30">
                    <td className="px-3 py-2 font-medium">{action}</td>
                    <td className="px-3 py-2">
                      <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-mono">{shortcut}</kbd>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Disclaimer */}
        <section className="mb-12 rounded-lg border border-amber-200 bg-amber-50 p-6 dark:border-amber-900 dark:bg-amber-950/30">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-5 w-5" />
            Important Disclaimer
          </h2>
          <div className="space-y-2 text-sm text-amber-800 dark:text-amber-300">
            <p>
              BedaanWaves is a research and educational tool. Scores are algorithmic research signals
              derived from cross-sectional percentile transforms and per-symbol ML coefficients.
              They are not investment advice.
            </p>
            <p>
              Past performance does not guarantee future results. Always do your own due diligence
              before making investment decisions. TradingView widgets retain their own attribution
              and licensing terms.
            </p>
            <p className="text-xs opacity-75">
              Spec v4.0 FINAL · BedaanWaves — NASDAQ ML Scoring Engine
            </p>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-border bg-card px-4 py-6 text-center text-xs text-muted-foreground">
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground">BedaanWaves</span>
              <span className="text-muted-foreground">— Help Center</span>
            </div>
            <div className="flex items-center gap-4 text-[10px]">
              <span>Spec v4.0 FINAL</span>
              <span>·</span>
              <span>6 Dimensions · 44 Sub-Dims · 135 Aspects · 173 Sub-Aspects · 865+ Indicators</span>
            </div>
          </div>
        </footer>
      </TooltipProvider>
      </div>
    </div>
  );
}
