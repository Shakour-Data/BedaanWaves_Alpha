"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Columns,
  Download,
  Filter,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { DIMENSION_KEYS, DIMENSION_META, type DimensionKey } from "@/lib/scoring/metric-universe";
import { gradeColor } from "@/lib/scoring/transforms";
import type {
  RankingColumnFilter,
  RankingColumnKey,
  RankingFilterOperator,
} from "@/lib/scoring/queries";

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
  processingStatus?: string | null;
  batchId?: string | null;
  generationId?: string | null;
  dataQuality?: string | null;
}

type ColumnKind = "text" | "number";

interface ColumnDefinition {
  key: RankingColumnKey;
  label: string;
  shortLabel?: string;
  kind: ColumnKind;
  align?: "left" | "right";
  responsiveClass?: string;
}

const GRADES = ["All", "STRONG_BULLISH", "BULLISH", "NEUTRAL", "BEARISH", "STRONG_BEARISH"];

const TEXT_OPERATORS: Array<{ value: RankingFilterOperator; label: string }> = [
  { value: "contains", label: "Contains" },
  { value: "notContains", label: "Does not contain" },
  { value: "equals", label: "Equals" },
  { value: "notEquals", label: "Does not equal" },
  { value: "startsWith", label: "Starts with" },
  { value: "endsWith", label: "Ends with" },
  { value: "isNull", label: "Is empty" },
  { value: "isNotNull", label: "Is not empty" },
];

const NUMBER_OPERATORS: Array<{ value: RankingFilterOperator; label: string }> = [
  { value: "equals", label: "Equals" },
  { value: "notEquals", label: "Does not equal" },
  { value: "greaterThan", label: "Greater than" },
  { value: "lessThan", label: "Less than" },
  { value: "between", label: "Between" },
  { value: "isNull", label: "Is empty" },
  { value: "isNotNull", label: "Is not empty" },
];

const COLUMN_DEFINITIONS: ColumnDefinition[] = [
  { key: "rank", label: "#", kind: "number", align: "right" },
  { key: "ticker", label: "Ticker", kind: "text", align: "left" },
  { key: "overall", label: "Overall", kind: "number", align: "right" },
  { key: "delta", label: "Δ", kind: "number", align: "right" },
  { key: "grade", label: "Grade", kind: "text", align: "right" },
  { key: "price", label: "Price", kind: "number", align: "right" },
  { key: "priceChange", label: "Δ%", kind: "number", align: "right" },
  { key: "marketCap", label: "Mkt Cap", kind: "number", align: "right", responsiveClass: "hidden md:table-cell" },
  { key: "coverage", label: "Coverage", kind: "number", align: "right", responsiveClass: "hidden lg:table-cell" },
  ...DIMENSION_KEYS.map(
    (d) =>
      ({
        key: `dimension.${d}` as RankingColumnKey,
        label: DIMENSION_META[d].label,
        shortLabel: DIMENSION_META[d].label.slice(0, 4),
        kind: "number" as const,
        align: "right" as const,
        responsiveClass: "hidden md:table-cell",
      }) as ColumnDefinition,
  ),
  { key: "processingStatus", label: "Status", kind: "text", align: "left", responsiveClass: "hidden lg:table-cell" },
  { key: "batchId", label: "Batch", kind: "text", align: "left", responsiveClass: "hidden xl:table-cell" },
  { key: "generationId", label: "Gen", kind: "text", align: "left", responsiveClass: "hidden xl:table-cell" },
  { key: "dataQuality", label: "Quality", kind: "text", align: "left", responsiveClass: "hidden xl:table-cell" },
];

const ALL_COLUMN_KEYS = COLUMN_DEFINITIONS.map((column) => column.key);

