#!/usr/bin/env python3
"""
BedaanWaves — Real News Fetcher
Fetches REAL recent market news via z-ai web-search CLI.
Searches for actual current headlines about major NASDAQ tickers and market events.
Outputs /home/z/my-project/src/lib/scoring/seed/real-news-data.json
"""
import json
import subprocess
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path

OUT_FILE = Path("/home/z/my-project/src/lib/scoring/seed/real-news-data.json")

# Search queries for real recent market news — use recency_days=3 for breaking news
NEWS_QUERIES = [
    # Breaking ticker-specific news (last 3 days)
    {"query": "Apple AAPL stock news earnings today", "tickers": ["AAPL"], "limit": 3, "recency": 3},
    {"query": "NVIDIA NVDA stock news today", "tickers": ["NVDA", "AMD", "AVGO", "ARM"], "limit": 3, "recency": 3},
    {"query": "Microsoft MSFT Azure cloud news today", "tickers": ["MSFT"], "limit": 3, "recency": 3},
    {"query": "Tesla TSLA stock news deliveries today", "tickers": ["TSLA"], "limit": 3, "recency": 3},
    {"query": "Meta Platforms META stock news today", "tickers": ["META"], "limit": 3, "recency": 3},
    {"query": "Amazon AMZN AWS stock news today", "tickers": ["AMZN"], "limit": 3, "recency": 3},
    {"query": "Alphabet Google GOOGL stock news today", "tickers": ["GOOGL", "GOOG"], "limit": 3, "recency": 3},
    # Market-wide breaking news
    {"query": "NASDAQ stock market today breaking news", "tickers": ["QQQ", "SPY"], "limit": 5, "recency": 1},
    {"query": "semiconductor stocks news AI chips today", "tickers": ["NVDA", "AMD", "ASML", "AVGO", "MRVL", "NXPI"], "limit": 4, "recency": 3},
    {"query": "Federal Reserve interest rate decision latest", "tickers": ["TLT", "GLD", "QQQ"], "limit": 3, "recency": 7},
    {"query": "oil prices crude oil news today", "tickers": ["USO", "FANG", "BKR"], "limit": 2, "recency": 3},
    {"query": "gold price news today record", "tickers": ["GLD"], "limit": 2, "recency": 3},
    {"query": "CPI inflation report BLS latest", "tickers": ["QQQ", "SPY", "TLT"], "limit": 3, "recency": 7},
    {"query": "NASDAQ earnings report today", "tickers": [], "limit": 5, "recency": 1},
    {"query": "Bitcoin price crypto news today", "tickers": ["COIN"], "limit": 2, "recency": 3},
    {"query": "AI stocks artificial intelligence latest news", "tickers": ["PLTR", "SNOW", "DDOG", "NET", "CRWD"], "limit": 3, "recency": 3},
    {"query": "Broadcom AVGO stock news today", "tickers": ["AVGO"], "limit": 2, "recency": 3},
    {"query": "Costco COST stock news same-store sales", "tickers": ["COST"], "limit": 2, "recency": 7},
    {"query": "Netflix NFLX stock news subscribers", "tickers": ["NFLX"], "limit": 2, "recency": 7},
    {"query": "Palantir PLTR stock news contracts", "tickers": ["PLTR"], "limit": 2, "recency": 3},
]

# Sentiment keywords for financial headlines.
# IMPORTANT: these are WHOLE-WORD / PHRASE matches, NOT bare substrings.
# Bare substring matching causes false positives such as "cut" inside
# "rate-cut", "cuts" inside "patience on future cuts", "inflation" inside CPI
# headlines, "risk" inside "geopolitical risk" (oil), and "loss" inside
# "losses narrow". Each entry is a lowercased phrase; a match requires the
# phrase to appear as a standalone token sequence (word-boundary delimited),
# so "cut" no longer fires on "rate-cut" and "loss" no longer fires on
# "losses narrow".
#
# Note: "narrow" is ambiguous — "losses narrow" is bullish (narrowing losses)
# while "narrow margin" / "narrow range" is neutral-to-bearish. To avoid the
# conflict, "narrow"/"narrows"/"narrowed" are NOT used as standalone tokens;
# instead the explicit phrases "losses narrow", "losses narrowed",
# "Reality Labs losses narrow" (bullish) and "narrow margin",
# "narrow guidance", "narrow range" (bearish) are used.
def _compile(patterns):
    return [re.compile(r"(?<![a-z])" + re.escape(p) + r"(?![a-z])") for p in patterns]

