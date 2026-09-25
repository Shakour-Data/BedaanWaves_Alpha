import { NewsArticle, NewsSourceConfig, FetchedNewsResult } from "./types";

export const NEWS_SOURCES: NewsSourceConfig[] = [
  {
    name: "newsapi",
    baseUrl: "https://newsapi.org/v2",
    rateLimit: { requests: 100, windowMs: 24 * 60 * 60 * 1000 },
    enabled: true,
    priority: 1,
  },
  {
    name: "gnews",
    baseUrl: "https://gnews.io/api/v4",
    rateLimit: { requests: 100, windowMs: 24 * 60 * 60 * 1000 },
    enabled: true,
    priority: 2,
  },
  {
    name: "finnhub",
    baseUrl: "https://finnhub.io/api/v1",
    rateLimit: { requests: 60, windowMs: 60 * 1000 },
    enabled: true,
    priority: 3,
  },
  {
    name: "alphavantage",
    baseUrl: "https://www.alphavantage.co/query",
    rateLimit: { requests: 25, windowMs: 24 * 60 * 60 * 1000 },
    enabled: true,
    priority: 4,
  },
  // ─── Free/No-API-Key sources ───────────────────────────────────────────
  {
    name: "rss_feeds",
    baseUrl: "",
    rateLimit: { requests: 1000, windowMs: 60 * 60 * 1000 },
    enabled: true,
    priority: 5,
  },
  {
    name: "sec_edgar",
    baseUrl: "https://www.sec.gov/cgi-bin/browse-edgar",
    rateLimit: { requests: 10, windowMs: 1000 }, // SEC limit: 10 req/sec
    enabled: true,
    priority: 6,
  },
  {
    name: "earnings_calendar",
    baseUrl: "",
    rateLimit: { requests: 100, windowMs: 24 * 60 * 60 * 1000 },
    enabled: true,
    priority: 7,
  },
];

const API_KEYS = {
  newsapi: process.env.NEWSAPI_KEY,
  gnews: process.env.GNEWS_KEY,
  finnhub: process.env.FINNHUB_KEY,
  alphavantage: process.env.ALPHAVANTAGE_KEY,
};

// ─── RSS Feed URLs for financial news ──────────────────────────────────────
const RSS_FEEDS = [
  { url: "https://feeds.reuters.com/reuters/businessNews", source: "Reuters" },
  { url: "https://feeds.reuters.com/reuters/technologyNews", source: "Reuters Tech" },
  { url: "https://www.marketwatch.com/rss/topstories", source: "MarketWatch" },
  { url: "https://feeds.finance.yahoo.com/rss/2.0/headline", source: "Yahoo Finance" },
  { url: "https://www.investing.com/rss/news_285.rss", source: "Investing.com" },
  { url: "https://feeds.feedburner.com/zerohedge/feed", source: "ZeroHedge" },
  { url: "https://www.bloomberg.com/feed/podcast/etf-report.xml", source: "Bloomberg ETF" },
  { url: "https://seekingalpha.com/feed.xml", source: "Seeking Alpha" },
];

// ─── SEC EDGAR filing types that signal material events ────────────────────
const MATERIAL_FILING_TYPES = ["8-K", "10-K", "10-Q", "DEF 14A", "SC 13G", "SC 13D", "424B", "S-1", "S-3"];

