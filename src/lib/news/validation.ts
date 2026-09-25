import { db } from "@/lib/db";
import { NewsIngestionStats } from "./types";

export interface NewsQualityReport {
  timestamp: Date;
  totalArticles: number;
  articlesWithTickers: number;
  articlesWithSentiment: number;
  articlesWithSeverity: number;
  uniqueTickersCovered: number;
  dateRange: { from: Date | null; to: Date | null };
  sourceDistribution: Record<string, number>;
  sentimentDistribution: Record<string, number>;
  severityDistribution: Record<string, number>;
  avgArticlesPerTicker: number;
  duplicateRate: number;
  issues: string[];
  qualityScore: number; // 0-100
}

export async function generateNewsQualityReport(): Promise<NewsQualityReport> {
  const issues: string[] = [];

  const [
    totalArticles,
    items,
    tickerPairs,
    distinctTickers,
  ] = await Promise.all([
    db.newsItem.count(),
    db.newsItem.findMany({
      select: {
        source: true,
        sentiment: true,
        severity: true,
        publishedAt: true,
        headline: true,
      },
    }),
    db.newsItemSymbol.findMany({
      select: { newsItemId: true, ticker: true },
    }),
    db.newsItemSymbol.findMany({
      select: { ticker: true },
      distinct: ["ticker"],
    }),
  ]);

  // Build article lookup for ticker count
  const tickerCountByArticle = new Map<string, number>();
  for (const pair of tickerPairs) {
    tickerCountByArticle.set(
      pair.newsItemId,
      (tickerCountByArticle.get(pair.newsItemId) || 0) + 1
    );
  }

  const articlesWithTickers = Array.from(tickerCountByArticle.values()).filter((c) => c > 0).length;
  const articlesWithSentiment = items.filter((i) => i.sentiment !== "neutral").length;
  const articlesWithSeverity = items.filter((i) => i.severity !== "informational").length;

  const sourceDistribution: Record<string, number> = {};
  const sentimentDistribution: Record<string, number> = {};
  const severityDistribution: Record<string, number> = {};

  let minDate: Date | null = null;
  let maxDate: Date | null = null;

  for (const item of items) {
    sourceDistribution[item.source] = (sourceDistribution[item.source] || 0) + 1;
    sentimentDistribution[item.sentiment] = (sentimentDistribution[item.sentiment] || 0) + 1;
    severityDistribution[item.severity] = (severityDistribution[item.severity] || 0) + 1;

    const d = item.publishedAt;
    if (!minDate || d < minDate) minDate = d;
    if (!maxDate || d > maxDate) maxDate = d;
  }

  // Check for duplicates (same headline + source + date)
  const seen = new Map<string, number>();
  for (const item of items) {
    const key = `${item.headline}|${item.source}|${item.publishedAt.toISOString().split("T")[0]}`;
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  const duplicateCount = Array.from(seen.values()).filter((c) => c > 1).length;
  const duplicateRate = totalArticles > 0 ? duplicateCount / totalArticles : 0;

  const uniqueTickersCovered = distinctTickers.length;
  const avgArticlesPerTicker = uniqueTickersCovered > 0 ? totalArticles / uniqueTickersCovered : 0;

  // Quality checks
  if (totalArticles === 0) issues.push("No news articles in database");
  if (articlesWithTickers / totalArticles < 0.5) issues.push("Less than 50% of articles have ticker associations");
  if (duplicateRate > 0.1) issues.push(`High duplicate rate: ${(duplicateRate * 100).toFixed(1)}%`);
  if (uniqueTickersCovered < 100) issues.push(`Low ticker coverage: only ${uniqueTickersCovered} tickers have news`);
  if (avgArticlesPerTicker < 2) issues.push(`Low article density: ${avgArticlesPerTicker.toFixed(1)} articles per ticker on average`);
  let daysSpan = 0;
  if (!minDate || !maxDate) issues.push("No date range available");
  else {
    daysSpan = (maxDate.getTime() - minDate.getTime()) / (24 * 60 * 60 * 1000);
    if (daysSpan < 30) issues.push(`Short date range: only ${daysSpan.toFixed(0)} days of news data`);
  }
  if (Object.keys(sourceDistribution).length < 2) issues.push("Low source diversity - only 1 source");
  if (sentimentDistribution.neutral && sentimentDistribution.neutral / totalArticles > 0.8) {
    issues.push("High neutral sentiment ratio - sentiment analysis may not be working");
  }

  // Calculate quality score (0-100)
  let qualityScore = 100;
  if (totalArticles === 0) qualityScore = 0;
  else {
    qualityScore -= issues.length * 10;
    qualityScore -= Math.min(20, duplicateRate * 100);
    qualityScore -= Math.max(0, 100 - uniqueTickersCovered) * 0.1;
    qualityScore -= Math.max(0, 30 - daysSpan) * 0.5;
    qualityScore = Math.max(0, Math.min(100, qualityScore));
  }

  return {
    timestamp: new Date(),
    totalArticles,
    articlesWithTickers,
    articlesWithSentiment,
    articlesWithSeverity,
    uniqueTickersCovered,
    dateRange: { from: minDate, to: maxDate },
    sourceDistribution,
    sentimentDistribution,
    severityDistribution,
    avgArticlesPerTicker,
    duplicateRate,
    issues,
    qualityScore,
  };
}

export async function validateNewsForScoring(daysBack = 7): Promise<{
  valid: boolean;
  coverage: number;
  tickersWithRecentNews: number;
  message: string;
}> {
  const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  const [totalSymbols, symbolsWithNews] = await Promise.all([
    db.symbol.count({ where: { exchange: "NASDAQ" } }),
    db.newsItemSymbol.findMany({
      where: {
        newsItem: { publishedAt: { gte: cutoffDate } },
      },
      select: { ticker: true },
      distinct: ["ticker"],
    }),
  ]);

  const tickersWithRecentNews = symbolsWithNews.length;
  const coverage = totalSymbols > 0 ? tickersWithRecentNews / totalSymbols : 0;

  let valid = true;
  let message = "";

  if (coverage < 0.1) {
    valid = false;
    message = `CRITICAL: Only ${(coverage * 100).toFixed(1)}% of NASDAQ symbols have recent news (${tickersWithRecentNews}/${totalSymbols})`;
  } else if (coverage < 0.3) {
    valid = false;
    message = `WARNING: Low news coverage - ${(coverage * 100).toFixed(1)}% of symbols have recent news`;
  } else {
    message = `OK: ${(coverage * 100).toFixed(1)}% of NASDAQ symbols have recent news`;
  }

  return { valid, coverage, tickersWithRecentNews, message };
}