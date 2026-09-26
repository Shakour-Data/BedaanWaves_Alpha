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
import numpy as np

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
    """Safely get a finite value from a financial statement DataFrame."""
    try:
        if idx < 0 or key not in df.index or idx >= len(df.columns):
            return None
        val = df.loc[key].iloc[idx]
        return float(val) if pd.notna(val) and np.isfinite(float(val)) else None
    except Exception:
        return None


def _ttm(frame: pd.DataFrame, period_idx: int, key: str, quarters: int = 4) -> float | None:
    """Sum the latest available quarterly values ending at period_idx."""
    try:
        if period_idx < 0 or key not in frame.index or period_idx >= len(frame.columns):
            return None
        cols = frame.columns
        values = [frame.loc[key, cols[j]] for j in range(max(0, period_idx - quarters + 1), period_idx + 1)]
        values = [float(v) for v in values if pd.notna(v) and np.isfinite(float(v))]
        return sum(values) if len(values) == min(quarters, period_idx + 1) else None
    except Exception:
        return None


def _statement_ratio(numerator: float | None, denominator: float | None, scale: float = 1.0) -> float | None:
    if numerator is None or denominator is None or abs(denominator) < 1e-12:
        return None
    return numerator / denominator * scale


def _growth(current: float | None, previous: float | None) -> float | None:
    if current is None or previous is None or abs(previous) < 1e-12:
        return None
    return (current - previous) / abs(previous) * 100


def _release_map(tk: yf.Ticker, period_ends: list[pd.Timestamp]) -> dict[str, str]:
    """Map fiscal period ends to the first subsequent reported earnings date."""
    try:
        dates = tk.earnings_dates
        if dates is None or dates.empty:
            return {}
        reported = dates.dropna(subset=["Reported EPS"])
        release_index = pd.to_datetime(reported.index)
        if isinstance(release_index, pd.DatetimeIndex) and release_index.tz is not None:
            release_index = release_index.tz_localize(None)
        release_dates = sorted(release_index.normalize())
        out: dict[str, str] = {}
        for period in period_ends:
            candidates = [d for d in release_dates if d >= period and d <= period + pd.Timedelta(days=100)]
            if candidates:
                out[period.strftime("%Y-%m-%d")] = candidates[0].strftime("%Y-%m-%d")
        return out
    except Exception:
        return {}


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

    revenue = _safe_get(fin, "TotalRevenue") or _safe_get(fin, "OperatingRevenue")
    gross_profit = _safe_get(fin, "GrossProfit")
    operating_income = _safe_get(fin, "OperatingIncome")
    ebitda = _safe_get(fin, "EBITDA")
    net_income = _safe_get(fin, "NetIncome")
    interest_expense = _safe_get(fin, "InterestExpense") or _safe_get(fin, "OtherNonOperatingIncomeExpenses")
    ebit = _safe_get(fin, "EBIT") or operating_income
    total_assets = _safe_get(bs, "TotalAssets")
    current_assets = _safe_get(bs, "CurrentAssets")
    cash = _safe_get(bs, "CashAndCashEquivalents") or _safe_get(bs, "CashCashEquivalentsAndShortTermInvestments")
    inventory = _safe_get(bs, "Inventory")
    receivables = _safe_get(bs, "AccountsReceivable") or _safe_get(bs, "Receivables")
    total_debt = _safe_get(bs, "TotalDebt") or _safe_get(bs, "LongTermDebtAndCapitalLeaseObligation")
    total_equity = _safe_get(bs, "StockholdersEquity") or _safe_get(bs, "TotalEquityGrossMinorityInterest")
    current_liabilities = _safe_get(bs, "CurrentLiabilities")
    operating_cash_flow = _safe_get(cf, "OperatingCashFlow") or _safe_get(cf, "CashFlowFromContinuingOperatingActivities")
    capex = _safe_get(cf, "CapitalExpenditure")
    free_cash_flow = (operating_cash_flow or 0) - abs(capex or 0) if operating_cash_flow is not None or capex is not None else None
    market_cap = info.get("marketCap")

    if market_cap and operating_cash_flow and operating_cash_flow > 0:
        out["price_to_cash_flow"] = market_cap / operating_cash_flow
    if revenue and ebitda and revenue > 0:
        out["ebitda_margin"] = (ebitda / revenue) * 100
    if revenue and gross_profit and revenue > 0:
        out["operating_leverage"] = gross_profit / revenue
    if current_liabilities and cash and current_liabilities > 0:
        out["cash_ratio"] = cash / current_liabilities
    if total_assets and revenue and total_assets > 0:
        out["asset_turnover"] = revenue / total_assets
    if inventory and revenue and inventory > 0:
        out["inventory_turnover"] = revenue / inventory
    if receivables and revenue and receivables > 0:
        out["receivables_turnover"] = revenue / receivables
    if total_assets and total_debt and total_assets > 0:
        out["debt_to_assets"] = total_debt / total_assets
    if ebit and interest_expense and interest_expense > 0:
        out["interest_coverage"] = ebit / interest_expense
    if total_debt and ebitda and ebitda > 0:
        out["debt_to_ebitda"] = total_debt / ebitda
    if market_cap and free_cash_flow and market_cap > 0:
        out["free_cash_flow_yield"] = (free_cash_flow / market_cap) * 100
    if current_liabilities and operating_cash_flow and current_liabilities > 0:
        out["operating_cash_flow_ratio"] = operating_cash_flow / current_liabilities
    if operating_cash_flow and capex and operating_cash_flow > 0:
        out["capex_ratio"] = abs(capex) / operating_cash_flow
    if net_income and operating_cash_flow and net_income > 0:
        out["cash_conversion_ratio"] = operating_cash_flow / net_income
        out["earnings_quality"] = operating_cash_flow / net_income
    if market_cap and revenue and market_cap > 0:
        out["price_to_sales"] = market_cap / revenue
    if total_assets and total_equity and total_equity != 0:
        out["financial_leverage"] = total_assets / total_equity
    return out


