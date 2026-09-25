import { NewsArticle } from "../types";

interface RSSItem {
  title: string;
  link: string;
  pubDate: string;
  description?: string;
  content?: string;
  "content:encoded"?: string;
  guid?: string;
  categories?: string[];
}

interface ParsedRSSFeed {
  title: string;
  link: string;
  items: RSSItem[];
}

const RSS_SOURCES = [
  { name: "Reuters Business", url: "https://feeds.reuters.com/reuters/businessNews", category: "general" },
  { name: "Reuters Technology", url: "https://feeds.reuters.com/reuters/technologyNews", category: "tech" },
  { name: "Bloomberg Markets", url: "https://feeds.bloomberg.com/markets/news.rss", category: "markets" },
  { name: "CNBC Top News", url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", category: "general" },
  { name: "CNBC Technology", url: "https://www.cnbc.com/id/19854910/device/rss/rss.html", category: "tech" },
  { name: "MarketWatch Top Stories", url: "https://feeds.marketwatch.com/marketwatch/topstories/", category: "general" },
  { name: "MarketWatch Markets", url: "https://feeds.marketwatch.com/marketwatch/marketpulse/", category: "markets" },
  { name: "Yahoo Finance Top Stories", url: "https://finance.yahoo.com/rss/topstories", category: "general" },
  { name: "Seeking Alpha Market Currents", url: "https://seekingalpha.com/market_currents.xml", category: "analysis" },
  { name: "Financial Times Markets", url: "https://www.ft.com/rss/home/uk", category: "markets" },
  { name: "WSJ Markets", url: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml", category: "markets" },
  { name: "Investing.com News", url: "https://www.investing.com/rss/news_25.rss", category: "general" },
  { name: "Benzinga", url: "https://www.benzinga.com/feed", category: "analysis" },
  { name: "Zacks Equity Research", url: "https://www.zacks.com/rss.php", category: "analysis" },
] as const;

const TICKER_PATTERN = /\b([A-Z]{1,5})\b/g;
const COMMON_WORDS = new Set(["THE", "AND", "FOR", "ARE", "BUT", "NOT", "YOU", "ALL", "CAN", "HER", "WAS", "ONE", "OUR", "HAD", "HAS", "HIS", "HOW", "ITS", "NEW", "NOW", "OLD", "SEE", "TWO", "WHO", "BOY", "DID", "GET", "HIM", "MAN", "PUT", "SAY", "SHE", "TOO", "USE", "CEO", "CFO", "CTO", "USA", "UK", "EU", "GDP", "CPI", "FED", "SEC", "IPO", "ETF", "AI", "ML", "API", "SDK", "UI", "UX", "DB", "SQL", "HTML", "CSS", "JS", "TS", "JSON", "XML", "HTTP", "HTTPS", "URL", "URI", "IP", "DNS", "SSL", "TLS", "SSH", "FTP", "SMTP", "POP", "IMAP", "AWS", "GCP", "AZURE", "K8S", "CI", "CD", "DEV", "OPS", "QA", "UX", "UI", "PM", "PO", "HR", "PR", "IR", "CR", "DR", "MR", "MS", "MRS", "SR", "JR", "PHD", "MBA", "BSC", "MSC", "PHD"]);

async function fetchRSSFeed(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "BedaanWaves/1.0 (contact@bedaanwaves.com)" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`RSS fetch failed: ${res.status} ${res.statusText}`);
  return res.text();
}

function parseRSS(xml: string): ParsedRSSFeed | null {
  try {
    const titleMatch = xml.match(/<title>(.*?)<\/title>/);
    const linkMatch = xml.match(/<link>(.*?)<\/link>/);
    const itemMatches = xml.match(/<item>[\s\S]*?<\/item>/g) || [];

    const items: RSSItem[] = [];
    for (const itemXml of itemMatches) {
      const title = extractTag(itemXml, "title");
      const link = extractTag(itemXml, "link");
      const pubDate = extractTag(itemXml, "pubDate") || extractTag(itemXml, "published");
      const description = extractTag(itemXml, "description");
      const content = extractTag(itemXml, "content:encoded") || extractTag(itemXml, "content");
      const guid = extractTag(itemXml, "guid");
      const categories = extractAllTags(itemXml, "category");

      if (title && link) {
        items.push({ 
          title, 
          link, 
          pubDate: pubDate || new Date().toISOString(), 
          description: description || undefined, 
          content: content || undefined, 
          guid: guid || undefined, 
          categories 
        });
      }
    }

    return {
      title: titleMatch?.[1] || "Unknown Feed",
      link: linkMatch?.[1] || "",
      items,
    };
  } catch (e) {
    console.warn("[RSS] Parse failed:", e);
    return null;
  }
}

function extractTag(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, "i");
  const match = xml.match(regex);
  return match ? match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim() : null;
}