async function fetchWithTimeout(url: string, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeTickers(raw: string[]): string[] {
  return raw
    .map((t) => t.toUpperCase().replace(/[^A-Z0-9.]/g, ""))
    .filter((t) => t.length >= 1 && t.length <= 5 && /^[A-Z]/.test(t))
    .slice(0, 20);
}

function extractTickersFromText(text: string, knownTickers: Set<string>): string[] {
  const found = new Set<string>();
  const words = text.match(/\b[A-Z]{1,5}\b/g) || [];
  for (const w of words) {
    if (knownTickers.has(w)) found.add(w);
  }
  return Array.from(found);
}

export async function fetchFromNewsAPI(
  knownTickers: Set<string>,
  fromDate: string,
  toDate: string
): Promise<FetchedNewsResult> {
  const key = API_KEYS.newsapi;
  if (!key) return { articles: [], source: "newsapi", fetchedAt: new Date(), errors: ["NEWSAPI_KEY not set"] };

  const articles: NewsArticle[] = [];
  const errors: string[] = [];

  try {
    const url = `${NEWS_SOURCES[0].baseUrl}/everything?q=stocks OR earnings OR market OR economy&language=en&from=${fromDate}&to=${toDate}&sortBy=publishedAt&pageSize=100&apiKey=${key}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`NewsAPI: ${res.status} ${res.statusText}`);
    const data = await res.json();

    for (const item of data.articles || []) {
      if (!item.title || item.title === "[Removed]") continue;
      const tickers = normalizeTickers(
        extractTickersFromText(`${item.title} ${item.description || ""}`, knownTickers)
      );
      if (tickers.length === 0) continue;

      articles.push({
        headline: item.title,
        source: item.source?.name || "NewsAPI",
        url: item.url || "",
        publishedAt: new Date(item.publishedAt),
        sentiment: "neutral",
        severity: "informational",
        tickers,
        rawContent: item.content,
        summary: item.description,
      });
    }
  } catch (e) {
    errors.push(`NewsAPI: ${e}`);
  }

  return { articles, source: "newsapi", fetchedAt: new Date(), errors };
}

export async function fetchFromGNews(
  knownTickers: Set<string>,
  fromDate: string,
  toDate: string
): Promise<FetchedNewsResult> {
  const key = API_KEYS.gnews;
  if (!key) return { articles: [], source: "gnews", fetchedAt: new Date(), errors: ["GNEWS_KEY not set"] };

  const articles: NewsArticle[] = [];
  const errors: string[] = [];

  try {
    const url = `${NEWS_SOURCES[1].baseUrl}/search?q=stocks OR earnings OR market&lang=en&from=${fromDate}&to=${toDate}&max=100&apikey=${key}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`GNews: ${res.status} ${res.statusText}`);
    const data = await res.json();

    for (const item of data.articles || []) {
      if (!item.title) continue;
      const tickers = normalizeTickers(
        extractTickersFromText(`${item.title} ${item.description || ""}`, knownTickers)
      );
      if (tickers.length === 0) continue;

      articles.push({
        headline: item.title,
        source: item.source?.name || "GNews",
        url: item.url || "",
        publishedAt: new Date(item.publishedAt),
        sentiment: "neutral",
        severity: "informational",
        tickers,
        rawContent: item.content,
        summary: item.description,
      });
    }
  } catch (e) {
    errors.push(`GNews: ${e}`);
  }

  return { articles, source: "gnews", fetchedAt: new Date(), errors };
}

