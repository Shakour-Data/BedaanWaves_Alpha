"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Filter, Download, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DIMENSION_KEYS, DIMENSION_META } from "@/lib/scoring/metric-universe";
import { gradeColor } from "@/lib/scoring/transforms";

interface Props {
  selectedTicker: string | null;
  onSelect: (ticker: string) => void;
}

interface RankingRow {
  rank: number;
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  marketCap: number;
  isEtf: boolean;
  overall: number;
  grade: string;
  coverage: number;
  ciLower: number;
  ciUpper: number;
  price: number;
  priceChange: number;
  volume: number;
  delta: number | null;
  dimensionScores: Record<string, number>;
  coefficientVersion: string;
}

const GRADES = ["All", "STRONG_BULLISH", "BULLISH", "NEUTRAL", "BEARISH", "STRONG_BEARISH"];

export function RankingsTable({ selectedTicker, onSelect }: Props) {
  const [search, setSearch] = useState("");
  const [sector, setSector] = useState("All");
  const [grade, setGrade] = useState("All");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [sort, setSort] = useState("overall");
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  // Fetch market status to populate sector filter
  const statusQ = useQuery({
    queryKey: ["market-status"],
    queryFn: async () => {
      const r = await fetch("/api/market-status");
      return r.json();
    },
  });

  const sectors = useMemo(() => {
    const list = (statusQ.data?.sectors ?? []).map((s: { sector: string }) => s.sector);
    return ["All", ...list];
  }, [statusQ.data]);

  const rankingsQ = useQuery({
    queryKey: ["rankings", { search, sector, grade, page, pageSize, sort, order }],
    queryFn: async () => {
      const sp = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sort,
        order,
      });
      if (search) sp.set("search", search);
      if (sector !== "All") sp.set("sector", sector);
      if (grade !== "All") sp.set("grade", grade);
      const r = await fetch(`/api/rankings?${sp}`);
      return r.json();
    },
    refetchInterval: 30_000,
  });

  const rows: RankingRow[] = rankingsQ.data?.rows ?? [];
  const total: number = rankingsQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const exportCsv = () => {
    window.open("/api/export?format=csv", "_blank");
  };
  const exportJson = () => {
    window.open("/api/export?format=json", "_blank");
  };

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="relative flex-1 min-w-[140px]">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search ticker / name / sector…"
            className="h-7 pl-7 text-xs"
          />
        </div>
        <Select value={sector} onValueChange={(v) => { setSector(v); setPage(1); }}>
          <SelectTrigger className="h-7 w-[120px] text-[10px]">
            <SelectValue placeholder="Sector" />
          </SelectTrigger>
          <SelectContent className="max-h-60">
            {sectors.map((s: string) => (
              <SelectItem key={s} value={s} className="text-[10px]">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={grade} onValueChange={(v) => { setGrade(v); setPage(1); }}>
          <SelectTrigger className="h-7 w-[110px] text-[10px]">
            <SelectValue placeholder="Grade" />
          </SelectTrigger>
          <SelectContent>
            {GRADES.map((g) => (
              <SelectItem key={g} value={g} className="text-[10px]">
                {g === "All" ? "All grades" : g.replace("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={exportCsv} title="Export CSV">
          <Download className="h-3 w-3" /> CSV
        </Button>
        <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={exportJson} title="Export JSON">
          <Download className="h-3 w-3" /> JSON
        </Button>
      </div>

      {/* Sort controls */}
      <div className="flex items-center gap-1 text-[10px]">
        <Filter className="h-3 w-3 text-muted-foreground" />
        <span className="text-muted-foreground">sort:</span>
        {[
          ["overall", "Overall"],
          ["priceChange", "Δ%"],
          ["marketCap", "Mkt Cap"],
          ["coverage", "Coverage"],
          ["ticker", "Ticker"],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => {
              if (sort === k) setOrder((o) => (o === "asc" ? "desc" : "asc"));
              else {
                setSort(k);
                setOrder(k === "ticker" ? "asc" : "desc");
              }
            }}
            className={`rounded px-1.5 py-0.5 ${
              sort === k
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {label} {sort === k ? (order === "asc" ? "↑" : "↓") : ""}
          </button>
        ))}
        <span className="ml-auto text-muted-foreground">
          {total} symbols · page {page}/{totalPages}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto rounded border border-border bg-card">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
            <tr className="text-left text-[10px] text-muted-foreground">
              <th className="px-2 py-1.5">#</th>
              <th className="px-2 py-1.5">Ticker</th>
              <th className="px-2 py-1.5 text-right">Overall</th>
              <th className="px-2 py-1.5 text-right">Δ</th>
              <th className="px-2 py-1.5 text-right">Grade</th>
              <th className="px-2 py-1.5 text-right">Price</th>
              <th className="px-2 py-1.5 text-right">Δ%</th>
              {DIMENSION_KEYS.map((d) => (
                <th
                  key={d}
                  className="hidden px-2 py-1.5 text-right md:table-cell"
                  style={{ color: DIMENSION_META[d].color }}
                  title={DIMENSION_META[d].label}
                >
                  {DIMENSION_META[d].label.slice(0, 4)}
                </th>
              ))}
              <th className="hidden px-2 py-1.5 text-right lg:table-cell">Cov</th>
            </tr>
          </thead>
          <tbody>
            {rankingsQ.isLoading && (
              <tr>
                <td colSpan={13}>
                  <Skeleton className="h-8 w-full" />
                </td>
              </tr>
            )}
            {!rankingsQ.isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={13} className="px-2 py-8 text-center text-muted-foreground">
                  No symbols match the current filters.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const selected = selectedTicker === r.ticker;
              return (
                <tr
                  key={r.ticker}
                  onClick={() => onSelect(r.ticker)}
                  className={`cursor-pointer border-b border-border/30 hover:bg-muted/50 ${
                    selected ? "bg-primary/10" : ""
                  }`}
                >
                  <td className="px-2 py-1.5 text-muted-foreground">{r.rank}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold">{r.ticker}</span>
                      {r.coefficientVersion === "uniform-cold-start" && (
                        <span className="rounded bg-amber-100 px-1 text-[8px] text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                          cold
                        </span>
                      )}
                    </div>
                    <div className="text-[9px] text-muted-foreground">{r.name.slice(0, 22)}</div>
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <span
                      className="font-mono font-bold"
                      style={{ color: gradeColor(r.grade as never) }}
                    >
                      {r.overall.toFixed(1)}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-[10px]">
                    {r.delta !== null ? (
                      <span style={{ color: r.delta >= 0 ? "#22c55e" : "#ef4444" }}>
                        {r.delta >= 0 ? "+" : ""}
                        {r.delta.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right text-[9px]" style={{ color: gradeColor(r.grade as never) }}>
                    {r.grade.replace("_", " ").slice(0, 8)}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono">${r.price.toFixed(2)}</td>
                  <td
                    className="px-2 py-1.5 text-right font-mono"
                    style={{ color: r.priceChange >= 0 ? "#22c55e" : "#ef4444" }}
                  >
                    {r.priceChange >= 0 ? "+" : ""}
                    {r.priceChange.toFixed(2)}%
                  </td>
                  {DIMENSION_KEYS.map((d) => {
                    const v = r.dimensionScores[d] ?? 50;
                    return (
                      <td
                        key={d}
                        className="hidden px-2 py-1.5 text-right font-mono md:table-cell"
                        style={{
                          color: v >= 60 ? "#22c55e" : v <= 40 ? "#ef4444" : "#475569",
                        }}
                      >
                        {v.toFixed(0)}
                      </td>
                    );
                  })}
                  <td className="hidden px-2 py-1.5 text-right font-mono text-[10px] text-muted-foreground lg:table-cell">
                    {(r.coverage * 100).toFixed(0)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-[10px]">
        <div className="text-muted-foreground">
          Latest: {rankingsQ.data?.latestAt ? new Date(rankingsQ.data.latestAt).toLocaleString() : "—"}
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[10px]"
            disabled={page <= 1}
            onClick={() => setPage(1)}
          >
            ⟪
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[10px]"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ‹
          </Button>
          <span className="px-2">
            {page} / {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[10px]"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            ›
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[10px]"
            disabled={page >= totalPages}
            onClick={() => setPage(totalPages)}
          >
            ⟫
          </Button>
        </div>
      </div>
    </div>
  );
}
