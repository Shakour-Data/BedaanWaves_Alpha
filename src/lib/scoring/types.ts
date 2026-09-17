// BedaanWaves — scoring types

import type { DimensionKey } from "./metric-universe";
import type { Grade } from "./transforms";

export interface HierarchicalScore {
  ticker: string;
  capturedAt: string; // ISO
  overall: number;
  grade: Grade;
  signals: string[];
  coverage: number;
  ciLower: number;
  ciUpper: number;
  stabilityIndex: number;
  price: number;
  priceChange: number;
  volume: number;
  dimensionScores: Record<DimensionKey, number>;
  subDimensionScores: Record<string, number>;
  aspectScores: Record<string, number>;
  subAspectScores: Record<string, number>;
  coefficientVersion: string;
  dataQuality: string;
}

export interface CoefficientBundle {
  ticker: string;
  level: "dimensions" | "sub_dimensions" | "aspects" | "sub_aspects" | "timeframe";
  weights: Record<string, number>;
  trainedAt: string;
  sampleCount: number;
  version: string;
  dataHash: string;
  driftStatus: "OK" | "DRIFT" | "RETRAINED";
  oosR2: number | null;
  oosIc: number | null;
  shapTopKeys: string[] | null;
  coldStart: boolean;
  regime: "calm" | "stressed";
}

export interface SymbolMeta {
  ticker: string;
  name: string;
  exchange: string;
  sector: string;
  industry: string;
  marketCap: number;
  isEtf: boolean;
}

export interface RankingRow {
  rank: number;
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  marketCap: number;
  overall: number;
  prevOverall: number | null;
  delta: number | null;
  grade: string;
  coverage: number;
  ciLower: number;
  ciUpper: number;
  price: number;
  priceChange: number;
  dimensionScores: Record<DimensionKey, number>;
  coldStart: boolean;
}

export interface TraceRecord {
  ticker: string;
  snapshotId: string;
  capturedAt: string;
  dataQuality: string;
  coefficientVersion: string;
  rawDataHash: string;
  isProcessed: boolean;
  sampleCount: number;
}
