export interface NewsArticle {
  headline: string;
  source: string;
  url: string;
  publishedAt: Date;
  sentiment: "bullish" | "bearish" | "neutral";
  severity: "critical" | "notable" | "informational";
  tickers: string[];
  rawContent?: string;
  summary?: string;
}

export interface NewsSourceConfig {
  name: string;
  baseUrl: string;
  apiKey?: string;
  rateLimit: { requests: number; windowMs: number };
  enabled: boolean;
  priority: number;
}

export interface FetchedNewsResult {
  articles: NewsArticle[];
  source: string;
  fetchedAt: Date;
  errors: string[];
}

export interface SentimentResult {
  sentiment: "bullish" | "bearish" | "neutral";
  confidence: number;
  score: number; // -1 to 1
}

export interface NewsIngestionStats {
  totalFetched: number;
  totalStored: number;
  totalErrors: number;
  bySource: Record<string, { fetched: number; stored: number; errors: number }>;
  tickersCovered: number;
  dateRange: { from: Date; to: Date };
}

export interface NewsSentimentResult {
  avgSentiment: number;
  articleCount: number;
  socialSentiment: number;
}