#!/usr/bin/env python3
"""
BedaanWaves — Real Data Fetcher
Fetches REAL NASDAQ market data via yfinance (OHLCV + fundamentals) and REAL macro
indicators via FRED (Treasury yields, Fed funds, CPI, GDP, etc.). Outputs JSON for
the TypeScript seed pipeline.

Per spec §1.1: DATA_PROVIDER=yfinance (exclusive for scoring).
Per spec §1.2: NO mock/synthetic data anywhere.
"""
import json
import sys
import time
import urllib.request
import csv
import io
from datetime import datetime, timedelta
from pathlib import Path

import yfinance as yf
import pandas as pd

# Real NASDAQ tickers — high-liquidity, well-known symbols across sectors.
# yfinance has rate limits, so we target ~80 to be safe.
NASDAQ_TICKERS = [
    # Mega-cap tech
    "AAPL","MSFT","NVDA","GOOGL","GOOG","AMZN","META","TSLA","AVGO","COST","NFLX","TMUS","ASML","AMD","ADBE",
    # Large tech / semis
    "PEP","CSCO","QCOM","INTU","AMGN","BKNG","ISRG","VRTX","AMAT","ADI","PANW","MU","GILD","MDLZ","REGN","MRVL","LRCX","KLAC","SNPS","CDNS","CRWD","TXN","INTC","PYPL","SBUX","ABNB",
    # Consumer / healthcare / industrial
    "MELI","FTNT","ORLY","ODFL","CPRT","MAR","CHTR","KDP","AEP","LULU","MNST","CCEP","FAST","GEHC","FANG","CTAS","EA","MRNA","DLTR","CSX","MCHP","ZS","BKR","TTWO","ANET","VRSK","BIIB","GD","ADSK","NXPI","PCAR","ROST","GFS",
    # High-growth / newer
    "ARM","DASH","DDOG","SNOW","NET","MDB","OKTA","PINS","RIVN","COIN","PLTR","SHOP","ZM","DOCU",
    # ETFs for market context
    "QQQ","QQQM","SPY","SMH","XLK","IBB","TLT","GLD","USO",
    # Financials / Utilities / Telecom / Pharma (added for full coverage)
    "BAC","PCG","T","PFE","NOK","NU","BB",
    # Block, Inc. (formerly SQ, ticker changed to XYZ on Jan 21, 2025)
    "XYZ",
]

# FRED macro indicators -> db_field mapping
FRED_SERIES = {
    # GDP block
    "GDP": "real_gdp",            # quarterly, billions $
    "INDPRO": "industrial_production",
    "CAPUTL": "capacity_utilization",
    "HOUST": "housing_permits",   # thousands, monthly
    "UMCSENT": "consumer_sentiment",
    # Inflation
    "CPIAUCSL": "cpi_index",
    "CORESTICKM159SFRBATL": "core_cpi_index",
    # Interest rates
    "FEDFUNDS": "fed_funds_rate",
    "DGS2": "treasury_yield_2y",
    "DGS10": "treasury_yield_10y",
    "DGS30": "treasury_yield_30y",
    "T10Y2Y": "yield_curve_spread",
    # FX
    "DTWEXBGS": "dollar_index",
    "DEXUSEU": "usd_eur",
    "DEXUSUK": "usd_gbp",
    "DEXJPUS": "usd_jpy_inverse",  # USD/JPY (we invert to usd_jpy = jpy per usd)
    # Commodities
    "DCOILBRENTEU": "oil_price",
    "GOLDPMGBD228NLBM": "gold_price",
    # Employment
    "PAYEMS": "nonfarm_payrolls",  # thousands
    "UNRATE": "unemployment_rate",
}

OUT_FILE = Path("src/lib/scoring/seed/real-market-data.json")

def fetch_fred(series_id: str) -> list[tuple[str, float]]:
    """Returns list of (date_str 'YYYY-MM-DD', value)."""
    url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}&cosd=2023-01-01"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 BedaanWaves/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
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
                out.append((row[0], v))
            except ValueError:
                continue
        return out
    except Exception as e:
        print(f"  [FRED] {series_id} error: {e}", file=sys.stderr)
        return []

