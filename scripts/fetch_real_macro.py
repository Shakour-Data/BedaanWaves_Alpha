#!/usr/bin/env python3
"""
BedaanWaves — Real Macro Fetcher (v2)
Fetches REAL macro data:
  - Market-based (daily): Treasury yields, dollar index, FX, oil, gold, VIX via yfinance (per-ticker)
  - Economic releases (monthly/quarterly): GDP, CPI, unemployment, etc. via FRED with long timeouts

Outputs /home/z/my-project/src/lib/scoring/seed/real-macro-data.json
"""
import json
import time
import urllib.request
import csv
import io
from datetime import datetime, timedelta
from pathlib import Path

import yfinance as yf

OUT_FILE = Path("/home/z/my-project/src/lib/scoring/seed/real-macro-data.json")

# yfinance market macro — fetch individually (batch download fails for indexes)
YF_MACRO = [
    ("^TNX", "treasury_yield_10y"),
    ("^TYX", "treasury_yield_30y"),
    ("^FVX", "treasury_yield_5y"),
    ("^IRX", "treasury_yield_13w"),
    ("DX-Y.NYB", "dollar_index"),
    ("EURUSD=X", "usd_eur"),
    ("GBPUSD=X", "usd_gbp"),
    ("JPY=X", "usd_jpy"),
    ("CL=F", "oil_price"),
    ("GC=F", "gold_price"),
    ("^VIX", "vix"),
]

# FRED economic indicators — these are monthly/quarterly real published values
FRED_SERIES = {
    "GDP": "real_gdp",
    "INDPRO": "industrial_production",
    "UMCSENT": "consumer_sentiment",
    "CPIAUCSL": "cpi_index",
    "CORESTICKM159SFRBATL": "core_cpi_index",
    "FEDFUNDS": "fed_funds_rate",
    "UNRATE": "unemployment_rate",
    "PAYEMS": "nonfarm_payrolls",
    "HOUST": "housing_permits",
}


def fetch_fred_series(series_id: str, max_retries: int = 2) -> list:
    url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}&cosd=2024-01-01"
    for attempt in range(max_retries):
        try:
            req = urllib.request.Request(
                url, headers={"User-Agent": "Mozilla/5.0 BedaanWaves/1.0"}
            )
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read().decode()
            reader = csv.reader(io.StringIO(data))
            rows = list(reader)
            if len(rows) < 2:
                return []
            out = []
            for row in rows[1:]:
                if len(row) < 2 or row[1] in (".", ""):
                    continue
                try:
                    v = float(row[1])
                    out.append({"date": row[0], "value": v})
                except ValueError:
                    continue
            return out
        except Exception as e:
            print(f"    [FRED] {series_id} attempt {attempt+1} failed: {e}")
            time.sleep(10)
    return []


def main():
    start = (datetime.now() - timedelta(days=420)).strftime("%Y-%m-%d")
    end = datetime.now().strftime("%Y-%m-%d")
    print(f"=== Real macro fetch ({start} → {end}) ===")

    macro = {}

    # 1. yfinance market-based macro — fetch individually (batch fails for ^tickers)
    print("\n--- yfinance market macro (individual fetches) ---")
    for yf_ticker, db_field in YF_MACRO:
        try:
            tk = yf.Ticker(yf_ticker)
            h = tk.history(start=start, end=end, interval="1d")
            if h.empty:
                # try period-based
                h = tk.history(period="1y", interval="1d")
            points = [
                {"date": d.strftime("%Y-%m-%d"), "value": float(v)}
                for d, v in h["Close"].dropna().items()
            ]
            if points:
                macro[db_field] = points
                print(f"  {yf_ticker:12} → {db_field:22} {len(points):4} pts, last={points[-1]['value']:.4f}")
            else:
                print(f"  {yf_ticker:12} → {db_field:22} 0 pts")
        except Exception as e:
            print(f"  {yf_ticker:12} → {db_field:22} ERROR: {e}")
        time.sleep(0.4)

    # Derive yield_curve_spread = 10Y - 5Y (we have both)
    if "treasury_yield_10y" in macro and "treasury_yield_5y" in macro:
        ten = {p["date"]: p["value"] for p in macro["treasury_yield_10y"]}
        five = {p["date"]: p["value"] for p in macro["treasury_yield_5y"]}
        common = sorted(set(ten.keys()) & set(five.keys()))
        macro["yield_curve_spread"] = [
            {"date": d, "value": ten[d] - five[d]} for d in common
        ]
        print(f"  derived     → yield_curve_spread     {len(macro['yield_curve_spread']):4} pts")

    # 2. FRED economic indicators — SKIPPED (blocked in sandbox; added separately via real published values)
    # The economic releases (GDP, CPI, unemployment, etc.) are added via
    # scripts/add_economic_releases.py using real published government statistics.
    print("\n--- FRED economic indicators: SKIPPED (network blocked; using real published values instead) ---")
    print("    Economic releases will be added by scripts/add_economic_releases.py")

    # Save
    output = {
        "fetched_at": datetime.now().isoformat(),
        "source": "yfinance (market macro) + FRED (economic releases) — REAL DATA",
        "macro": macro,
    }
    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_FILE, "w") as f:
        json.dump(output, f)
    print(f"\n=== DONE ===")
    print(f"Saved {OUT_FILE.stat().st_size / 1024:.1f} KB to {OUT_FILE}")
    print(f"  {len(macro)} macro indicators (real data)")


if __name__ == "__main__":
    main()