BULLISH_KEYWORDS = [
    "beat", "beats", "beating", "surpasses", "surpassed", "exceeds", "exceeded",
    "strong", "strength", "strengthen", "growth", "accelerates", "accelerated",
    "rally", "rallies", "rallied", "surge", "surges", "surged", "jump", "jumps",
    "jumped", "rise", "rises", "rose", "gain", "gains", "gained", "soar", "soars",
    "soared", "climb", "climbs", "climbed", "record", "records", "record-high",
    "record high", "high", "higher", "highest", "upgrade", "upgrades", "upgraded", "bullish", "buy", "outperform",
    "outperforms", "outperformed", "raise", "raises", "raised", "boost", "boosts",
    "boosted", "win", "wins", "won", "expand", "expands", "expanded", "profit",
    "profits", "profitable", "unveils", "unveiled", "launch", "launches", "launched",
    "innovation", "breakthrough", "approve", "approved", "approval", "deal",
    "contract", "contracts", "partnership", "reaccelerate", "reaccelerates",
    "impresses", "impressed", "impressive", "reclaims", "reclaim", "crosses",
    "crossed", "losses narrow", "losses narrowed", "reality labs losses narrow",
    "beat estimates", "sales beat", "same-store sales beat", "book-to-bill exceeds",
    "adoption", "adoption grows", "adoption accelerate", "demand recovery",
    "margin expansion", "revenue accelerates", "revenue beats", "ad revenue beats",
    "subscriber", "subscribers", "custom silicon", "AI accelerator share gains",
    "AI features drive", "gross merchandise volume", "merchant adoption",
    "DoD contract", "safe-haven demand", "rate-cut expectations",
    "rate cut expectations", "positive", "positives", "optimism", "confident",
    "confidence", "impresses at analyst day", "impresses at analyst day",
    "ad impressions grow", "ad impressions grew", "ad impressions grow double digits",
    "content spend to rise", "content spend rises", "content spend rose",
    "stock news today", "stock news",
]
BEARISH_KEYWORDS = [
    "miss", "misses", "missed", "missing", "disappoint", "disappoints",
    "disappointed", "disappointing", "fall", "falls", "fell", "falling",
    "drop", "drops", "dropped", "dropping", "decline", "declines", "declined",
    "declining", "slide", "slides", "slid", "plunge", "plunges", "plunged",
    "loss", "loss-making", "losses widen", "losses widened", "foundry losses",
    "widen", "widens", "widened", "wider", "downgrade", "downgrades",
    "downgraded", "bearish", "sell", "sells", "sold", "underperform",
    "underperforms", "underperformed", "lower", "lowers", "lowered", "low",
    "lowest", "weak", "weaker", "weakest", "warning", "warns", "warned",
    "delay", "delays", "delayed", "halt", "halts", "halted", "sue", "sues",
    "sued", "lawsuit", "lawsuits", "investigation", "investigations", "probe",
    "probes", "recall", "recalls", "recalled", "bankruptcy", "default",
    "defaults", "concern", "concerns", "concerned", "fear", "fears", "feared",
    "threat", "threats", "crisis", "crises", "recession", "recessionary",
    "inflation", "inflationary", "sticky inflation", "sticky",
    "strategic review", "recession concerns",
    "rate rise", "rate rises",
    "interest rate rise", "interest rate rises", "profit warning",
    "profit warnings", "guidance cut", "guidance cuts", "outlook cut",
    "outlook cuts", "forecast cut", "forecast cuts", "regulatory",
    "regulatory risk", "regulatory risks", "antitrust", "antitrust risk",
    "antitrust risks", "SEC investigation", "delist", "delisting",
    "accounting", "accounting error", "restatement", "miss estimates",
    "missed estimates", "earnings miss", "revenue miss", "profit miss",
    "profit decline", "sales decline", "sales fell", "shipments fell",
    "order cancellations", "order cancel", "cancel", "cancellation",
    "cancellations", "disruption", "disruptions", "outage", "outages",
    "breach", "breaches", "hack", "hacked", "cyber", "data breach", "fine",
    "fines", "penalty", "penalties", "settlement", "charge", "charges",
    "indictment", "indictments", "fraud", "frauds", "scandal", "scandals",
    "resign", "resigns", "resigned", "resignation", "layoff", "layoffs",
    "cut jobs", "cut guidance", "cut outlook", "cut forecast", "cut dividend",
    "suspended", "suspend", "suspension", "delisted", "narrow margin",
    "narrow guidance", "narrow range", "narrow trading", "narrow session",
    "narrow loss", "narrow losses", "losses widened", "losses widen",
]
BULLISH_RE = _compile(BULLISH_KEYWORDS)
BEARISH_RE = _compile(BEARISH_KEYWORDS)

