"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Newspaper, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NewsItem {
  id: string;
  headline: string;
  source: string;
  url: string | null;
  publishedAt: string;
  sentiment: "bullish" | "bearish" | "neutral";
  severity: "critical" | "notable" | "informational";
  tickers: string[];
}

interface Props {
  onSymbolClick?: (ticker: string) => void;
}

const sentimentColor: Record<string, string> = {
  bullish: "text-green-600 dark:text-green-400",
  bearish: "text-red-600 dark:text-red-400",
  neutral: "text-muted-foreground",
};

const severityDot: Record<string, string> = {
  critical: "bg-red-500",
  notable: "bg-amber-500",
  informational: "bg-slate-400",
};

export function NewsRibbon({ onSymbolClick }: Props) {
  const [paused, setPaused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);

  const { data } = useQuery({
    queryKey: ["news"],
    queryFn: async () => {
      const r = await fetch("/api/news?limit=30");
      const j = await r.json();
      return j.items as NewsItem[];
    },
    refetchInterval: 60_000,
  });

  const items = data ?? [];

  useEffect(() => {
    if (paused) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      offsetRef.current -= (dt / 16) * 0.5; // px per frame
      // wrap when we've scrolled past the first copy
      if (scrollRef.current) {
        const w = scrollRef.current.scrollWidth / 2;
        if (-offsetRef.current > w) offsetRef.current += w;
        scrollRef.current.style.transform = `translateX(${offsetRef.current}px)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, items.length]);

  // Duplicate items so the marquee loops seamlessly
  const doubled = [...items, ...items];

  return (
    <div className="sticky top-0 z-40 flex items-center gap-2 border-b border-border bg-background/95 backdrop-blur">
      <div className="flex h-full shrink-0 items-center gap-1.5 bg-primary px-2 py-1.5 text-primary-foreground">
        <Newspaper className="h-3.5 w-3.5" />
        <span className="text-[10px] font-bold uppercase tracking-wide">News</span>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <div
          ref={scrollRef}
          className="flex whitespace-nowrap will-change-transform"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {doubled.length === 0 ? (
            <span className="px-2 py-1.5 text-[11px] text-muted-foreground">
              Loading market news…
            </span>
          ) : (
            doubled.map((n, i) => (
              <span
                key={`${n.id}-${i}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px]"
              >
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                    severityDot[n.severity]
                  }`}
                  title={n.severity}
                />
                <span className="font-semibold">{n.headline}</span>
                <span className="text-muted-foreground">— {n.source}</span>
                <span className="text-muted-foreground/60">
                  · {formatTime(n.publishedAt)}
                </span>
                <span className={`text-[10px] uppercase ${sentimentColor[n.sentiment]}`}>
                  {n.sentiment}
                </span>
                {n.tickers.slice(0, 4).map((t) => (
                  <button
                    key={t}
                    onClick={() => onSymbolClick?.(t)}
                    className="rounded bg-muted px-1 py-0 font-mono text-[10px] hover:bg-primary hover:text-primary-foreground"
                  >
                    {t}
                  </button>
                ))}
                <span className="text-muted-foreground/30">|</span>
              </span>
            ))
          )}
        </div>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="mr-1 h-6 w-6 shrink-0 p-0"
        onClick={() => setPaused((p) => !p)}
        title={paused ? "Resume" : "Pause"}
      >
        {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
      </Button>
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}