function ColumnFilterPopover({
  column,
  filter,
  onApply,
}: {
  column: ColumnDefinition;
  filter?: RankingColumnFilter;
  onApply: (filter: RankingColumnFilter | undefined) => void;
}) {
  const [operator, setOperator] = useState<RankingFilterOperator>(
    filter?.operator ?? (column.kind === "text" ? "contains" : "greaterThan"),
  );
  const [value, setValue] = useState(filter?.value ?? "");
  const [value2, setValue2] = useState(filter?.value2 ?? "");

  const operators = column.kind === "text" ? TEXT_OPERATORS : NUMBER_OPERATORS;
  const needsValue = !["isNull", "isNotNull"].includes(operator);
  const needsValue2 = operator === "between";
  const hasFilter = !!filter;

  return (
    <div className="space-y-2 w-56">
      <div className="flex items-center justify-between">
        <Label className="text-[10px] font-medium">{column.label} filter</Label>
        {hasFilter && (
          <span className="h-2 w-2 rounded-full bg-primary" title="Active filter" />
        )}
      </div>
      <div>
        <Label className="text-[9px] text-muted-foreground">Operator</Label>
        <Select
          value={operator}
          onValueChange={(v) => setOperator(v as RankingFilterOperator)}
        >
          <SelectTrigger className="h-7 text-[10px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {operators.map((op) => (
              <SelectItem key={op.value} value={op.value} className="text-[10px]">
                {op.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {needsValue && (
        <>
          <Input
            type={column.kind === "number" ? "number" : "text"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-7 text-[10px]"
            placeholder={column.kind === "number" ? "Value" : "Text"}
          />
          {needsValue2 && (
            <Input
              type="number"
              value={value2}
              onChange={(e) => setValue2(e.target.value)}
              className="h-7 text-[10px]"
              placeholder="Max value"
            />
          )}
        </>
      )}
      <div className="flex gap-1">
        <Button
          size="sm"
          className="h-6 flex-1 text-[10px]"
          onClick={() => {
            if (needsValue && !value.trim()) return;
            const newFilter: RankingColumnFilter = {
              key: column.key,
              operator,
              ...(needsValue ? { value } : {}),
              ...(needsValue2 ? { value2 } : {}),
            };
            onApply(newFilter);
          }}
        >
          Apply
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-6 flex-1 text-[10px]"
          onClick={() => onApply(undefined)}
        >
          Clear
        </Button>
      </div>
    </div>
  );
}

function RankingCell({ column, row }: { column: ColumnDefinition; row: RankingRow }) {
  const alignmentClass =
    column.align === "right"
      ? "text-right"
      : column.align === "left"
        ? "text-left"
        : "";
  const responsiveClass = column.responsiveClass ?? "";

  switch (column.key) {
    case "rank":
      return <td className={`px-2 py-1.5 ${alignmentClass} ${responsiveClass}`}>{row.rank}</td>;
    case "ticker":
      return (
        <td className="px-2 py-1.5">
          <div className="flex items-center gap-1.5">
            <span className="font-bold">{row.ticker}</span>
            {row.coefficientVersion === "uniform-cold-start" && (
              <span className="rounded bg-amber-100 px-1 text-[8px] text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                cold
              </span>
            )}
          </div>
          <div className="text-[9px] text-muted-foreground">{row.name.slice(0, 22)}</div>
        </td>
      );
    case "overall":
      return (
        <td className={`px-2 py-1.5 ${alignmentClass} ${responsiveClass}`}>
          <span className="font-mono font-bold" style={{ color: gradeColor(row.grade as never) }}>
            {row.overall.toFixed(1)}
          </span>
        </td>
      );
    case "delta":
      return (
        <td className={`px-2 py-1.5 font-mono text-[10px] ${alignmentClass} ${responsiveClass}`}>
          {row.delta !== null ? (
            <span style={{ color: row.delta >= 0 ? "#22c55e" : "#ef4444" }}>
              {row.delta >= 0 ? "+" : ""}
              {row.delta.toFixed(2)}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
      );
    case "grade":
      return (
        <td className={`px-2 py-1.5 text-[9px] ${alignmentClass} ${responsiveClass}`} style={{ color: gradeColor(row.grade as never) }}>
          {row.grade.replace("_", " ").slice(0, 8)}
        </td>
      );
    case "price": {
      const livePrice = (row as unknown as Record<string, unknown>).livePrice as number | undefined;
      const priceDisplay = livePrice ?? row.price;
      return (
        <td className={`px-2 py-1.5 font-mono ${alignmentClass} ${responsiveClass}`}>
          ${priceDisplay.toFixed(2)}
          {livePrice != null && (
            <span className="ml-1 rounded px-0.5 py-0 text-[8px] bg-green-500/20 text-green-400 font-mono">LIVE</span>
          )}
        </td>
      );
    }
    case "priceChange":
      return (
        <td className={`px-2 py-1.5 font-mono ${alignmentClass} ${responsiveClass}`} style={{ color: row.priceChange >= 0 ? "#22c55e" : "#ef4444" }}>
          {row.priceChange >= 0 ? "+" : ""}
          {row.priceChange.toFixed(2)}%
        </td>
      );
    case "marketCap":
      return (
        <td className={`px-2 py-1.5 font-mono ${alignmentClass} ${responsiveClass}`}>
          {row.marketCap > 0
            ? (row.marketCap >= 1e12 ? (row.marketCap / 1e12).toFixed(2) + "T" : (row.marketCap / 1e9).toFixed(1) + "B")
            : "—"}
        </td>
      );
    case "coverage":
      return (
        <td className={`px-2 py-1.5 font-mono text-[10px] text-muted-foreground ${alignmentClass} ${responsiveClass}`}>
          {(row.coverage * 100).toFixed(0)}%
        </td>
      );
    case "processingStatus":
      return (
        <td className={`px-2 py-1.5 ${alignmentClass} ${responsiveClass}`}>
          {row.processingStatus && (
            <Badge variant="outline" className="text-[8px]">
              {row.processingStatus.replace("_", " ")}
            </Badge>
          )}
        </td>
      );
    case "batchId":
      return <td className={`px-2 py-1.5 text-left text-[9px] text-muted-foreground ${responsiveClass}`}>{row.batchId?.slice(-12) ?? "—"}</td>;
    case "generationId":
      return <td className={`px-2 py-1.5 text-left text-[9px] text-muted-foreground ${responsiveClass}`}>{row.generationId?.slice(-12) ?? "—"}</td>;
    case "dataQuality":
      return <td className={`px-2 py-1.5 text-left text-[9px] text-muted-foreground ${responsiveClass}`}>{row.dataQuality ?? "—"}</td>;
    default:
      if (column.key.startsWith("dimension.")) {
        const dimension = column.key.slice("dimension.".length) as DimensionKey;
        const value = row.dimensionScores[dimension] ?? 50;
        return (
          <td className={`px-2 py-1.5 font-mono ${alignmentClass} ${responsiveClass}`} style={{ color: value >= 60 ? "#22c55e" : value <= 40 ? "#ef4444" : "#475569" }}>
            {value.toFixed(0)}
          </td>
        );
      }
      return <td className={`px-2 py-1.5 ${responsiveClass}`} />;
  }
}

export function RankingsTable({ selectedTicker, onSelect }: Props) {
  const [search, setSearch] = useState("");
  const [sector, setSector] = useState("All");
  const [grade, setGrade] = useState("All");
  const [processingStatus, setProcessingStatus] = useState("All");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [sort, setSort] = useState<RankingColumnKey>("overall");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [columnFilters, setColumnFilters] = useState<
    Partial<Record<RankingColumnKey, RankingColumnFilter>>
  >({});
  const [openPopover, setOpenPopover] = useState<RankingColumnKey | null>(null);
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<RankingColumnKey[]>(() => {
    if (typeof window === "undefined") return ALL_COLUMN_KEYS;
    try {
      const saved = window.localStorage.getItem("rankings-visible-columns");
      const parsed: unknown = saved ? JSON.parse(saved) : null;
      if (
        Array.isArray(parsed) &&
        parsed.length > 0 &&
        parsed.every((key) => ALL_COLUMN_KEYS.includes(key as RankingColumnKey))
      ) {
        return parsed as RankingColumnKey[];
      }
    } catch {
      return ALL_COLUMN_KEYS;
    }
    return ALL_COLUMN_KEYS;
  });

  const activeColumnFilters = useMemo(
    () =>
      Object.values(columnFilters).filter(Boolean) as RankingColumnFilter[],
    [columnFilters],
  );
  const visibleColumnKeySet = useMemo(
    () => new Set(visibleColumnKeys),
    [visibleColumnKeys],
  );

  useEffect(() => {
    window.localStorage.setItem(
      "rankings-visible-columns",
      JSON.stringify(visibleColumnKeys),
    );
  }, [visibleColumnKeys]);

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

  const statuses = ["All", "COEFFICIENTS_TRAINED", "UI_VERIFIED", "SCORED", "METRICS_READY", "RAW_VALIDATED", "RAW_FETCHED", "REGISTERED", "PARTIAL", "FAILED", "INSUFFICIENT_DATA"];

  const rankingsQ = useQuery({
    queryKey: ["rankings", { search, sector, grade, processingStatus, page, pageSize, sort, order, columnFilters }],
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
      if (processingStatus !== "All") sp.set("processingStatus", processingStatus);
      if (activeColumnFilters.length > 0) {
        sp.set("columnFilters", JSON.stringify(activeColumnFilters));
      }
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
  const visibleColumnCount = COLUMN_DEFINITIONS.filter((column) =>
    visibleColumnKeySet.has(column.key),
  ).length;

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
        <Select value={processingStatus} onValueChange={(v) => { setProcessingStatus(v); setPage(1); }}>
          <SelectTrigger className="h-7 w-[180px] text-[10px]">
            <SelectValue placeholder="Processing Status" />
          </SelectTrigger>
          <SelectContent className="max-h-60">
            {["All", "COEFFICIENTS_TRAINED", "UI_VERIFIED", "SCORED", "METRICS_READY", "RAW_VALIDATED", "RAW_FETCHED", "REGISTERED", "PARTIAL", "FAILED", "INSUFFICIENT_DATA"].map((s) => (
              <SelectItem key={s} value={s} className="text-[10px]">
                {s === "All" ? "All statuses" : s.replace("_", " ")}
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
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" title="Show or hide columns">
              <Columns className="h-3 w-3" /> Columns
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 p-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <Label className="text-[10px] font-medium">Columns</Label>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-1.5 text-[9px]"
                onClick={() => setVisibleColumnKeys(ALL_COLUMN_KEYS)}
              >
                Reset
              </Button>
            </div>
            <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
              {COLUMN_DEFINITIONS.map((column) => (
                <label key={column.key} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[10px] hover:bg-muted/60">
                  <input
                    type="checkbox"
                    checked={visibleColumnKeySet.has(column.key)}
                    disabled={
                      visibleColumnKeys.length === 1 &&
                      visibleColumnKeySet.has(column.key)
                    }
                    onChange={(event) => {
                      setVisibleColumnKeys((current) =>
                        event.target.checked
                          ? [...current, column.key]
                          : current.filter((key) => key !== column.key),
                      );
                    }}
                    className="h-3 w-3 accent-primary"
                  />
                  <span>{column.label}</span>
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Sort & filter controls */}
      <div className="flex flex-wrap items-center gap-1 text-[10px]">
        <Filter className="h-3 w-3 text-muted-foreground" />
        <span className="text-muted-foreground">sort:</span>
        {COLUMN_DEFINITIONS.map((col) => (
          <div key={col.key} className="relative flex items-center gap-0.5">
            <button
              onClick={() => {
                if (sort === col.key) setOrder((o) => (o === "asc" ? "desc" : "asc"));
                else {
                  setSort(col.key);
                  setOrder(col.key === "ticker" ? "asc" : "desc");
                }
              }}
              className={`rounded px-1.5 py-0.5 ${
                sort === col.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {col.label} {sort === col.key ? (order === "asc" ? "↑" : "↓") : ""}
            </button>
            <Popover
              open={openPopover === col.key}
              onOpenChange={(open) => setOpenPopover(open ? col.key : null)}
            >
              <PopoverTrigger asChild>
                <button
                  className={`relative rounded p-0.5 ${
                    columnFilters[col.key]
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-muted/70"
                  }`}
                  title={`Filter ${col.label}`}
                >
                  <SlidersHorizontal className="h-3 w-3" />
                  {columnFilters[col.key] && (
                    <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="p-0">
                {openPopover === col.key && (
                  <ColumnFilterPopover
                    column={col}
                    filter={columnFilters[col.key]}
                    onApply={(filter) => {
                      setColumnFilters((prev) => {
                        if (!filter) {
                          const next = { ...prev };
                          delete next[col.key];
                          return next;
                        }
                        return { ...prev, [col.key]: filter };
                      });
                      setPage(1);
                      setOpenPopover(null);
                    }}
                  />
                )}
              </PopoverContent>
            </Popover>
          </div>
        ))}
        {activeColumnFilters.length > 0 && (
          <button
            onClick={() => {
              setColumnFilters({});
              setPage(1);
            }}
            className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted/70"
            title="Clear all column filters"
          >
            Clear all
            <X className="h-3 w-3 inline ml-0.5" />
          </button>
        )}
        <span className="ml-auto text-muted-foreground">
          {total} symbols · page {page}/{totalPages}
        </span>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-auto rounded border border-border bg-card">
        <table className="w-full min-w-max text-[11px]">
          <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
            <tr className="text-left text-[10px] text-muted-foreground">
              {COLUMN_DEFINITIONS.map((column) =>
                visibleColumnKeySet.has(column.key) ? (
                  <th
                    key={column.key}
                    className={`px-2 py-1.5 ${
                      column.align === "right"
                        ? "text-right"
                        : column.align === "left"
                          ? "text-left"
                          : ""
                    } ${column.responsiveClass ?? ""}`}
                    style={
                      column.key.startsWith("dimension.")
                        ? {
                            color:
                              DIMENSION_META[
                                column.key.slice("dimension.".length) as DimensionKey
                              ].color,
                          }
                        : undefined
                    }
                    title={column.label}
                  >
                    {column.shortLabel ?? column.label}
                  </th>
                ) : null,
              )}
            </tr>
          </thead>
          <tbody>
            {rankingsQ.isLoading && (
              <tr>
                <td colSpan={visibleColumnCount}>
                  <Skeleton className="h-8 w-full" />
                </td>
              </tr>
            )}
            {!rankingsQ.isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={visibleColumnCount} className="px-2 py-8 text-center text-muted-foreground">
                  No symbols match the current filters.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const selected = selectedTicker === row.ticker;
              return (
                <tr
                  key={row.ticker}
                  onClick={() => onSelect(row.ticker)}
                  className={`cursor-pointer border-b border-border/30 hover:bg-muted/50 ${
                    selected ? "bg-primary/10" : ""
                  }`}
                >
                  {COLUMN_DEFINITIONS.map(
                    (column) =>
                      visibleColumnKeySet.has(column.key) && (
                        <RankingCell key={column.key} column={column} row={row} />
                      ),
                  )}
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
