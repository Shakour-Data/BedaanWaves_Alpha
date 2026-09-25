import { NewsArticle } from "../types";

const YAHOO_FINANCE_RSS_BASE = "https://feeds.finance.yahoo.com/rss/2.0/headline";

interface YahooRSSItem {
  title: string;
  link: string;
  pubDate: string;
  description?: string;
  guid?: string;
}

async function fetchYahooRSS(ticker: string): Promise<string> {
  const url = `${YAHOO_FINANCE_RSS_BASE}?s=${ticker}&region=US&lang=en-US`;
  const res = await fetch(url, {
    headers: { "User-Agent": "BedaanWaves/1.0 (contact@bedaanwaves.com)" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Yahoo RSS fetch failed for ${ticker}: ${res.status}`);
  return res.text();
}

function parseYahooRSS(xml: string): YahooRSSItem[] {
  const items: YahooRSSItem[] = [];
  const itemMatches = xml.match(/<item>[\s\S]*?<\/item>/g) || [];

  for (const itemXml of itemMatches) {
    const title = extractTag(itemXml, "title");
    const link = extractTag(itemXml, "link");
    const pubDate = extractTag(itemXml, "pubDate");
    const description = extractTag(itemXml, "description");
    const guid = extractTag(itemXml, "guid");

    if (title && link && pubDate) {
      items.push({ title, link, pubDate, description: description || undefined, guid: guid || undefined });
    }
  }
  return items;
}

function extractTag(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, "i");
  const match = xml.match(regex);
  return match ? match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim() : null;
}

function analyzeYahooSentiment(title: string, description?: string): { sentiment: "bullish" | "bearish" | "neutral"; severity: "critical" | "notable" | "informational" } {
  const text = `${title} ${description || ""}`.toLowerCase();

  const positiveSignals = ["beat", "beats", "exceed", "exceeds", "surge", "surges", "rally", "rallies", "gain", "gains", "rise", "rises", "up", "higher", "strong", "strength", "growth", "profit", "profits", "profitable", "buyback", "dividend", "upgrade", "upgrades", "bullish", "optimistic", "outperform", "record", "high", "milestone", "expansion", "deal", "partnership", "acquisition", "merger", "approval", "launch", "breakthrough", "raise", "boost", "soar", "jump", "climb"];
  const negativeSignals = ["miss", "misses", "fall", "falls", "drop", "drops", "decline", "declines", "loss", "losses", "lose", "losing", "down", "lower", "weak", "weakness", "cut", "cuts", "reduce", "layoff", "layoffs", "restructuring", "downgrade", "downgrades", "bearish", "pessimistic", "underperform", "investigation", "lawsuit", "fraud", "scandal", "recall", "bankruptcy", "default", "delay", "halt", "suspend", "warning", "plunge", "tumble", "slide", "slump", "crash"];
  const criticalSignals = ["earnings", "earning", "eps", "revenue", "guidance", "forecast", "outlook", "fed", "federal reserve", "fomc", "interest rate", "rate decision", "cpi", "inflation", "jobs report", "nfp", "nonfarm", "unemployment", "gdp", "merger", "acquisition", "takeover", "buyout", "ipo", "spinoff", "split", "dividend", "buyback", "fda", "approval", "rejection", "clinical", "trial", "phase 3", "phase ii", "breakthrough therapy"];

  let pos = 0, neg = 0, critical = 0;
  for (const kw of positiveSignals) pos += (text.match(new RegExp(`\\b${kw}\\b`, "g")) || []).length;
  for (const kw of negativeSignals) neg += (text.match(new RegExp(`\\b${kw}\\b`, "g")) || []).length;
  for (const kw of criticalSignals) critical += (text.match(new RegExp(`\\b${kw}\\b`, "g")) || []).length;

  const total = pos + neg;
  let sentiment: "bullish" | "bearish" | "neutral" = "neutral";
  let severity: "critical" | "notable" | "informational" = "informational";

  if (total > 0) {
    const score = (pos - neg) / total;
    if (score > 0.15) sentiment = "bullish";
    else if (score < -0.15) sentiment = "bearish";
  }

  if (critical >= 2) severity = "critical";
  else if (critical >= 1) severity = "notable";

  return { sentiment, severity };
}

export async function fetchYahooNewsForTicker(ticker: string, daysBack = 365): Promise<NewsArticle[]> {
  try {
    const xml = await fetchYahooRSS(ticker);
    const items = parseYahooRSS(xml);
    const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

    const articles: NewsArticle[] = [];
    for (const item of items) {
      const pubDate = new Date(item.pubDate);
      if (isNaN(pubDate.getTime()) || pubDate < cutoffDate) continue;

      const { sentiment, severity } = analyzeYahooSentiment(item.title, item.description);

      articles.push({
        headline: item.title,
        source: "Yahoo Finance",
        url: item.link,
        publishedAt: pubDate,
        sentiment,
        severity,
        tickers: [ticker],
        rawContent: item.description,
        summary: item.description,
      });
    }
    return articles;
  } catch (e) {
    console.warn(`[Yahoo Finance] Failed for ${ticker}:`, e);
    return [];
  }
}

export async function fetchYahooNewsForAllTickers(tickers: string[], daysBack = 365, batchSize = 20): Promise<NewsArticle[]> {
  const allArticles: NewsArticle[] = [];

  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    console.log(`[Yahoo Finance] Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(tickers.length/batchSize)} (${batch.length} tickers)`);

    const batchResults = await Promise.allSettled(
      batch.map(ticker => fetchYahooNewsForTicker(ticker, daysBack))
    );

    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j];
      const ticker = batch[j];
      if (result.status === "fulfilled") {
        allArticles.push(...result.value);
        console.log(`[Yahoo Finance] ${ticker}: ${result.value.length} articles`);
      } else {
        console.warn(`[Yahoo Finance] Failed for ${ticker}:`, result.reason);
      }
    }

    if (i + batchSize < tickers.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  return allArticles;
}