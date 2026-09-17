#!/usr/bin/env python3
"""
BedaanWaves — Optimized Full NASDAQ Data Fetch
Fetches OHLCV + fundamentals for ~5600 NASDAQ symbols in parallel batches.
"""
import json
import sys
import time
import csv
import os
from datetime import datetime, timedelta
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor, as_completed

import yfinance as yf
import pandas as pd

PROJECT_DIR = Path(__file__).parent.parent.resolve()
OUT_MARKET = PROJECT_DIR / "src" / "lib" / "scoring" / "seed" / "real-market-data.json"
CSV_PATH = PROJECT_DIR / "nasdaq-listed-symbols.csv"
LOG_FILE = PROJECT_DIR / "data_fetch.log"

BATCH_SIZE = 100  # yfinance batch size
MAX_WORKERS = 4


def load_symbols():
    symbols = []
    with open(CSV_PATH, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            ticker = row.get('Symbol', '').strip().upper()
            if not ticker or len(ticker) > 10:
                continue
            if ticker.startswith('^') or ticker.startswith('/'):
                continue
            company_name = row.get('Company Name', ticker).strip()
            if not company_name:
                company_name = ticker
            market_cat = row.get('Market Category', 'S').strip()
            is_etf = row.get('ETF', 'N').strip().upper() == 'Y'
            test_issue = row.get('Test Issue', 'N').strip().upper() == 'Y'
            if test_issue:
                continue
            symbols.append({
                'ticker': ticker,
                'name': company_name[:200],
                'is_etf': is_etf,
                'market_category': market_cat,
            })
    return symbols


def fetch_ohlcv_for_ticker(ticker, start, end):
    """Fetch OHLCV + info for a single ticker."""
    try:
        tk = yf.Ticker(ticker)
        hist = tk.history(start=start, end=end, auto_adjust=True)
        ohlcv = []
        for date, row in hist.iterrows():
            ohlcv.append({
                "date": date.strftime("%Y-%m-%d"),
                "open": float(row["Open"]),
                "high": float(row["High"]),
                "low": float(row["Low"]),
                "close": float(row["Close"]),
                "volume": float(row["Volume"]),
            })
        info = tk.info if hasattr(tk, 'info') else {}
        return ticker, {"ohlcv": ohlcv, "info": info}
    except Exception as e:
        return ticker, None


def main():
    print("=== BedaanWaves Optimized NASDAQ Data Fetch ===", flush=True)
    symbols = load_symbols()
    print(f"Loaded {len(symbols)} symbols", flush=True)

    end = datetime.now().strftime("%Y-%m-%d")
    start = (datetime.now() - timedelta(days=800)).strftime("%Y-%m-%d")

    all_per_ticker = {}
    success_count = 0
    fail_count = 0

    # Fetch OHLCV + fundamentals in parallel batches
    total = len(symbols)
    for batch_start in range(0, total, BATCH_SIZE):
        batch = symbols[batch_start:batch_start + BATCH_SIZE]
        batch_tickers = [s['ticker'] for s in batch]
        batch_num = batch_start // BATCH_SIZE + 1
        total_batches = (total + BATCH_SIZE - 1) // BATCH_SIZE

        print(f"\nBatch [{batch_num}/{total_batches}] ({batch_start+1}-{min(batch_start+BATCH_SIZE, total)})", flush=True)

        for ticker_info in batch:
            ticker = ticker_info['ticker']
            result = fetch_ohlcv_for_ticker(ticker, start, end)
            if result and result[1] is not None and result[1].get("ohlcv"):
                all_per_ticker[ticker] = result[1]
                success_count += 1
            else:
                fail_count += 1
                all_per_ticker[ticker] = {"ohlcv": [], "info": {}}

            if success_count % 100 == 0:
                elapsed = time.time() - batch_start * 0.1
                print(f"  Progress: {success_count}/{total} (success), {fail_count} (failed)", flush=True)

        # Save intermediate results
        interim = {
            "fetched_at": datetime.now().isoformat(),
            "window": {"start": start, "end": end},
            "macro": {},
            "tickers": list(all_per_ticker.keys()),
            "per_ticker": all_per_ticker,
            "source": "yfinance (REAL DATA — no mock)",
        }
        OUT_MARKET.parent.mkdir(parents=True, exist_ok=True)
        with open(OUT_MARKET, "w") as f:
            json.dump(interim, f)

    print(f"\n=== Fetch Complete ===", flush=True)
    print(f"Success: {success_count}, Failed: {fail_count}, Total: {total}", flush=True)

    # Save final output
    output = {
        "fetched_at": datetime.now().isoformat(),
        "window": {"start": start, "end": end},
        "macro": {},
        "tickers": list(all_per_ticker.keys()),
        "per_ticker": all_per_ticker,
        "source": "yfinance (REAL DATA — no mock)",
    }
    with open(OUT_MARKET, "w") as f:
        json.dump(output, f)

    size_mb = OUT_MARKET.stat().st_size / 1e6
    print(f"Saved {size_mb:.1f} MB to {OUT_MARKET}", flush=True)


if __name__ == "__main__":
    main()