def fetch_macro_data() -> dict:
    """Fetch all macro indicators from FRED. Returns {db_field: [(date, value), ...]}."""
    macro = {}
    for fred_id, db_field in FRED_SERIES.items():
        rows = fetch_fred(fred_id)
        if rows:
            macro[db_field] = rows
            print(f"  [FRED] {fred_id:20} -> {db_field:25} ({len(rows)} points, last={rows[-1]})")
        else:
            print(f"  [FRED] {fred_id:20} -> no data", file=sys.stderr)
        time.sleep(0.3)
    return macro

def _safe_get(df: pd.DataFrame, key: str, idx: int = 0) -> float | None:
    """Safely get a value from a financial statement DataFrame."""
    try:
        if key in df.index:
            val = df.loc[key].iloc[idx]
            if pd.notna(val):
                return float(val)
    except Exception:
        pass
    return None

def _compute_fundamentals_from_statements(tk: yf.Ticker, info: dict) -> dict:
    """Compute additional fundamental metrics from financial statements."""
    out = {}
    try:
        fin = tk.financials
        bs = tk.balance_sheet
        cf = tk.cashflow
    except Exception:
        return out

    if fin is None or fin.empty or bs is None or bs.empty or cf is None or cf.empty:
        return out

    # Most recent column (index 0)
    # Income statement
    revenue = _safe_get(fin, "Total Revenue") or _safe_get(fin, "Revenue")
    gross_profit = _safe_get(fin, "Gross Profit")
    operating_income = _safe_get(fin, "Operating Income")
    ebitda = _safe_get(fin, "EBITDA") or _safe_get(fin, "Ebitda")
    net_income = _safe_get(fin, "Net Income")
    interest_expense = _safe_get(fin, "Interest Expense")
    ebit = _safe_get(fin, "EBIT") or operating_income

    # Balance sheet
    total_assets = _safe_get(bs, "Total Assets")
    current_assets = _safe_get(bs, "Current Assets")
    cash = _safe_get(bs, "Cash And Cash Equivalents") or _safe_get(bs, "Cash")
    inventory = _safe_get(bs, "Inventory")
    receivables = _safe_get(bs, "Accounts Receivable") or _safe_get(bs, "Receivables")
    total_debt = _safe_get(bs, "Total Debt") or _safe_get(bs, "Long Term Debt")
    total_equity = _safe_get(bs, "Total Equity") or _safe_get(bs, "Stockholders Equity")
    current_liabilities = _safe_get(bs, "Current Liabilities")
    short_term_debt = _safe_get(bs, "Short Term Debt") or _safe_get(bs, "Current Debt")

    # Cash flow
    operating_cash_flow = _safe_get(cf, "Operating Cash Flow") or _safe_get(cf, "Cash Flow From Operations")
    capex = _safe_get(cf, "Capital Expenditure") or _safe_get(cf, "Capital Expenditures")
    free_cash_flow = operating_cash_flow - abs(capex) if operating_cash_flow and capex else None

    # Market cap from info
    market_cap = info.get("marketCap")

    # ── Computed metrics ──
    # price_to_cash_flow
    if market_cap and operating_cash_flow and operating_cash_flow > 0:
        out["price_to_cash_flow"] = market_cap / operating_cash_flow

    # ebitda_margin
    if revenue and ebitda and revenue > 0:
        out["ebitda_margin"] = (ebitda / revenue) * 100

    # operating_leverage = % change in operating income / % change in revenue (simplified: contribution margin)
    # Using gross margin as proxy for operating leverage
    if revenue and gross_profit and revenue > 0:
        out["operating_leverage"] = gross_profit / revenue  # contribution margin ratio

    # free_cash_flow_growth - need historical, skip for now
    # out["free_cash_flow_growth"] = ...

    # cash_ratio
    if current_liabilities and cash and current_liabilities > 0:
        out["cash_ratio"] = cash / current_liabilities

    # asset_turnover
    if total_assets and revenue and total_assets > 0:
        out["asset_turnover"] = revenue / total_assets

    # inventory_turnover
    if inventory and revenue and inventory > 0:
        out["inventory_turnover"] = revenue / inventory

    # receivables_turnover
    if receivables and revenue and receivables > 0:
        out["receivables_turnover"] = revenue / receivables

    # debt_to_assets
    if total_assets and total_debt and total_assets > 0:
        out["debt_to_assets"] = total_debt / total_assets

    # interest_coverage
    if ebit and interest_expense and interest_expense > 0:
        out["interest_coverage"] = ebit / interest_expense

    # debt_to_ebitda
    if total_debt and ebitda and ebitda > 0:
        out["debt_to_ebitda"] = total_debt / ebitda

    # dividend_growth_rate - need historical, skip
    # out["dividend_growth_rate"] = ...

    # free_cash_flow_yield
    if market_cap and free_cash_flow and market_cap > 0:
        out["free_cash_flow_yield"] = (free_cash_flow / market_cap) * 100

    # operating_cash_flow_ratio
    if current_liabilities and operating_cash_flow and current_liabilities > 0:
        out["operating_cash_flow_ratio"] = operating_cash_flow / current_liabilities

    # capex_ratio
    if operating_cash_flow and capex and operating_cash_flow > 0:
        out["capex_ratio"] = abs(capex) / operating_cash_flow

    # cash_conversion_ratio
    if net_income and operating_cash_flow and net_income > 0:
        out["cash_conversion_ratio"] = operating_cash_flow / net_income

    # roe_stability - need historical, skip
    # out["roe_stability"] = ...

    # earnings_quality - proxy: operating_cash_flow / net_income
    if net_income and operating_cash_flow and net_income > 0:
        out["earnings_quality"] = operating_cash_flow / net_income

    # price_to_sales (if not in info)
    if market_cap and revenue and market_cap > 0:
        out["price_to_sales"] = market_cap / revenue

    return out

