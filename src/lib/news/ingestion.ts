import { db } from "@/lib/db";
import { NewsArticle, NewsIngestionStats, FetchedNewsResult } from "./types";
import { fetchAllNews } from "./fetchers";
import { analyzeSentiment, getSeverity } from "./sentiment";
import { SEED_TICKERS_DEDUP } from "@/lib/scoring/seed/universe";

const KNOWN_TICKERS = new Set(SEED_TICKERS_DEDUP.map((s) => s.ticker));

let validDbTickers: Set<string> | null = null;

export function resetValidDbTickersCache(): void {
  validDbTickers = null;
}

async function getValidDbTickers(): Promise<Set<string>> {
  if (validDbTickers) return validDbTickers;
  const symbols = await db.symbol.findMany({
    select: { ticker: true },
  });
  validDbTickers = new Set(symbols.map(s => s.ticker));
  return validDbTickers;
}

function deduplicateArticles(articles: NewsArticle[]): NewsArticle[] {
  const seen = new Map<string, NewsArticle>();
  for (const a of articles) {
    const key = `${a.headline}|${a.source}|${a.publishedAt.toISOString()}`;
    const existing = seen.get(key);
    if (!existing || a.tickers.length > existing.tickers.length) {
      seen.set(key, a);
    }
  }
  return Array.from(seen.values());
}

export async function storeNewsArticles(articles: NewsArticle[]): Promise<{ stored: number; errors: number }> {
  let stored = 0;
  let errors = 0;

  const validTickers = await getValidDbTickers();

  for (const article of articles) {
    try {
      const newsKey = `${article.headline}\u0000${article.source}\u0000${article.publishedAt.toISOString()}`;
      const existingNews = await db.newsItem.findFirst({
        where: {
          headline: article.headline,
          source: article.source,
          publishedAt: article.publishedAt,
        },
        select: { id: true },
      });

      let newsItemId: string;
      if (existingNews) {
        newsItemId = existingNews.id;
      } else {
        const created = await db.newsItem.create({
          data: {
            headline: article.headline,
            source: article.source,
            url: article.url,
            publishedAt: article.publishedAt,
            sentiment: article.sentiment,
            severity: article.severity,
          },
        });
        newsItemId = created.id;
      }

      const existingPairs = await db.newsItemSymbol.findMany({
        where: { newsItemId },
        select: { ticker: true },
      });
      const existingTickers = new Set(existingPairs.map((p) => p.ticker));
      const newTickers = article.tickers.filter((t) => !existingTickers.has(t) && validTickers.has(t));

      if (newTickers.length > 0) {
        try {
          await db.newsItemSymbol.createMany({
            data: newTickers.map((ticker) => ({ newsItemId, ticker })),
          });
        } catch {
          // Ignore duplicates
        }
      }

      stored++;
    } catch (e) {
      console.error("[NewsIngestion] Store failed:", e);
      errors++;
    }
  }

  return { stored, errors };
}

export async function runNewsIngestion(daysBack = 1): Promise<NewsIngestionStats> {
  const t0 = Date.now();
  console.log(`[NewsIngestion] Starting ingestion for last ${daysBack} day(s)...`);

  const results = await fetchAllNews(KNOWN_TICKERS, daysBack);

  let allArticles: NewsArticle[] = [];
  const bySource: Record<string, { fetched: number; stored: number; errors: number }> = {};
  let totalFetched = 0;
  let totalErrors = 0;

  for (const result of results) {
    bySource[result.source] = { fetched: 0, stored: 0, errors: result.errors.length };
    totalErrors += result.errors.length;

    for (const article of result.articles) {
      const sentimentResult = await analyzeSentiment(article.headline, article.summary);
      const severity = getSeverity(article.headline, article.summary);

      allArticles.push({
        ...article,
        sentiment: sentimentResult.sentiment,
        severity,
      });
    }

    bySource[result.source].fetched = result.articles.length;
    totalFetched += result.articles.length;
  }

  const uniqueArticles = deduplicateArticles(allArticles);
  console.log(`[NewsIngestion] Fetched ${totalFetched} articles, ${uniqueArticles.length} unique after dedup`);

  const { stored, errors: storeErrors } = await storeNewsArticles(uniqueArticles);
  totalErrors += storeErrors;

  for (const [source, stats] of Object.entries(bySource)) {
    stats.stored = uniqueArticles.filter((a) => a.source.toLowerCase().includes(source.toLowerCase())).length;
  }

  const tickersCovered = new Set(uniqueArticles.flatMap((a) => a.tickers)).size;
  const dates = uniqueArticles.map((a) => a.publishedAt);
  const dateRange = {
    from: dates.length > 0 ? new Date(Math.min(...dates.map((d) => d.getTime()))) : new Date(),
    to: dates.length > 0 ? new Date(Math.max(...dates.map((d) => d.getTime()))) : new Date(),
  };

  const stats: NewsIngestionStats = {
    totalFetched,
    totalStored: stored,
    totalErrors,
    bySource,
    tickersCovered,
    dateRange,
  };

  console.log(`[NewsIngestion] Completed in ${Date.now() - t0}ms:`, stats);
  return stats;
}

export async function runHistoricalBackfill(daysBack = 730): Promise<NewsIngestionStats> {
  console.log(`[NewsIngestion] Starting historical backfill for ${daysBack} days...`);

  const CHUNK_DAYS = 7;
  let totalStats: NewsIngestionStats = {
    totalFetched: 0,
    totalStored: 0,
    totalErrors: 0,
    bySource: {},
    tickersCovered: 0,
    dateRange: { from: new Date(), to: new Date() },
  };

  const allTickersCovered = new Set<string>();
  let globalFrom: Date | null = null;
  let globalTo: Date | null = null;

  for (let offset = 0; offset < daysBack; offset += CHUNK_DAYS) {
    const chunkDays = Math.min(CHUNK_DAYS, daysBack - offset);
    console.log(`[NewsIngestion] Backfill chunk: days ${offset} to ${offset + chunkDays} ago`);

    try {
      const chunkStats = await runNewsIngestion(chunkDays);
      totalStats.totalFetched += chunkStats.totalFetched;
      totalStats.totalStored += chunkStats.totalStored;
      totalStats.totalErrors += chunkStats.totalErrors;

      for (const [source, stats] of Object.entries(chunkStats.bySource)) {
        if (!totalStats.bySource[source]) totalStats.bySource[source] = { fetched: 0, stored: 0, errors: 0 };
        totalStats.bySource[source].fetched += stats.fetched;
        totalStats.bySource[source].stored += stats.stored;
        totalStats.bySource[source].errors += stats.errors;
      }

      if (!globalFrom || chunkStats.dateRange.from < globalFrom) globalFrom = chunkStats.dateRange.from;
      if (!globalTo || chunkStats.dateRange.to > globalTo) globalTo = chunkStats.dateRange.to;

      await new Promise((r) => setTimeout(r, 2000));
    } catch (e) {
      console.error(`[NewsIngestion] Chunk failed at offset ${offset}:`, e);
      totalStats.totalErrors++;
    }
  }

  totalStats.dateRange = { from: globalFrom || new Date(), to: globalTo || new Date() };
  console.log("[NewsIngestion] Historical backfill complete:", totalStats);
  return totalStats;
}

export async function ensureNewsData(days: string[]): Promise<void> {
  const latestDay = days[days.length - 1];
  const daysBack = Math.ceil((Date.now() - new Date(latestDay).getTime()) / (24 * 60 * 60 * 1000)) + 1;
  console.log(`[seed] Ensuring news data for last ${daysBack} days...`);
  await runNewsIngestion(Math.max(daysBack, 1));
}