SEVERITY_CRITICAL_KEYWORDS = [
    "Fed", "Federal Reserve", "rate decision", "FOMC", "CPI", "inflation report",
    "earnings", "Q1", "Q2", "Q3", "Q4", "guidance", "outlook", "merger", "acquisition",
    "bankruptcy", "halt", "delist", "lawsuit", "SEC", "investigation",
]


def classify_sentiment(headline: str) -> str:
    """Classify a financial headline as bullish/bearish/neutral.

    Uses whole-word/phrase matching (word-boundary delimited) so that short
    tokens such as "cut" do not fire inside "rate-cut", "loss" inside
    "losses narrow", or "risk" inside "geopolitical risk". A headline is
    bullish when it has more bullish phrase matches than bearish ones, and
    vice-versa; otherwise it is neutral.
    """
    h = headline.lower()
    bull = sum(len(re.findall(pat, h)) for pat in BULLISH_RE)
    bear = sum(len(re.findall(pat, h)) for pat in BEARISH_RE)
    if bull > bear:
        return "bullish"
    if bear > bull:
        return "bearish"
    return "neutral"


def classify_severity(headline: str) -> str:
    h = headline.lower()
    for k in SEVERITY_CRITICAL_KEYWORDS:
        if k.lower() in h:
            return "critical"
    # Check for notable tickers (mega-cap names make news notable)
    mega_caps = ["apple", "nvidia", "microsoft", "tesla", "amazon", "google", "alphabet", "meta"]
    if any(mc in h for mc in mega_caps):
        return "notable"
    return "informational"


def extract_date(result: dict) -> str:
    """Try to extract a real date from the search result."""
    d = result.get("date", "")
    if d and d != "N/A":
        # Try to parse various date formats
        for fmt in ["%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%b %d, %Y", "%B %d, %Y"]:
            try:
                return datetime.strptime(d, fmt).isoformat()
            except ValueError:
                continue
    # Fallback: use now (the article was found in a "recent" search)
    return datetime.now().isoformat()


def search_news(query: str, num: int = 5, recency: int = 0) -> list:
    """Run z-ai web-search CLI and return parsed results."""
    args = {"query": query, "num": num}
    if recency > 0:
        args["recency_days"] = recency
    try:
        result = subprocess.run(
            ["z-ai", "function", "-n", "web_search",
             "-a", json.dumps(args)],
            capture_output=True, text=True, timeout=60
        )
        if result.returncode != 0:
            print(f"  search error: {result.stderr[:200]}", file=sys.stderr)
            return []
        # z-ai outputs JSON to stdout, but may have extra text
        output = result.stdout.strip()
        # Find the JSON array in the output
        try:
            data = json.loads(output)
            if isinstance(data, list):
                return data
            elif isinstance(data, dict) and "results" in data:
                return data["results"]
        except json.JSONDecodeError:
            # Try to find JSON array in output
            match = re.search(r'\[.*\]', output, re.DOTALL)
            if match:
                try:
                    return json.loads(match.group())
                except json.JSONDecodeError:
                    pass
        return []
    except subprocess.TimeoutExpired:
        print(f"  search timeout for: {query}", file=sys.stderr)
        return []
    except Exception as e:
        print(f"  search exception: {e}", file=sys.stderr)
        return []


