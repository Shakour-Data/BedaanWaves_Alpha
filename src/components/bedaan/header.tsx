"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Activity, TrendingUp, Layers } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

interface SymbolHit {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  marketCap: number;
  isEtf: boolean;
  processingStatus?: string | null;
  batchId?: string | null;
  generationId?: string | null;
  dataQuality?: string | null;
}

interface Props {
  onSymbolSelect: (ticker: string) => void;
}

export function Header({ onSymbolSelect }: Props) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const hitsQ = useQuery({
    queryKey: ["symbol-search", q],
    queryFn: async () => {
      const r = await fetch(`/api/symbols?q=${encodeURIComponent(q)}&limit=10`);
      const j = await r.json();
      return j.symbols as SymbolHit[];
    },
    enabled: q.length > 0,
  });

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const hits = hitsQ.data ?? [];

  return (
    <header className="sticky top-16 z-40 flex h-12 items-center gap-3 border-b border-border bg-background/95 px-3 backdrop-blur">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded bg-primary text-primary-foreground">
          <Activity className="h-4 w-4" />
        </div>
        <div className="flex flex-col leading-none">
          <span className="text-sm font-bold tracking-tight">
            BedaanWaves
          </span>
          <span className="text-[9px] text-muted-foreground">
            NASDAQ per-symbol ML scoring
          </span>
        </div>
        <Badge variant="outline" className="ml-1 hidden text-[9px] sm:inline-flex">
          v4.0 FINAL
        </Badge>
      </div>

      <div ref={ref} className="relative ml-auto w-full max-w-xs">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search NASDAQ symbols…"
          className="h-7 pl-7 text-xs"
        />
        {open && q.length > 0 && (
          <div className="absolute left-0 right-0 top-8 z-50 max-h-72 overflow-y-auto rounded border border-border bg-popover shadow-lg">
            {hits.length === 0 ? (
              <div className="px-3 py-2 text-[10px] text-muted-foreground">
                No matches in NASDAQ universe.
              </div>
            ) : (
              hits.map((h) => (
                <button
                  key={h.ticker}
                  onClick={() => {
                    onSymbolSelect(h.ticker);
                    setOpen(false);
                    setQ("");
                  }}
                  className="flex w-full items-center justify-between gap-2 border-b border-border/50 px-2 py-1.5 text-left text-[11px] last:border-0 hover:bg-muted/60"
                >
                  <div>
                    <span className="font-bold">{h.ticker}</span>{" "}
                    <span className="text-muted-foreground">{h.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
                    {h.isEtf && <Badge variant="outline" className="text-[8px]">ETF</Badge>}
                    {h.processingStatus && h.processingStatus !== "REGISTERED" && (
                      <Badge variant="outline" className="text-[8px]">
                        {h.processingStatus}
                      </Badge>
                    )}
                    <span>{h.sector}</span>
                    <span className="font-mono">
                      {h.marketCap > 0 ? `$${(h.marketCap / 1e9).toFixed(0)}B` : '—'}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <a
        href="/api/export?format=csv"
        className="hidden items-center gap-1 rounded border border-border px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted/60 sm:flex"
        title="Export rankings to CSV"
      >
        <TrendingUp className="h-3 w-3" /> Export
      </a>
      <Link
        href="/batches"
        className="hidden items-center gap-1 rounded border border-border px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted/60 sm:flex"
        title="Batch candlestick charts"
      >
        <Layers className="h-3 w-3" /> Batches
      </Link>
    </header>
  );
}