def fetch_ticker_data(tickers: list[str], start: str, end: str) -> dict:
    """Fetch OHLCV + fundamentals for all tickers."""
    print(f"Fetching OHLCV for {len(tickers)} tickers from {start} to {end}...")
    # Batch download — single request for OHLCV
    ohlcv = yf.download(
        tickers=" ".join(tickers),
        start=start,
        end=end,
        interval="1d",
        auto_adjust=True,  # corporate-action adjusted per spec §1.3
        group_by="ticker",
        progress=False,
        threads=True,
        ignore_tz=False,
    )
    # Fetch fundamentals (info + financial statements) per ticker
    infos = {}
    for i, t in enumerate(tickers):
        for attempt in range(3):
            try:
                tk = yf.Ticker(t)
                info = tk.info
                # Compute additional metrics from financial statements
                computed = _compute_fundamentals_from_statements(tk, info)
                # Merge info with computed metrics
                merged = {
                    "sector": info.get("sector"),
                    "industry": info.get("industry"),
                    "marketCap": info.get("marketCap"),
                    "beta": info.get("beta"),
                    "trailingPE": info.get("trailingPE"),
                    "priceToBook": info.get("priceToBook"),
                    "enterpriseToEbitda": info.get("enterpriseToEbitda"),
                    "pegRatio": info.get("pegRatio"),
                    "priceToSalesTrailing12Months": info.get("priceToSalesTrailing12Months"),
                    "payoutRatio": info.get("payoutRatio"),
                    "returnOnEquity": info.get("returnOnEquity"),
                    "returnOnAssets": info.get("returnOnAssets"),
                    "returnOnInvestedCapital": info.get("returnOnInvestedCapital"),
                    "profitMargins": info.get("profitMargins"),
                    "grossMargins": info.get("grossMargins"),
                    "operatingMargins": info.get("operatingMargins"),
                    "revenueGrowth": info.get("revenueGrowth"),
                    "earningsGrowth": info.get("earningsGrowth"),
                    "freeCashFlowGrowth": None,
                    "currentRatio": info.get("currentRatio"),
                    "quickRatio": info.get("quickRatio"),
                    "debtToEquity": info.get("debtToEquity"),
                    "debtToEquity_raw": info.get("debtToEquity"),
                    "interestCoverage": computed.get("interest_coverage"),
                    "totalDebtToEbitda": computed.get("debt_to_ebitda"),
                    "dividendYield": info.get("dividendYield"),
                    "freeCashFlowYield": computed.get("free_cash_flow_yield"),
                    "operatingCashFlowRatio": computed.get("operating_cash_flow_ratio"),
                    "volume": info.get("volume"),
                    "averageVolume": info.get("averageVolume"),
                    "averageDailyVolume10Day": info.get("averageDailyVolume10Day"),
                    "bidAskSpread": None,
                    "sharpe": None,
                    "maxDrawdown": None,
                    # Additional computed metrics
                    "priceToCashFlow": computed.get("price_to_cash_flow"),
                    "ebitdaMargin": computed.get("ebitda_margin"),
                    "operatingLeverage": computed.get("operating_leverage"),
                    "cashRatio": computed.get("cash_ratio"),
                    "assetTurnover": computed.get("asset_turnover"),
                    "inventoryTurnover": computed.get("inventory_turnover"),
                    "receivablesTurnover": computed.get("receivables_turnover"),
                    "debtToAssets": computed.get("debt_to_assets"),
                }
                infos[t] = merged
                print(f"  [{i+1}/{len(tickers)}] {t}: sector={merged.get('sector')}, mcap={(merged.get('marketCap') or 0)/1e9:.1f}B, computed={len([k for k,v in merged.items() if v is not None])} metrics")
                break
            except Exception as e:
                if attempt == 2:
                    print(f"  [{i+1}/{len(tickers)}] {t}: FAILED {e}", file=sys.stderr)
                    infos[t] = {}
                else:
                    time.sleep(1)
        time.sleep(0.15)  # be polite
    return {"ohlcv": ohlcv, "infos": infos}

