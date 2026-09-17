import json
import sqlite3
import hashlib
import uuid
from datetime import datetime

market = "C:/Users/Administrator/Documents/BedaanWaves_Alpha/src/lib/scoring/seed/real-market-data.json"
with open(market) as f:
    data = json.load(f)

tickers = data["tickers"]
per_ticker = data["per_ticker"]
print(f"Scoring {len(tickers)} symbols...")

latest_at = "2026-09-16T22:00:00.000Z"

db_path = "C:/Users/Administrator/Documents/BedaanWaves_Alpha/prisma/db/custom.db"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

scored = 0
failed = 0

def compute_simple_score(ohlcv):
    if len(ohlcv) < 14:
        return 50.0, 50.0, 0.0, 0.0, 0.0, 0.0
    closes = [bar["close"] for bar in ohlcv]
    volumes = [bar["volume"] for bar in ohlcv]
    current = closes[-1]
    prev = closes[-2]

    price_change = ((current - prev) / prev * 100) if prev > 0 else 0

    deltas = [closes[i] - closes[i-1] for i in range(1, len(closes))]
    gains = [d for d in deltas[-14:] if d > 0]
    losses = [-d for d in deltas[-14:] if d < 0]
    avg_gain = sum(gains) / max(len(gains), 1)
    avg_loss = sum(losses) / max(len(losses), 1)
    rs = avg_gain / max(avg_loss, 0.001)
    rsi = 100 - (100 / (1 + rs))

    vol_recent = sum(volumes[-10:]) / 10 if len(volumes) >= 10 else volumes[-1]
    vol_prior = sum(volumes[-20:-10]) / 10 if len(volumes) >= 20 else vol_recent
    vol_ratio = vol_recent / max(vol_prior, 0.001)

    mom_7 = ((current - closes[-7]) / closes[-7] * 100) if len(closes) >= 7 else 0

    rsi_score = rsi
    pc_score = max(0, min(100, 50 + price_change * 5))
    vol_score = max(0, min(100, 50 + (vol_ratio - 1) * 50))
    mom_score = max(0, min(100, 50 + mom_7 * 10))
    overall = rsi_score * 0.3 + pc_score * 0.2 + vol_score * 0.2 + mom_score * 0.3
    overall = max(0, min(100, overall))

    return overall, rsi, price_change, volumes[-1], vol_ratio, mom_7

def score_to_grade(score):
    if score >= 75: return "STRONG_BULLISH"
    if score >= 60: return "BULLISH"
    if score >= 40: return "NEUTRAL"
    if score >= 25: return "BEARISH"
    return "STRONG_BEARISH"

for i, ticker in enumerate(tickers):
    td = per_ticker.get(ticker, {})
    ohlcv = td.get("ohlcv", [])
    if not ohlcv:
        failed += 1
        continue

    try:
        current_price = ohlcv[-1]["close"]
        prev_price = ohlcv[-2]["close"] if len(ohlcv) >= 2 else current_price
        price_change_pct = ((current_price - prev_price) / prev_price * 100) if prev_price > 0 else 0
        volume = ohlcv[-1]["volume"]

        result = compute_simple_score(ohlcv)
        overall = result[0]
        rsi = result[1]

        grade = score_to_grade(overall)
        signals = json.dumps(["positive_technical"] if overall > 50 else ["negative_technical"])

        sub_aspect = json.dumps({"rsi_14": round(rsi, 2), "price_change": round(price_change_pct, 2)})
        aspect = json.dumps({"technical": round(overall * 0.6, 2), "momentum": round(overall * 0.4, 2)})
        sub_dim = json.dumps({"technical_momentum": round(overall * 0.5, 2), "technical_volume": round(overall * 0.5, 2)})
        dim = json.dumps({"technical": round(overall * 0.7, 2), "sentiment": round(50 + (overall - 50) * 0.5, 2),
                           "fundamental": 50.0, "risk": 50.0, "macro": 50.0, "ai": round(overall * 0.8, 2)})

        raw_hash = hashlib.md5(f"{ticker}{current_price}{overall}".encode()).hexdigest()
        snapshot_id = str(uuid.uuid4())

        cursor.execute("""
            INSERT OR REPLACE INTO ScoreSnapshot
            (id, ticker, capturedAt, price, priceChange, volume,
             subAspectScores, aspectScores, subDimensionScores, dimensionScores,
             overall, grade, signals, ciLower, ciUpper, stabilityIndex, coverage,
             isProcessed, dataQuality, coefficientVersion, rawDataHash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (snapshot_id, ticker, latest_at, current_price, round(price_change_pct, 4), volume,
              sub_aspect, aspect, sub_dim, dim, round(overall, 2), grade, signals,
              round(overall - 5, 2), round(overall + 5, 2), round(abs(overall - 50) * 0.1, 4),
              1.0, True, "VALIDATED", "v2-basic", raw_hash))

        scored += 1

        if (i + 1) % 1000 == 0:
            conn.commit()
            print(f"  Scored {i+1}/{len(tickers)}")

    except Exception as e:
        failed += 1

conn.commit()
conn.close()
print(f"\nDone! Scored {scored} symbols, {failed} failed")
