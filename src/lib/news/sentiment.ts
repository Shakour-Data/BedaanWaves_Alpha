import { SentimentResult } from "./types";

interface FinBERTOutput {
  label: string;
  score: number;
}

let finbertPipeline: any = null;
let initPromise: Promise<void> | null = null;
let finbertAvailable = false;

async function initFinBERT(): Promise<void> {
  if (finbertPipeline) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // Dynamic import - will fail gracefully if @xenova/transformers not installed
      const transformers = await import("@xenova/transformers").catch(() => null);
      if (!transformers) {
        console.warn("[FinBERT] @xenova/transformers not installed, using keyword-based sentiment");
        finbertAvailable = false;
        return;
      }
      const { pipeline } = transformers;
      // Use Xenova/finbert — an ONNX-converted version of ProsusAI/finbert
      // purpose-built for @xenova/transformers (Transformers.js). The original
      // ProsusAI/finbert is a PyTorch checkpoint and returns 403 from the JS
      // runtime, which previously silently fell back to keyword sentiment.
      finbertPipeline = await pipeline("text-classification", "Xenova/finbert", {
        quantized: true,
      });
      finbertAvailable = true;
      console.log("[FinBERT] Model loaded successfully");
    } catch (e) {
      console.warn("[FinBERT] Failed to load, falling back to keyword-based:", e);
      finbertPipeline = null;
      finbertAvailable = false;
    }
  })();

  return initPromise;
}

const POSITIVE_KEYWORDS = [
  "beat", "beats", "exceed", "exceeds", "surge", "surges", "rally", "rallies",
  "gain", "gains", "rise", "rises", "up", "higher", "strong", "strength",
  "growth", "grow", "growing", "profit", "profits", "profitable", "revenue up",
  "buyback", "dividend", "upgrade", "upgrades", "bullish", "optimistic",
  "outperform", "outperforms", "record", "high", "milestone", "expansion",
  "contract", "contracts", "deal", "partnership", "acquisition", "merger",
  "approval", "approved", "launch", "launches", "breakthrough", "innovation",
];

const NEGATIVE_KEYWORDS = [
  "miss", "misses", "fall", "falls", "drop", "drops", "decline", "declines",
  "loss", "losses", "lose", "losing", "down", "lower", "weak", "weakness",
  "cut", "cuts", "reduce", "reduces", "layoff", "layoffs", "restructuring",
  "downgrade", "downgrades", "bearish", "pessimistic", "underperform",
  "underperforms", "investigation", "lawsuit", "fraud", "scandal", "recall",
  "bankruptcy", "default", "delay", "delays", "halt", "halts", "suspend",
];

const CRITICAL_KEYWORDS = [
  "earnings", "earning", "eps", "revenue", "guidance", "forecast", "outlook",
  "fed", "federal reserve", "fomc", "interest rate", "rate decision", "cpi",
  "inflation", "jobs report", "nfp", "nonfarm", "unemployment", "gdp",
  "merger", "acquisition", "takeover", "buyout", "ipo", "spinoff", "split",
  "dividend", "buyback", "split", "fda", "approval", "rejection", "clinical",
  "trial", "phase 3", "phase ii", "breakthrough therapy",
];

function keywordSentiment(text: string): SentimentResult {
  const lower = text.toLowerCase();
  let pos = 0, neg = 0, critical = 0;

  for (const kw of POSITIVE_KEYWORDS) {
    const matches = (lower.match(new RegExp(`\\b${kw}\\b`, "g")) || []).length;
    pos += matches;
  }
  for (const kw of NEGATIVE_KEYWORDS) {
    const matches = (lower.match(new RegExp(`\\b${kw}\\b`, "g")) || []).length;
    neg += matches;
  }
  for (const kw of CRITICAL_KEYWORDS) {
    const matches = (lower.match(new RegExp(`\\b${kw}\\b`, "g")) || []).length;
    critical += matches;
  }

  const total = pos + neg;
  let sentiment: "bullish" | "bearish" | "neutral" = "neutral";
  let confidence = 0.5;
  let score = 0;

  if (total > 0) {
    score = (pos - neg) / total;
    confidence = Math.min(0.9, 0.5 + Math.abs(score) * 0.4 + critical * 0.05);
    if (score > 0.15) sentiment = "bullish";
    else if (score < -0.15) sentiment = "bearish";
  }

  return { sentiment, confidence, score };
}

export async function analyzeSentiment(headline: string, summary?: string): Promise<SentimentResult> {
  const text = `${headline}. ${summary || ""}`.trim();
  if (!text) return { sentiment: "neutral", confidence: 0, score: 0 };

  await initFinBERT();

  if (finbertAvailable && finbertPipeline) {
    try {
      const results = await finbertPipeline(text);
      const top = results[0];
      const label = top.label.toLowerCase();
      let sentiment: "bullish" | "bearish" | "neutral" = "neutral";
      if (label === "positive") sentiment = "bullish";
      else if (label === "negative") sentiment = "bearish";
      return {
        sentiment,
        confidence: top.score,
        score: label === "positive" ? top.score : label === "negative" ? -top.score : 0,
      };
    } catch (e) {
      console.warn("[FinBERT] Inference failed, falling back:", e);
    }
  }

  return keywordSentiment(text);
}

export function getSeverity(headline: string, summary?: string): "critical" | "notable" | "informational" {
  const text = `${headline} ${summary || ""}`.toLowerCase();
  let criticalCount = 0;

  for (const kw of CRITICAL_KEYWORDS) {
    if (text.includes(kw.toLowerCase())) criticalCount++;
  }

  if (criticalCount >= 2) return "critical";
  if (criticalCount >= 1) return "notable";
  return "informational";
}