def _build_fundamental_snapshots(tk: yf.Ticker, info: dict, ohlcv: list[dict]) -> list[dict]:
    """Build point-in-time quarterly snapshots from statements and earnings dates."""
    try:
        fin = tk.get_income_stmt(freq="quarterly")
        bs = tk.get_balance_sheet(freq="quarterly")
        cf = tk.get_cashflow(freq="quarterly")
    except Exception:
        return []
    if fin is None or fin.empty or bs is None or bs.empty or cf is None or cf.empty:
        return []

    period_ends = sorted(pd.to_datetime(fin.columns), key=lambda value: pd.Timestamp(value))
    fin = fin.reindex(columns=period_ends)
    bs = bs.reindex(columns=period_ends)
    cf = cf.reindex(columns=period_ends)
    releases = _release_map(tk, period_ends)
    prices = {row["date"]: float(row["close"]) for row in ohlcv}
    snapshots: list[dict] = []

    for period_idx, period_end in enumerate(period_ends):
        reported_at = releases.get(period_end.strftime("%Y-%m-%d"))
        if not reported_at:
            continue
        effective_at = reported_at
        fin_col = fin.columns[period_idx]
        bs_col = bs.columns[min(period_idx, len(bs.columns) - 1)] if len(bs.columns) else None
        cf_col = cf.columns[min(period_idx, len(cf.columns) - 1)] if len(cf.columns) else None
        revenue = _safe_get(fin, "TotalRevenue", period_idx) or _safe_get(fin, "OperatingRevenue", period_idx)
        gross_profit = _safe_get(fin, "GrossProfit", period_idx)
        operating_income = _safe_get(fin, "OperatingIncome", period_idx)
        ebitda = _safe_get(fin, "EBITDA", period_idx)
        net_income = _safe_get(fin, "NetIncome", period_idx)
        interest_expense = _safe_get(fin, "InterestExpense", period_idx) or _safe_get(fin, "OtherNonOperatingIncomeExpenses", period_idx)
        ebit = _safe_get(fin, "EBIT", period_idx) or operating_income
        total_assets = _safe_get(bs, "TotalAssets", min(period_idx, len(bs.columns) - 1)) if bs_col is not None else None
        current_assets = _safe_get(bs, "CurrentAssets", min(period_idx, len(bs.columns) - 1)) if bs_col is not None else None
        cash = _safe_get(bs, "CashAndCashEquivalents", min(period_idx, len(bs.columns) - 1)) or _safe_get(bs, "CashCashEquivalentsAndShortTermInvestments", min(period_idx, len(bs.columns) - 1)) if bs_col is not None else None
        inventory = _safe_get(bs, "Inventory", min(period_idx, len(bs.columns) - 1)) if bs_col is not None else None
        receivables = _safe_get(bs, "AccountsReceivable", min(period_idx, len(bs.columns) - 1)) or _safe_get(bs, "Receivables", min(period_idx, len(bs.columns) - 1)) if bs_col is not None else None
        total_debt = _safe_get(bs, "TotalDebt", min(period_idx, len(bs.columns) - 1)) or _safe_get(bs, "LongTermDebtAndCapitalLeaseObligation", min(period_idx, len(bs.columns) - 1)) if bs_col is not None else None
        total_equity = _safe_get(bs, "StockholdersEquity", min(period_idx, len(bs.columns) - 1)) or _safe_get(bs, "TotalEquityGrossMinorityInterest", min(period_idx, len(bs.columns) - 1)) if bs_col is not None else None
        current_liabilities = _safe_get(bs, "CurrentLiabilities", min(period_idx, len(bs.columns) - 1)) if bs_col is not None else None
        operating_cash_flow = _safe_get(cf, "OperatingCashFlow", min(period_idx, len(cf.columns) - 1)) or _safe_get(cf, "CashFlowFromContinuingOperatingActivities", min(period_idx, len(cf.columns) - 1)) if cf_col is not None else None
        capex = _safe_get(cf, "CapitalExpenditure", min(period_idx, len(cf.columns) - 1)) if cf_col is not None else None
        dividends = _safe_get(cf, "CashDividendsPaid", min(period_idx, len(cf.columns) - 1)) if cf_col is not None else None
        free_cash_flow = operating_cash_flow - abs(capex) if operating_cash_flow and capex else None
        close = next((prices[date] for date in sorted(prices) if date <= effective_at), None)
        shares = _safe_get(bs, "OrdinarySharesNumber", min(period_idx, len(bs.columns) - 1)) if bs_col is not None else None
        market_cap = close * shares if close and shares else None
        revenue_ttm = _ttm(fin, period_idx, "TotalRevenue") or _ttm(fin, period_idx, "OperatingRevenue")
        net_income_ttm = _ttm(fin, period_idx, "NetIncomeCommonStockholders") or _ttm(fin, period_idx, "NetIncome")
        ebitda_ttm = _ttm(fin, period_idx, "EBITDA")
        operating_income_ttm = _ttm(fin, period_idx, "OperatingIncome")
        operating_cash_flow_ttm = _ttm(cf, period_idx, "OperatingCashFlow") or _ttm(cf, period_idx, "CashFlowFromContinuingOperatingActivities")
        capex_ttm = _ttm(cf, period_idx, "CapitalExpenditure")
        dividends_ttm = _ttm(cf, period_idx, "CashDividendsPaid")
        prior_revenue = _ttm(fin, period_idx - 1, "TotalRevenue") or _ttm(fin, period_idx - 1, "OperatingRevenue")
        prior_net_income = _ttm(fin, period_idx - 1, "NetIncomeCommonStockholders") or _ttm(fin, period_idx - 1, "NetIncome")
        prior_ocf = _ttm(cf, period_idx - 1, "OperatingCashFlow") or _ttm(cf, period_idx - 1, "CashFlowFromContinuingOperatingActivities")

        metrics: dict[str, float | None] = {
            "pe_ratio": _statement_ratio(market_cap, net_income_ttm),
            "pb_ratio": _statement_ratio(market_cap, total_equity),
            "ev_ebitda": None,
            "peg_ratio": None,
            "price_to_sales": _statement_ratio(market_cap, revenue_ttm),
            "price_to_cash_flow": _statement_ratio(market_cap, operating_cash_flow_ttm),
            "payout_ratio": _statement_ratio(dividends_ttm, net_income_ttm, 100),
            "roe": _statement_ratio(net_income_ttm, total_equity, 100),
            "roa": _statement_ratio(net_income_ttm, total_assets, 100),
            "roic": _statement_ratio(operating_income_ttm, (total_equity or 0) + (total_debt or 0), 100),
            "profit_margin": _statement_ratio(net_income_ttm, revenue_ttm, 100),
            "gross_margin": _statement_ratio(gross_profit, revenue, 100),
            "operating_margin": _statement_ratio(operating_income, revenue, 100),
            "net_margin": _statement_ratio(net_income, revenue, 100),
            "ebitda_margin": _statement_ratio(ebitda, revenue, 100),
            "operating_leverage": None,
            "revenue_growth": _growth(revenue_ttm, prior_revenue),
            "eps_growth": _growth(net_income_ttm, prior_net_income),
            "earnings_growth": _growth(net_income_ttm, prior_net_income),
            "free_cash_flow_growth": _growth((operating_cash_flow_ttm or 0) - abs(capex_ttm or 0), (prior_ocf or 0) - abs(_ttm(cf, period_idx - 1, "CapitalExpenditure") or 0)),
            "current_ratio": _statement_ratio(current_assets, current_liabilities),
            "quick_ratio": _statement_ratio((current_assets or 0) - (inventory or 0), current_liabilities),
            "cash_ratio": _statement_ratio(cash, current_liabilities),
            "asset_turnover": _statement_ratio(revenue_ttm, total_assets),
            "inventory_turnover": _statement_ratio(revenue_ttm, inventory),
            "receivables_turnover": _statement_ratio(revenue_ttm, receivables),
            "debt_to_equity": _statement_ratio(total_debt, total_equity, 100),
            "debt_to_assets": _statement_ratio(total_debt, total_assets, 100),
            "interest_coverage": _statement_ratio(ebit, interest_expense),
            "debt_to_ebitda": _statement_ratio(total_debt, ebitda_ttm),
            "dividend_yield": _statement_ratio(dividends_ttm, market_cap, 100),
            "dividend_growth_rate": None,
            "free_cash_flow_yield": _statement_ratio(free_cash_flow, market_cap, 100),
            "operating_cash_flow_ratio": _statement_ratio(operating_cash_flow, current_liabilities, 100),
            "capex_ratio": _statement_ratio(abs(capex) if capex is not None else None, operating_cash_flow, 100),
            "cash_conversion_ratio": _statement_ratio(operating_cash_flow, net_income, 100),
            "roe_stability": None,
            "earnings_quality": _statement_ratio(operating_cash_flow, net_income, 100),
            "financial_leverage": _statement_ratio(total_assets, total_equity),
            "earnings_stability": None,
            "dividend_stability": None,
            "accounting_quality": _statement_ratio((net_income or 0) - (operating_cash_flow or 0), total_assets, 100),
        }
        snapshots.append({
            "reported_at": reported_at,
            "fiscal_period_end": period_end.strftime("%Y-%m-%d"),
            "effective_at": effective_at,
            "source": "yfinance quarterly statements + earnings_dates",
            "metrics": metrics,
        })
    return snapshots


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
    rows_by_ticker = {}
    for i, t in enumerate(tickers):
        try:
            if t in ohlcv.columns.get_level_values(0):
                ticker_frame = ohlcv[t].dropna(subset=["Close"]).copy()
                rows_by_ticker[t] = [
                    {
                        "date": date.strftime("%Y-%m-%d"),
                        "open": float(row["Open"]),
                        "high": float(row["High"]),
                        "low": float(row["Low"]),
                        "close": float(row["Close"]),
                        "volume": float(row["Volume"]),
                    }
                    for date, row in ticker_frame.iterrows()
                ]
        except Exception:
            rows_by_ticker[t] = []
        for attempt in range(3):
            try:
                tk = yf.Ticker(t)
                info = tk.info
                computed = _compute_fundamentals_from_statements(tk, info)
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
                infos[t] = {
                    "info": merged,
                    "info_effective_at": end,
                    "fundamental_history": _build_fundamental_snapshots(tk, info, rows_by_ticker.get(t, [])),
                }
                print(f"  [{i+1}/{len(tickers)}] {t}: sector={merged.get('sector')}, mcap={(merged.get('marketCap') or 0)/1e9:.1f}B, snapshots={len(infos[t]['fundamental_history'])}")
                break
            except Exception as e:
                if attempt == 2:
                    print(f"  [{i+1}/{len(tickers)}] {t}: FAILED {e}", file=sys.stderr)
                    infos[t] = {}
                else:
                    time.sleep(1)
        time.sleep(0.15)  # be polite
    return {"ohlcv": ohlcv, "infos": infos, "rows_by_ticker": rows_by_ticker}

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
    rows_by_ticker = tk_data["rows_by_ticker"]

    # Serialize OHLCV per ticker to JSON-friendly structure
    print("\n--- Serializing OHLCV ---")
    per_ticker = {}
    for t in tickers:
        rows = rows_by_ticker.get(t, [])
        if not rows:
            continue
        ticker_info = infos.get(t, {})
        per_ticker[t] = {
            "ohlcv": rows,
            "info": ticker_info.get("info", {}),
            "info_effective_at": ticker_info.get("info_effective_at"),
            "fundamental_history": ticker_info.get("fundamental_history", []),
        }
        print(f"  {t}: {len(rows)} bars, last close={rows[-1]['close']:.2f}, snapshots={len(per_ticker[t]['fundamental_history'])}")

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
    print(f"  - Real fundamentals for {sum(1 for t in valid_tickers if per_ticker[t].get('info', {}).get('sector'))} tickers")
    print(f"  - Point-in-time fundamental snapshots for {sum(1 for t in valid_tickers if per_ticker[t].get('fundamental_history'))} tickers")

if __name__ == "__main__":
    main()
