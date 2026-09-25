import { db } from "@/lib/db";
import { NewsSentimentResult } from "@/lib/news/types";

const SEVERITY_WEIGHT: Record<string, number> = {
  critical: 1.0,
  notable: 0.8,
  informational: 0.5,
};

function sentimentToScore(sentiment: string): number {
  if (sentiment === "bullish") return 75;
  if (sentiment === "bearish") return 25;
  return 50;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export async function computeNewsSentimentForDayFromDB(
  dateStr: string,
  lookbackDays = 20
): Promise<Record<string, NewsSentimentResult>> {
  const dayStart = new Date(dateStr + "T00:00:00Z");
  const dayEnd = new Date(dayStart.getTime() + 86400000);
  const lookbackStart = new Date(dayStart.getTime() - lookbackDays * 86400000);

  const newsItems = await db.newsItem.findMany({
    where: {
      publishedAt: {
        gte: lookbackStart,
        lt: dayEnd,
      },
    },
    include: {
      tickers: {
        select: { ticker: true },
      },
    },
  });

  const out: Record<string, { sentimentSum: number; weightSum: number; articleCount: number }> = {};

  for (const n of newsItems) {
    const pubDate = n.publishedAt.getTime();
    if (pubDate > dayEnd.getTime() || pubDate < lookbackStart.getTime()) continue;

    const sentimentScore = sentimentToScore(n.sentiment);
    const weight = SEVERITY_WEIGHT[n.severity] ?? 0.5;

    for (const nt of n.tickers) {
      const ticker = nt.ticker;
      if (!out[ticker]) {
        out[ticker] = { sentimentSum: 0, weightSum: 0, articleCount: 0 };
      }
      out[ticker].sentimentSum += sentimentScore * weight;
      out[ticker].weightSum += weight;
      out[ticker].articleCount++;
    }
  }

  const result: Record<string, NewsSentimentResult> = {};
  for (const ticker of Object.keys(out)) {
    const o = out[ticker];
    const avgSentiment = o.weightSum > 0 ? o.sentimentSum / o.weightSum : 50;
    const scaledVolume = Math.min(100, Math.sqrt(o.articleCount) * 15);
    const deviation = avgSentiment - 50;
    const intensityFactor = Math.min(1, scaledVolume / 50);
    result[ticker] = {
      avgSentiment: clamp(avgSentiment, 0, 100),
      articleCount: scaledVolume,
      socialSentiment: clamp(50 + deviation * 0.6 * intensityFactor, 0, 100),
    };
  }

  return result;
}

export async function getNewsCoverageStats(): Promise<{
  totalArticles: number;
  tickersCovered: number;
  dateRange: { from: Date | null; to: Date | null };
  bySource: Record<string, number>;
  bySentiment: Record<string, number>;
  bySeverity: Record<string, number>;
}> {
  const [totalArticles, items, tickers] = await Promise.all([
    db.newsItem.count(),
    db.newsItem.findMany({
      select: { source: true, sentiment: true, severity: true, publishedAt: true },
    }),
    db.newsItemSymbol.findMany({
      select: { ticker: true },
      distinct: ["ticker"],
    }),
  ]);

  const bySource: Record<string, number> = {};
  const bySentiment: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  let minDate: Date | null = null;
  let maxDate: Date | null = null;

  for (const item of items) {
    bySource[item.source] = (bySource[item.source] || 0) + 1;
    bySentiment[item.sentiment] = (bySentiment[item.sentiment] || 0) + 1;
    bySeverity[item.severity] = (bySeverity[item.severity] || 0) + 1;

    const d = item.publishedAt;
    if (!minDate || d < minDate) minDate = d;
    if (!maxDate || d > maxDate) maxDate = d;
  }

  return {
    totalArticles,
    tickersCovered: tickers.length,
    dateRange: { from: minDate, to: maxDate },
    bySource,
    bySentiment,
    bySeverity,
  };
}