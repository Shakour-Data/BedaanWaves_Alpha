#!/usr/bin/env python3
"""
BedaanWaves — Full NASDAQ Data Fetch v2
Fetches OHLCV + fundamentals for ~5600 NASDAQ symbols.
Uses batch download for speed.
"""
import json
import sys
import time
import csv
import os
from datetime import datetime, timedelta

import yfinance as yf
import pandas as pd

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_MARKET = os.path.join(os.environ.get("TEMP", r"C:\Users\Administrator\AppData\Local\Temp"), "bedaan-real-market-data.json")
CSV_PATH = os.path.join(PROJECT_DIR, "nasdaq-listed-symbols.csv")
LOG_FILE = os.path.join(os.environ.get("TEMP", r"C:\Users\Administrator\AppData\Local\Temp"), "bedaan_data_fetch.log")

BATCH_SIZE = 200


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
            is_etf = row.get('ETF', 'N').strip().upper() == 'Y'
            test_issue = row.get('Test Issue', 'N').strip().upper() == 'Y'
            if test_issue:
                continue
            symbols.append({
                'ticker': ticker,
                'name': company_name[:200],
                'is_etf': is_etf,
            })
    return symbols


def log(msg):
    timestamp = datetime.now().isoformat()
    line = f"[{timestamp}] {msg}\n"
    with open(LOG_FILE, "a") as f:
        f.write(line)
    print(line.rstrip(), flush=True)


def main():
    log("=== BedaanWaves Full NASDAQ Data Fetch v2 ===")
    symbols = load_symbols()
    log(f"Loaded {len(symbols)} symbols")

    # Check for existing data (resume)
    existing_tickers = set()
    existing_per_ticker = {}
    if os.path.exists(OUT_MARKET):
        try:
            log("Loading existing data for resume...")
            with open(OUT_MARKET) as f:
                existing = json.load(f)
            existing_tickers = set(existing.get("tickers", []))
            existing_per_ticker = existing.get("per_ticker", {})
            log(f"Resuming with {len(existing_tickers)} existing tickers")
        except Exception as e:
            log(f"Could not load existing data: {e}")

    end = datetime.now().strftime("%Y-%m-%d")
    start = (datetime.now() - timedelta(days=800)).strftime("%Y-%m-%d")

    # Filter to only symbols not yet fetched
    to_fetch = [s for s in symbols if s['ticker'] not in existing_tickers]
    log(f"Symbols to fetch: {len(to_fetch)}/{len(symbols)}")

    all_per_ticker = dict(existing_per_ticker)
    all_tickers = list(existing_tickers)

    total = len(to_fetch)
    for batch_start in range(0, total, BATCH_SIZE):
        batch = to_fetch[batch_start:batch_start + BATCH_SIZE]
        batch_tickers = [s['ticker'] for s in batch]
        batch_num = batch_start // BATCH_SIZE + 1
        total_batches = (total + BATCH_SIZE - 1) // BATCH_SIZE

        log(f"Fetching OHLCV batch [{batch_num}/{total_batches}] ({batch_start+1}-{min(batch_start+BATCH_SIZE, total)})")

        # Skip tickers already fetched
        batch_tickers_to_fetch = [t for t in batch_tickers if t not in all_per_ticker]
        if not batch_tickers_to_fetch:
            log(f"  All already fetched, skipping")
            continue

        try:
            df = yf.download(
                tickers=" ".join(batch_tickers),
                start=start,
                end=end,
                interval="1d",
                auto_adjust=True,
                group_by="ticker",
                progress=False,
                threads=True,
                ignore_tz=False,
            )
        except Exception as e:
            log(f"  Batch download error: {e}")
            # Fallback: individual downloads
            for s in batch:
                ticker = s['ticker']
                try:
                    tk = yf.Ticker(ticker)
                    hist = tk.history(start=start, end=end, auto_adjust=True)
                    if not hist.empty:
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
                        all_per_ticker[ticker] = {"ohlcv": ohlcv, "info": {}}
                        all_tickers.append(ticker)
                except Exception as e2:
                    log(f"  Error {ticker}: {e2}")
            save_intermediate(all_per_ticker, all_tickers, start, end)
            time.sleep(5)
            continue

        for ticker in batch_tickers:
            try:
                if ticker in df.columns.get_level_values(0):
                    ticker_df = df[ticker]
                elif ticker in df.columns:
                    ticker_df = df[ticker]
                else:
                    continue

                if "Close" not in ticker_df.columns or ticker_df["Close"].empty:
                    continue

                rows = []
                for date, row in ticker_df.iterrows():
                    if pd.isna(row["Close"]):
                        continue
                    rows.append({
                        "date": date.strftime("%Y-%m-%d") if hasattr(date, 'strftime') else str(date),
                        "open": float(row["Open"]) if not pd.isna(row.get("Open")) else 0,
                        "high": float(row["High"]) if not pd.isna(row.get("High")) else 0,
                        "low": float(row["Low"]) if not pd.isna(row.get("Low")) else 0,
                        "close": float(row["Close"]),
                        "volume": float(row["Volume"]) if not pd.isna(row.get("Volume")) else 0,
                    })

                if rows:
                    all_per_ticker[ticker] = {"ohlcv": rows, "info": {}}
                    all_tickers.append(ticker)
            except Exception as e:
                log(f"  Error processing {ticker}: {e}")

        log(f"  Total with data: {len(all_tickers)}/{len(symbols)}")
        save_intermediate(all_per_ticker, all_tickers, start, end)

    # Save final output
    output = {
        "fetched_at": datetime.now().isoformat(),
        "window": {"start": start, "end": end},
        "macro": {},
        "tickers": all_tickers,
        "per_ticker": all_per_ticker,
        "source": "yfinance (REAL DATA — no mock)",
    }

    # Save to project directory
    proj_market = os.path.join(PROJECT_DIR, "src", "lib", "scoring", "seed", "real-market-data.json")
    try:
        with open(proj_market + ".tmp", "w") as f:
            json.dump(output, f)
        import shutil
        shutil.move(proj_market + ".tmp", proj_market)
        size_mb = os.path.getsize(proj_market) / 1e6
        log(f"=== DONE === Saved {size_mb:.1f} MB to project. {len(all_tickers)}/{len(symbols)} tickers with OHLCV data.")
    except Exception as e:
        log(f"Project save error: {e}")
        # Try temp location
        try:
            with open(OUT_MARKET, "w") as f:
                json.dump(output, f)
            log(f"Saved to temp: {OUT_MARKET}")
        except Exception as e2:
            log(f"Temp save error: {e2}")

    size_mb = os.path.getsize(OUT_MARKET) / 1e6
    log(f"=== DONE === Saved {size_mb:.1f} MB. {len(all_tickers)}/{total} tickers with OHLCV data.")


def save_intermediate(all_per_ticker, all_tickers, start, end):
    interim = {
        "fetched_at": datetime.now().isoformat(),
        "window": {"start": start, "end": end},
        "macro": {},
        "tickers": all_tickers,
        "per_ticker": all_per_ticker,
        "source": "yfinance (REAL DATA — no mock)",
    }
    try:
        tmp = OUT_MARKET + ".tmp"
        with open(tmp, "w") as f:
            json.dump(interim, f)
        import shutil
        shutil.move(tmp, OUT_MARKET)
    except Exception as e:
        log(f"  Save error: {e}")


if __name__ == "__main__":
    main()
