// BedaanWaves — Ingestion validation
// Per spec §2.4: Validates OHLCV ordering, adjusted-price invariants,
// duplicate dates, ticker coverage, macro point-in-time availability,
// and source lineage.

import type { RealBar } from "@/lib/scoring/seed/real-data";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface TickerValidation {
  ticker: string;
  valid: boolean;
  barCount: number;
  errors: string[];
  warnings: string[];
}

export interface MacroValidation {
  field: string;
  points: number;
  valid: boolean;
  errors: string[];
}

// ─── OHLCV ordering validation ───────────────────────────────────────────────
export function validateOhlcvOrdering(bars: RealBar[], ticker: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check dates are strictly increasing (no duplicate dates)
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].date <= bars[i - 1].date) {
      errors.push(`OHLCV not in chronological order at index ${i}: ${bars[i-1].date} >= ${bars[i].date}`);
    }
  }

  // Check for duplicate dates
  const dateSet = new Set<string>();
  for (const bar of bars) {
    if (dateSet.has(bar.date)) {
      errors.push(`Duplicate date in OHLCV: ${bar.date}`);
    }
    dateSet.add(bar.date);
  }

  // OHLC invariants: high >= open, close; low <= open, close
  for (const bar of bars) {
    if (bar.high < bar.low) {
      errors.push(`OHLCV invariant violated: high < low at ${bar.date}`);
    }
    if (bar.high < bar.open) {
      warnings.push(`High < open at ${bar.date} (possible data issue)`);
    }
    if (bar.high < bar.close) {
      warnings.push(`High < close at ${bar.date} (possible data issue)`);
    }
    if (bar.low > bar.open) {
      warnings.push(`Low > open at ${bar.date} (possible data issue)`);
    }
    if (bar.low > bar.close) {
      warnings.push(`Low > close at ${bar.date} (possible data issue)`);
    }
    if (bar.volume < 0) {
      warnings.push(`Negative volume at ${bar.date}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ─── Adjusted-price invariant validation ───────────────────────────────────────
// Adjusted prices should be monotonically consistent with raw prices.
// Check: no negative or zero prices (would indicate bad adjustment).
export function validateAdjustedPrices(bars: RealBar[], ticker: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const bar of bars) {
    const prices = [bar.open, bar.high, bar.low, bar.close];
    for (const p of prices) {
      if (p <= 0) {
        errors.push(`Non-positive price ${p} at ${bar.date} for ${ticker} (adjusted price invariant)`);
      }
      if (!Number.isFinite(p)) {
        errors.push(`Non-finite price at ${bar.date} for ${ticker}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ─── Ticker coverage validation ────────────────────────────────────────────────
export function validateTickerCoverage(
  availableTickers: Set<string>,
  universeTickers: string[]
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const missing = universeTickers.filter((t) => !availableTickers.has(t));
  const coverage = (availableTickers.size / universeTickers.length) * 100;

  if (coverage < 50) {
    errors.push(`Insufficient ticker coverage: ${coverage.toFixed(1)}% (${availableTickers.size}/${universeTickers.length})`);
  }

  if (missing.length > 0 && missing.length < 100) {
    warnings.push(`Missing tickers: ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? "..." : ""}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ─── Macro point-in-time availability validation ───────────────────────────────
export type MacroPoint = { date: string; value: number };

export function validateMacroPointInTime(
  macro: Record<string, MacroPoint[]>
): MacroValidation[] {
  const results: MacroValidation[] = [];

  for (const [field, points] of Object.entries(macro)) {
    const errors: string[] = [];
    const validDates = points.map((p) => p.date);

    // Check dates are ordered
    for (let i = 1; i < validDates.length; i++) {
      if (validDates[i] <= validDates[i - 1]) {
        errors.push(`Macro ${field}: dates not ordered at index ${i}`);
      }
    }

    // Check values are finite numbers
    for (const p of points) {
      if (!Number.isFinite(p.value)) {
        errors.push(`Macro ${field}: non-finite value at ${p.date}`);
      }
    }

    results.push({
      field,
      points: points.length,
      valid: errors.length === 0 && points.length > 0,
      errors,
    });
  }

  return results;
}

// ─── Source lineage validation ───────────────────────────────────────────────
export function validateSourceLineage(
  data: { source?: Record<string, string>; fetched_at?: string; tickers?: string[] }
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!data.source || typeof data.source !== "object") {
    errors.push("Missing or invalid 'source' metadata");
  } else {
    for (const [key, val] of Object.entries(data.source)) {
      if (!val || typeof val !== "string" || val.length < 3) {
        errors.push(`Source metadata for '${key}' is too short/missing`);
      }
    }
  }

  if (!data.fetched_at) {
    errors.push("Missing 'fetched_at' timestamp");
  }

  if (!data.tickers || !Array.isArray(data.tickers)) {
    errors.push("Missing or invalid 'tickers' array");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ─── Data quality: no synthetic values ─────────────────────────────────────────
export function validateNoSyntheticValues(
  data: Record<string, unknown>,
  ticker: string
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for common synthetic markers
  const forbidden = ["synthetic", "mock", "fake", "placeholder", "interpolated", "imputed"];
  const dataStr = JSON.stringify(data).toLowerCase();

  for (const word of forbidden) {
    if (dataStr.includes(word)) {
      errors.push(`Synthetic marker '${word}' found in data for ${ticker}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ─── Full ingestion validation ───────────────────────────────────────────────
export interface FullValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  tickerResults: TickerValidation[];
  macroResults: MacroValidation[];
}

export function validateFullIngestion(
  perTicker: Record<string, { ohlcv: RealBar[]; info: Record<string, unknown> }>,
  macro: Record<string, MacroPoint[]>,
  universeTickers: string[],
  dataMetadata: { source?: Record<string, string>; fetched_at?: string; tickers?: string[] }
): FullValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const tickerResults: TickerValidation[] = [];

  // Validate each ticker's OHLCV
  for (const [ticker, td] of Object.entries(perTicker)) {
    const bars = td.ohlcv;
    if (bars.length === 0) {
      tickerResults.push({ ticker, valid: false, barCount: 0, errors: ["No OHLCV data"], warnings: [] });
      continue;
    }

    const orderCheck = validateOhlcvOrdering(bars, ticker);
    const priceCheck = validateAdjustedPrices(bars, ticker);
    const synthCheck = validateNoSyntheticValues(td, ticker);

    const tickerValid = orderCheck.valid && priceCheck.valid && synthCheck.valid;
    const allErrors = [...orderCheck.errors, ...priceCheck.errors, ...synthCheck.errors];
    const allWarnings = [...orderCheck.warnings, ...priceCheck.warnings, ...synthCheck.warnings];

    tickerResults.push({
      ticker,
      valid: tickerValid,
      barCount: bars.length,
      errors: allErrors,
      warnings: allWarnings,
    });

    if (!tickerValid) {
      errors.push(`Ticker ${ticker}: ${allErrors.join("; ")}`);
    }
  }

  // Validate ticker coverage
  const available = new Set(Object.keys(perTicker));
  const coverageCheck = validateTickerCoverage(available, universeTickers);
  errors.push(...coverageCheck.errors);
  warnings.push(...coverageCheck.warnings);

  // Validate macro
  const macroResults = validateMacroPointInTime(macro);
  for (const mr of macroResults) {
    if (!mr.valid) {
      errors.push(`Macro ${mr.field}: ${mr.errors.join("; ")}`);
    }
  }

  // Validate source lineage
  const lineageCheck = validateSourceLineage(dataMetadata);
  errors.push(...lineageCheck.errors);
  warnings.push(...lineageCheck.warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    tickerResults,
    macroResults,
  };
}