def main():
    # Fetch ~2.5 years of history so we have enough for SMA-200 + forward returns
    end = datetime.now().strftime("%Y-%m-%d")
    start = (datetime.now() - timedelta(days=800)).strftime("%Y-%m-%d")
    print(f"=== BedaanWaves real data fetch ===")
    print(f"Window: {start} -> {end}")

    # 1. Macro
    print("\n--- FRED macro ---")
    macro = fetch_macro_data()

    # 2. Tickers
    print("\n--- yfinance tickers ---")
    tickers = NASDAQ_TICKERS
    tk_data = fetch_ticker_data(tickers, start, end)
    ohlcv = tk_data["ohlcv"]
    infos = tk_data["infos"]

    # Serialize OHLCV per ticker to JSON-friendly structure
    print("\n--- Serializing OHLCV ---")
    per_ticker = {}
    for t in tickers:
        try:
            if t in ohlcv.columns.get_level_values(0):
                df = ohlcv[t].dropna(subset=["Close"]).copy()
            else:
                continue
        except Exception:
            continue
        if df.empty:
            continue
        rows = []
        for date, row in df.iterrows():
            rows.append({
                "date": date.strftime("%Y-%m-%d"),
                "open": float(row["Open"]),
                "high": float(row["High"]),
                "low": float(row["Low"]),
                "close": float(row["Close"]),
                "volume": float(row["Volume"]),
            })
        per_ticker[t] = {
            "ohlcv": rows,
            "info": infos.get(t, {}),
        }
        print(f"  {t}: {len(rows)} bars, last close={rows[-1]['close']:.2f}")

    # Filter to tickers that actually have data
    valid_tickers = sorted(per_ticker.keys())
    print(f"\nValid tickers with data: {len(valid_tickers)}/{len(tickers)}")

    # Save
    output = {
        "fetched_at": datetime.now().isoformat(),
        "window": {"start": start, "end": end},
        "macro": macro,
        "tickers": valid_tickers,
        "per_ticker": per_ticker,
        "source": "yfinance + FRED (REAL DATA — no mock)",
    }
    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_FILE, "w") as f:
        json.dump(output, f)
    size_mb = OUT_FILE.stat().st_size / 1e6
    print(f"\n=== DONE ===")
    print(f"Saved {size_mb:.1f} MB to {OUT_FILE}")
    print(f"  - {len(valid_tickers)} tickers with real OHLCV")
    print(f"  - {len(macro)} macro indicators from FRED")
    print(f"  - Real fundamentals for {sum(1 for t in valid_tickers if per_ticker[t].get('info',{}).get('sector'))} tickers")

if __name__ == "__main__":
    main()