export async function fetchFromFinnhub(
  knownTickers: Set<string>
): Promise<FetchedNewsResult> {
  const key = API_KEYS.finnhub;
  if (!key) return { articles: [], source: "finnhub", fetchedAt: new Date(), errors: ["FINNHUB_KEY not set"] };

  const articles: NewsArticle[] = [];
  const errors: string[] = [];

  try {
    const url = `${NEWS_SOURCES[2].baseUrl}/news?category=general&token=${key}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`Finnhub: ${res.status} ${res.statusText}`);
    const data = await res.json();

    for (const item of data || []) {
      if (!item.headline) continue;
      const tickers = normalizeTickers(
        extractTickersFromText(`${item.headline} ${item.summary || ""}`, knownTickers)
      );
      if (tickers.length === 0) continue;

      articles.push({
        headline: item.headline,
        source: item.source || "Finnhub",
        url: item.url || "",
        publishedAt: new Date(item.datetime * 1000),
        sentiment: "neutral",
        severity: "informational",
        tickers,
        rawContent: item.summary,
        summary: item.summary,
      });
    }
  } catch (e) {
    errors.push(`Finnhub: ${e}`);
  }

  return { articles, source: "finnhub", fetchedAt: new Date(), errors };
}

export async function fetchFromAlphaVantage(
  knownTickers: Set<string>
): Promise<FetchedNewsResult> {
  const key = API_KEYS.alphavantage;
  if (!key) return { articles: [], source: "alphavantage", fetchedAt: new Date(), errors: ["ALPHAVANTAGE_KEY not set"] };

  const articles: NewsArticle[] = [];
  const errors: string[] = [];

  try {
    const tickersParam = Array.from(knownTickers).slice(0, 10).join(",");
    const url = `${NEWS_SOURCES[3].baseUrl}?function=NEWS_SENTIMENT&tickers=${tickersParam}&apikey=${key}&limit=50`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`AlphaVantage: ${res.status} ${res.statusText}`);
    const data = await res.json();

    for (const item of data.feed || []) {
      if (!item.title) continue;
      const tickers = normalizeTickers(
        item.ticker_sentiment?.map((t: any) => t.ticker).filter((t: string) => knownTickers.has(t)) || []
      );
      if (tickers.length === 0) continue;

      const sentimentScore = item.overall_sentiment_score || 0;
      let sentiment: "bullish" | "bearish" | "neutral" = "neutral";
      if (sentimentScore > 0.15) sentiment = "bullish";
      else if (sentimentScore < -0.15) sentiment = "bearish";

      articles.push({
        headline: item.title,
        source: item.source || "AlphaVantage",
        url: item.url || "",
        publishedAt: new Date(item.time_published),
        sentiment,
        severity: "informational",
        tickers,
        rawContent: item.summary,
        summary: item.summary,
      });
    }
  } catch (e) {
    errors.push(`AlphaVantage: ${e}`);
  }

  return { articles, source: "alphavantage", fetchedAt: new Date(), errors };
}

function determineSeverity(headline: string, summary?: string): "critical" | "notable" | "informational" {
  const text = `${headline} ${summary || ""}`.toLowerCase();
  const criticalKeywords = ["earnings", "eps", "revenue", "guidance", "forecast", "outlook", "merger", "acquisition", "takeover", "buyout", "ipo", "spinoff", "fda", "approval", "rejection", "clinical", "trial", "fed", "fomc", "rate decision", "cpi", "inflation", "jobs report", "nfp", "unemployment", "gdp", "bankruptcy", "default", "layoff", "restructuring"];
  const notableKeywords = ["upgrade", "downgrade", "dividend", "buyback", "split", "contract", "partnership", "launch", "expansion", "beat", "miss", "surge", "rally", "decline", "drop", "gain", "loss"];
  let criticalCount = 0, notableCount = 0;
  for (const kw of criticalKeywords) if (text.includes(kw)) criticalCount++;
  for (const kw of notableKeywords) if (text.includes(kw)) notableCount++;
  if (criticalCount >= 2) return "critical";
  if (criticalCount >= 1 || notableCount >= 2) return "notable";
  return "informational";
}

// ─── RSS Feed Fetcher (no API key needed) ──────────────────────────────────
export async function fetchFromRSSFeeds(
  knownTickers: Set<string>,
  fromDate: string,
  toDate: string
): Promise<FetchedNewsResult> {
  const articles: NewsArticle[] = [];
  const errors: string[] = [];
  const fromTs = new Date(fromDate).getTime();
  const toTs = new Date(toDate).getTime() + 86400000;

  for (const feed of RSS_FEEDS) {
    try {
      const res = await fetchWithTimeout(feed.url, 15000);
      if (!res.ok) { errors.push(`${feed.source}: ${res.status}`); continue; }
      const xml = await res.text();
      
      // Simple XML parsing for RSS items
      const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
      for (const item of items.slice(0, 50)) {
        const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/);
        const linkMatch = item.match(/<link><!\[CDATA\[(.*?)\]\]><\/link>|<link>(.*?)<\/link>/);
        const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);
        const descMatch = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/);
        
        const title = titleMatch ? (titleMatch[1] || titleMatch[2]) : "";
        const url = linkMatch ? (linkMatch[1] || linkMatch[2]) : "";
        const pubDate = pubDateMatch ? new Date(pubDateMatch[1]) : new Date();
        const summary = descMatch ? (descMatch[1] || descMatch[2]) : "";
        
        if (!title || pubDate.getTime() < fromTs || pubDate.getTime() > toTs) continue;
        
        const tickers = normalizeTickers(extractTickersFromText(`${title} ${summary}`, knownTickers));
        if (tickers.length === 0) continue;
        
        const severity = determineSeverity(title, summary);
        let sentiment: "bullish" | "bearish" | "neutral" = "neutral";
        const lower = `${title} ${summary}`.toLowerCase();
        const pos = ["beat", "beats", "exceed", "surge", "rally", "gain", "rise", "up", "strong", "growth", "profit", "buyback", "dividend", "upgrade", "bullish", "outperform", "record", "high", "milestone", "expansion", "contract", "deal", "partnership", "approval", "launch", "breakthrough"].filter(kw => lower.includes(kw)).length;
        const neg = ["miss", "fall", "drop", "decline", "loss", "down", "weak", "cut", "layoff", "downgrade", "bearish", "underperform", "investigation", "lawsuit", "fraud", "bankruptcy", "default", "delay", "halt", "suspend"].filter(kw => lower.includes(kw)).length;
        if (pos > neg) sentiment = "bullish"; else if (neg > pos) sentiment = "bearish";
        
        articles.push({
          headline: title,
          source: feed.source,
          url,
          publishedAt: pubDate,
          sentiment,
          severity,
          tickers,
          rawContent: summary,
          summary,
        });
      }
    } catch (e) {
      errors.push(`${feed.source}: ${e}`);
    }
  }
  return { articles, source: "rss_feeds", fetchedAt: new Date(), errors };
}

// ─── SEC EDGAR Filing Fetcher (no API key needed) ──────────────────────────
export async function fetchFromSECFilings(
  knownTickers: Set<string>,
  fromDate: string,
  toDate: string
): Promise<FetchedNewsResult> {
  const articles: NewsArticle[] = [];
  const errors: string[] = [];
  const fromTs = new Date(fromDate).getTime();
  const toTs = new Date(toDate).getTime() + 86400000;

  // SEC EDGAR company search by ticker (requires CIK mapping).
  // Fetch the ticker→CIK mapping ONCE outside the loop — it is a ~7MB file
  // and fetching it per ticker (5,600 times) would stall the seed pipeline.
  let cikMap: Map<string, string> | null = null;
  // SEC EDGAR rate-limits to 10 req/sec and each filing page is a separate
  // round-trip. Iterating all 5,600 seed tickers here would take hours, so
  // cap the scan to a representative sample. SEC filings are advisory news;
  // the curated real-news-data.json + RSS feeds carry the marquee content.
  const secTickers = Array.from(knownTickers).slice(0, 200);
  for (const ticker of secTickers) {
    try {
      if (!cikMap) {
        const cikRes = await fetchWithTimeout(`https://www.sec.gov/files/company_tickers.json`, 30000);
        if (!cikRes.ok) { errors.push(`SEC CIK: ${cikRes.status}`); break; }
        const cikData = await cikRes.json() as Record<string, { ticker: string; cik_str: number }>;
        cikMap = new Map(
          Object.values(cikData).map((e) => [e.ticker, String(e.cik_str).padStart(10, "0")]),
        );
      }
      const cik = cikMap.get(ticker);
      if (!cik) continue;
      
      // Fetch recent filings
      const filingsUrl = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=&dateb=&owner=include&count=40&output=atom`;
      const filingsRes = await fetchWithTimeout(filingsUrl, 15000);
      if (!filingsRes.ok) { errors.push(`SEC ${ticker}: ${filingsRes.status}`); continue; }
      const atomXml = await filingsRes.text();
      
      // Parse Atom feed entries
      const entries = atomXml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
      for (const entry of entries.slice(0, 20)) {
        const titleMatch = entry.match(/<title>(.*?)<\/title>/);
        const linkMatch = entry.match(/<link[^>]*href="(.*?)"/);
        const updatedMatch = entry.match(/<updated>(.*?)<\/updated>/);
        const categoryMatch = entry.match(/<category[^>]*term="(.*?)"/);
        
        const title = titleMatch ? titleMatch[1] : "";
        const url = linkMatch ? linkMatch[1] : "";
        const pubDate = updatedMatch ? new Date(updatedMatch[1]) : new Date();
        const filingType = categoryMatch ? categoryMatch[1] : "";
        
        if (!title || pubDate.getTime() < fromTs || pubDate.getTime() > toTs) continue;
        if (!MATERIAL_FILING_TYPES.some(t => filingType.includes(t) || title.includes(t))) continue;
        
        const severity = determineSeverity(title);
        let sentiment: "bullish" | "bearish" | "neutral" = "neutral";
        const lower = title.toLowerCase();
        if (lower.includes("earnings") || lower.includes("revenue up") || lower.includes("beat") || lower.includes("guidance raised")) sentiment = "bullish";
        else if (lower.includes("miss") || lower.includes("guidance lowered") || lower.includes("loss") || lower.includes("bankruptcy") || lower.includes("default") || lower.includes("layoff")) sentiment = "bearish";
        
        articles.push({
          headline: `[SEC ${filingType}] ${title}`,
          source: "SEC EDGAR",
          url,
          publishedAt: pubDate,
          sentiment,
          severity,
          tickers: [ticker],
          rawContent: title,
          summary: title,
        });
      }
    } catch (e) {
      errors.push(`SEC ${ticker}: ${e}`);
    }
  }
  return { articles, source: "sec_edgar", fetchedAt: new Date(), errors };
}

// ─── Earnings Calendar Fetcher (no API key, uses public calendars) ─────────
export async function fetchFromEarningsCalendar(
  knownTickers: Set<string>,
  fromDate: string,
  toDate: string
): Promise<FetchedNewsResult> {
  const articles: NewsArticle[] = [];
  const errors: string[] = [];
  const fromTs = new Date(fromDate).getTime();
  const toTs = new Date(toDate).getTime() + 86400000;

  // Placeholder for earnings calendar integration
  // In production, integrate with a real earnings calendar API
  // e.g., https://api.earningscall.biz/v1/calendar?ticker=${ticker}
  
  return { articles, source: "earnings_calendar", fetchedAt: new Date(), errors };
}

export async function fetchAllNews(
  knownTickers: Set<string>,
  daysBack = 1
): Promise<FetchedNewsResult[]> {
  const toDate = new Date().toISOString().split("T")[0];
  const fromDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  // Sources that need API keys
  const apiSources = NEWS_SOURCES.filter((s) => s.enabled && API_KEYS[s.name as keyof typeof API_KEYS]);
  // Sources that don't need API keys (RSS, SEC EDGAR, earnings calendar)
  const freeSources = NEWS_SOURCES.filter((s) => s.enabled && !API_KEYS[s.name as keyof typeof API_KEYS]);
  const allSources = [...apiSources, ...freeSources].sort((a, b) => a.priority - b.priority);

  const results = await Promise.all(
    allSources.map((src) => {
      switch (src.name) {
        case "newsapi":
          return fetchFromNewsAPI(knownTickers, fromDate, toDate);
        case "gnews":
          return fetchFromGNews(knownTickers, fromDate, toDate);
        case "finnhub":
          return fetchFromFinnhub(knownTickers);
        case "alphavantage":
          return fetchFromAlphaVantage(knownTickers);
        case "rss_feeds":
          return fetchFromRSSFeeds(knownTickers, fromDate, toDate);
        case "sec_edgar":
          return fetchFromSECFilings(knownTickers, fromDate, toDate);
        case "earnings_calendar":
          return fetchFromEarningsCalendar(knownTickers, fromDate, toDate);
        default:
          return Promise.resolve({ articles: [], source: src.name, fetchedAt: new Date(), errors: ["Unknown source"] });
      }
    })
  );

  return results;
}