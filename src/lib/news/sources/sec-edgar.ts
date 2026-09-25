import { NewsArticle } from "../types";

interface EDGARFiling {
  cik: string;
  ticker: string;
  form: string;
  filingDate: string;
  reportDate?: string;
  accessionNumber: string;
  primaryDocument: string;
  primaryDocDescription: string;
  size: number;
}

const EDGAR_SUBMISSIONS = "https://data.sec.gov/submissions";
const FILING_TYPES = {
  "8-K": { severity: "critical" as const, sentimentHint: "neutral" as const },
  "10-Q": { severity: "notable" as const, sentimentHint: "neutral" as const },
  "10-K": { severity: "critical" as const, sentimentHint: "neutral" as const },
  "6-K": { severity: "notable" as const, sentimentHint: "neutral" as const },
  "DEF 14A": { severity: "informational" as const, sentimentHint: "neutral" as const },
  "S-1": { severity: "notable" as const, sentimentHint: "bullish" as const },
  "S-3": { severity: "notable" as const, sentimentHint: "neutral" as const },
  "4": { severity: "informational" as const, sentimentHint: "neutral" as const },
  "13D": { severity: "notable" as const, sentimentHint: "bullish" as const },
  "13G": { severity: "informational" as const, sentimentHint: "neutral" as const },
} as const;

const USER_AGENT = "BedaanWaves/1.0 (contact@bedaanwaves.com)";
let cikCache: Map<string, string> = new Map();

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept": "application/json" },
    });
    if (res.ok) return res;
    if (res.status === 429) {
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      continue;
    }
    throw new Error(`EDGAR fetch failed: ${res.status} ${res.statusText}`);
  }
  throw new Error(`EDGAR fetch failed after ${retries} retries`);
}

export async function getCompanyCIK(ticker: string): Promise<string | null> {
  if (cikCache.has(ticker.toUpperCase())) {
    return cikCache.get(ticker.toUpperCase())!;
  }
  try {
    const url = "https://www.sec.gov/files/company_tickers.json";
    const res = await fetchWithRetry(url);
    const data = await res.json();
    const entry = Object.values(data).find((e: any) => e.ticker?.toUpperCase() === ticker.toUpperCase());
    if (entry) {
      const cik = String((entry as any).cik_str).padStart(10, "0");
      cikCache.set(ticker.toUpperCase(), cik);
      return cik;
    }
  } catch (e) {
    console.warn(`[SEC EDGAR] Failed to get CIK for ${ticker}:`, e);
  }
  return null;
}

export async function fetchCompanyFilings(cik: string, limit = 200): Promise<EDGARFiling[]> {
  try {
    const url = `${EDGAR_SUBMISSIONS}/CIK${cik}.json`;
    const res = await fetchWithRetry(url);
    const data = await res.json();

    const filings: EDGARFiling[] = [];
    const recent = data.filings?.recent;
    if (!recent) return [];

    const count = Math.min(limit, recent.accessionNumber?.length || 0);
    for (let i = 0; i < count; i++) {
      const form = recent.form[i];
      if (!FILING_TYPES[form as keyof typeof FILING_TYPES]) continue;

      filings.push({
        cik,
        ticker: data.tickers?.[0] || "",
        form,
        filingDate: recent.filingDate[i],
        reportDate: recent.reportDate[i],
        accessionNumber: recent.accessionNumber[i].replace(/-/g, ""),
        primaryDocument: recent.primaryDocument[i],
        primaryDocDescription: recent.primaryDocDescription[i],
        size: recent.size[i],
      });
    }
    return filings;
  } catch (e) {
    console.warn(`[SEC EDGAR] Failed to fetch filings for CIK ${cik}:`, e);
    return [];
  }
}

function extractSentimentFromFiling(form: string, description: string): { sentiment: "bullish" | "bearish" | "neutral"; severity: "critical" | "notable" | "informational" } {
  const typeInfo = FILING_TYPES[form as keyof typeof FILING_TYPES] || { severity: "informational" as const, sentimentHint: "neutral" as const };
  const desc = description.toLowerCase();

  let sentiment: "bullish" | "bearish" | "neutral" = typeInfo.sentimentHint;

  const positiveSignals = ["acquisition", "merger", "partnership", "expansion", "growth", "record", "beat", "exceed", "raise", "increase", "strong", "approval", "launch", "contract", "award", "dividend", "buyback", "positive", "upside", "outperform", "upgrade"];
  const negativeSignals = ["impairment", "loss", "decline", "miss", "reduce", "cut", "layoff", "restructuring", "investigation", "lawsuit", "default", "bankruptcy", "delay", "warning", "risk", "uncertainty", "negative", "downside", "underperform", "downgrade", "resignation", "departure"];

  let pos = 0, neg = 0;
  for (const s of positiveSignals) if (desc.includes(s)) pos++;
  for (const s of negativeSignals) if (desc.includes(s)) neg++;

  if (pos > neg) sentiment = "bullish";
  else if (neg > pos) sentiment = "bearish";

  return { sentiment, severity: typeInfo.severity };
}

export async function fetchSECNewsForTicker(ticker: string, daysBack = 730): Promise<NewsArticle[]> {
  const cik = await getCompanyCIK(ticker);
  if (!cik) return [];

  const filings = await fetchCompanyFilings(cik, 300);
  const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  const articles: NewsArticle[] = [];
  for (const filing of filings) {
    const filingDate = new Date(filing.filingDate);
    if (filingDate < cutoffDate) continue;

    const { sentiment, severity } = extractSentimentFromFiling(filing.form, filing.primaryDocDescription);

    const accessionClean = filing.accessionNumber;
    const docUrl = `https://www.sec.gov/Archives/edgar/data/${parseInt(cik)}/${accessionClean}/${filing.primaryDocument}`;

    articles.push({
      headline: `${ticker}: ${filing.form} - ${filing.primaryDocDescription}`,
      source: "SEC EDGAR",
      url: docUrl,
      publishedAt: filingDate,
      sentiment,
      severity,
      tickers: [ticker],
      rawContent: `Form ${filing.form} filed on ${filing.filingDate}. ${filing.primaryDocDescription}`,
      summary: filing.primaryDocDescription,
    });
  }

  return articles;
}

export async function fetchSECNewsForAllTickers(tickers: string[], daysBack = 730, batchSize = 10): Promise<NewsArticle[]> {
  const allArticles: NewsArticle[] = [];

  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    console.log(`[SEC EDGAR] Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(tickers.length/batchSize)} (${batch.length} tickers)`);

    const batchResults = await Promise.allSettled(
      batch.map(ticker => fetchSECNewsForTicker(ticker, daysBack))
    );

    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j];
      const ticker = batch[j];
      if (result.status === "fulfilled") {
        allArticles.push(...result.value);
        console.log(`[SEC EDGAR] ${ticker}: ${result.value.length} filings`);
      } else {
        console.warn(`[SEC EDGAR] Failed for ${ticker}:`, result.reason);
      }
    }

    if (i + batchSize < tickers.length) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  return allArticles;
}