function extractAllTags(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, "gi");
  const matches = xml.matchAll(regex);
  return Array.from(matches, m => m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim()).filter(Boolean);
}

function extractTickersFromText(text: string, knownTickers: Set<string>): string[] {
  const found = new Set<string>();
  const words = text.match(TICKER_PATTERN) || [];
  for (const w of words) {
    const upper = w.toUpperCase();
    if (upper.length >= 1 && upper.length <= 5 && !COMMON_WORDS.has(upper) && knownTickers.has(upper)) {
      found.add(upper);
    }
  }
  return Array.from(found);
}

function analyzeRSSSentiment(title: string, description?: string, content?: string): { sentiment: "bullish" | "bearish" | "neutral"; severity: "critical" | "notable" | "informational" } {
  const text = `${title} ${description || ""} ${content || ""}`.toLowerCase();

  const positiveSignals = ["beat", "beats", "exceed", "exceeds", "surge", "surges", "rally", "rallies", "gain", "gains", "rise", "rises", "up", "higher", "strong", "strength", "growth", "grow", "growing", "profit", "profits", "profitable", "revenue up", "buyback", "dividend", "upgrade", "upgrades", "bullish", "optimistic", "outperform", "outperforms", "record", "high", "milestone", "expansion", "contract", "contracts", "deal", "partnership", "acquisition", "merger", "approval", "approved", "launch", "launches", "breakthrough", "innovation", "raise", "raises", "boost", "boosts", "soar", "soars", "jump", "jumps", "climb", "climbs"];
  const negativeSignals = ["miss", "misses", "fall", "falls", "drop", "drops", "decline", "declines", "loss", "losses", "lose", "losing", "down", "lower", "weak", "weakness", "cut", "cuts", "reduce", "reduces", "layoff", "layoffs", "restructuring", "downgrade", "downgrades", "bearish", "pessimistic", "underperform", "underperforms", "investigation", "lawsuit", "fraud", "scandal", "recall", "bankruptcy", "default", "delay", "delays", "halt", "halts", "suspend", "suspends", "warning", "warn", "concern", "risk", "uncertainty", "plunge", "plunges", "tumble", "tumbles", "slide", "slides", "slump", "slumps", "crash", "crashes"];
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

export async function fetchRSSNewsForTickers(
  knownTickers: Set<string>,
  daysBack = 30,
  maxItemsPerFeed = 100
): Promise<NewsArticle[]> {
  const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  const allArticles: NewsArticle[] = [];

  for (const source of RSS_SOURCES) {
    try {
      console.log(`[RSS] Fetching ${source.name}...`);
      const xml = await fetchRSSFeed(source.url);
      const feed = parseRSS(xml);
      if (!feed) continue;

      let count = 0;
      for (const item of feed.items.slice(0, maxItemsPerFeed)) {
        const pubDate = new Date(item.pubDate);
        if (isNaN(pubDate.getTime()) || pubDate < cutoffDate) continue;

        const fullText = `${item.title} ${item.description || ""} ${item.content || ""}`;
        const tickers = extractTickersFromText(fullText, knownTickers);
        if (tickers.length === 0) continue;

        const { sentiment, severity } = analyzeRSSSentiment(item.title, item.description, item.content);

        allArticles.push({
          headline: item.title,
          source: source.name,
          url: item.link,
          publishedAt: pubDate,
          sentiment,
          severity,
          tickers,
          rawContent: item.content || item.description,
          summary: item.description,
        });
        count++;
      }
      console.log(`[RSS] ${source.name}: ${count} articles`);
      await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      console.warn(`[RSS] Failed for ${source.name}:`, e);
    }
  }

  return allArticles;
}