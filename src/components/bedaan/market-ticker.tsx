"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { gradeColor } from "@/lib/scoring/transforms";

interface TickerItem {
  ticker: string;
  name: string;
  price: number;
  priceChange: number;
  overall: number;
  grade: string;
}

interface Props {
  onSymbolClick?: (ticker: string) => void;
}

export function MarketTicker({ onSymbolClick }: Props) {
  const offsetRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);

  const { data } = useQuery({
    queryKey: ["ticker-tape"],
    queryFn: async () => {
      const r = await fetch("/api/ticker?limit=100");
      const j = await r.json();
      return j.items as TickerItem[];
    },
    refetchInterval: 30_000,
  });

  const items = data ?? [];

  useEffect(() => {
    if (paused || items.length === 0) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      offsetRef.current -= (dt / 16) * 0.7;
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

  const doubled = [...items, ...items];

  return (
    <div
      className="sticky top-9 z-30 flex h-7 items-center overflow-hidden border-b border-border bg-muted/30 backdrop-blur"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        ref={scrollRef}
        className="flex whitespace-nowrap will-change-transform"
      >
        {doubled.length === 0 ? (
          <span className="px-3 text-[11px] text-muted-foreground">
            Loading ticker…
          </span>
        ) : (
          doubled.map((it, i) => (
            <button
              key={`${it.ticker}-${i}`}
              onClick={() => onSymbolClick?.(it.ticker)}
              className="group inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] hover:bg-background/60"
              title={`${it.name} · overall ${it.overall.toFixed(1)} (${it.grade})`}
            >
              <span className="font-bold">{it.ticker}</span>
              <span className="font-mono">${it.price.toFixed(2)}</span>
              <span
                className="font-mono"
                style={{
                  color: it.priceChange >= 0 ? "#22c55e" : "#ef4444",
                }}
              >
                {it.priceChange >= 0 ? "▲" : "▼"}
                {Math.abs(it.priceChange).toFixed(2)}%
              </span>
              <span
                className="rounded px-1 font-mono text-[10px]"
                style={{
                  background: gradeColor(it.grade as never) + "22",
                  color: gradeColor(it.grade as never),
                }}
              >
                {it.overall.toFixed(0)} {it.grade.replace("_", " ").slice(0, 4)}
              </span>
              <span className="text-muted-foreground/30">·</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