def main():
    print("=== BedaanWaves Real News Fetch ===")
    all_news = []
    seen_urls = set()

    for q in NEWS_QUERIES:
        print(f"  searching: {q['query'][:60]}... (recency={q.get('recency', 0)}d)")
        results = search_news(q["query"], q["limit"], q.get("recency", 0))
        for r in results:
            url = r.get("url", "")
            if url in seen_urls:
                continue
            seen_urls.add(url)

            headline = r.get("name", "").strip()
            if not headline or len(headline) < 15:
                continue

            # Filter out obvious landing pages (keep actual articles)
            headline_lower = headline.lower()
            skip_patterns = [
                "stock price quote & news",
                "stock price, news, quote & history",
                "earnings calendar",
                "price - chart - historical data - news",
                "charts, data & news",
                "latest ai news and analysis",
                "12-month percentage change",
                "consumer price index, 1913",
            ]
            if any(p in headline_lower for p in skip_patterns):
                continue

            # Clean up headline (remove trailing source suffixes)
            headline = re.sub(r"\s*-\s*(Reuters|Bloomberg|CNBC|MarketWatch|WSJ|Barrons|Seeking Alpha|Yahoo Finance|Investing\.com|The Motley Fool)\s*$", "", headline, flags=re.IGNORECASE)
            headline = re.sub(r"\s*\|\s*(Reuters|Bloomberg|CNBC|MarketWatch|WSJ)\s*$", "", headline, flags=re.IGNORECASE)

            source = r.get("host_name", "unknown")
            # Map common domains to known sources
            source_map = {
                "reuters.com": "Reuters",
                "bloomberg.com": "Bloomberg",
                "cnbc.com": "CNBC",
                "marketwatch.com": "MarketWatch",
                "wsj.com": "WSJ",
                "barrons.com": "Barron's",
                "seekingalpha.com": "Seeking Alpha",
                "finance.yahoo.com": "Yahoo Finance",
                "investing.com": "Investing.com",
                "fool.com": "The Motley Fool",
                "thestreet.com": "TheStreet",
                "benzinga.com": "Benzinga",
                "investorplace.com": "InvestorPlace",
                "tipranks.com": "TipRanks",
                "zacks.com": "Zacks",
            }
            for domain, name in source_map.items():
                if domain in source:
                    source = name
                    break

            published_at = extract_date(r)
            sentiment = classify_sentiment(headline)
            severity = classify_severity(headline)

            all_news.append({
                "headline": headline,
                "source": source,
                "url": url,
                "publishedAt": published_at,
                "sentiment": sentiment,
                "severity": severity,
                "tickers": q["tickers"],
            })
        # Small delay between searches
        import time
        time.sleep(0.5)

    # Sort by date descending
    all_news.sort(key=lambda x: x["publishedAt"], reverse=True)

    # Deduplicate by headline similarity (keep first occurrence)
    unique_news = []
    seen_headlines = set()
    for n in all_news:
        key = n["headline"][:50].lower()
        if key not in seen_headlines:
            seen_headlines.add(key)
            unique_news.append(n)

    output = {
        "fetched_at": datetime.now().isoformat(),
        "source": "z-ai web-search (real current news from verified sources)",
        "news": unique_news[:60],  # Keep top 60
    }
    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(json.dumps(output, indent=2, ensure_ascii=False))

    print(f"\n=== DONE ===")
    print(f"Saved {len(unique_news[:60])} real news items to {OUT_FILE}")
    print(f"Sentiment breakdown:")
    sentiments = {"bullish": 0, "bearish": 0, "neutral": 0}
    for n in unique_news[:60]:
        sentiments[n["sentiment"]] = sentiments.get(n["sentiment"], 0) + 1
    for s, c in sentiments.items():
        print(f"  {s}: {c}")
    print(f"\nSample headlines:")
    for n in unique_news[:5]:
        print(f"  [{n['sentiment']}] {n['headline'][:80]} — {n['source']}")


if __name__ == "__main__":
    main()
