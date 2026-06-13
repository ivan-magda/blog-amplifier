import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Load .env (Node >= 20.12) so APIFY_TOKEN / JUDGE_* are available without a
// dotenv dependency. Imported transitively by every entrypoint via config.
try {
  process.loadEnvFile(path.join(ROOT, ".env"));
} catch {
  // No .env present — fall back to the ambient environment.
}

/**
 * Central tuning + wiring. Actor IDs and pricing were verified 2026-06-13 (see
 * docs/research/apify-social-scrapers-blog-promo-deep-research-2026-06-13.md).
 * Re-verify live Store pricing before committing budget.
 */
export const config = {
  root: ROOT,
  paths: {
    subjects: path.join(ROOT, "subjects"),
    candidates: path.join(ROOT, "data", "candidates"),
    queue: path.join(ROOT, "data", "queue"),
    reviewQueue: path.join(ROOT, "data", "review-queue.csv"),
    ledger: path.join(ROOT, "data", "actions.log.jsonl"),
  },

  actors: {
    // Twitter/X — xquik X Tweet Scraper. $0.15/1k, pay-per-result, full
    // advanced-search operators (since:/until:, lang:), read-only. Chosen as the
    // default because it runs on Apify's FREE plan; apidojo/tweet-scraper is
    // higher-trust but BLOCKS free-plan API access ("subscribe to a paid plan").
    // On a paid plan, swap id to "apidojo/tweet-scraper" — same output fields.
    x: {
      id: "xquik/x-tweet-scraper",
      maxItems: 50,
    },
    // LinkedIn — HarvestAPI Post Search. From $1.50/1k ($2 base), NO cookies/
    // account required, read-only.
    linkedin: {
      id: "harvestapi/linkedin-post-search",
      maxItems: 50,
    },
  },

  // Hybrid rank = w.relevance·(relevance/100) + w.engagement·eng + w.recency·rec
  weights: {
    relevance: 0.6,
    engagement: 0.25,
    recency: 0.15,
  },
  /** Recency decay half-life, in days. */
  recencyHalfLifeDays: 7,
  /** Drop candidates whose blended score is below this (0–1). */
  minScore: 0.45,
  /**
   * Relevance gate (PRD precision work). Topic-agnostic: it keys off the
   * judge's generic topicClass enum, which is ONLY emitted when a subject
   * defines disambiguation (focus/notSubject). So a subject WITHOUT those
   * fields produces no topicClass and the gate is a no-op there — clean
   * subjects behave exactly as before. For subjects WITH disambiguation,
   * "drop_off_topic" stops keyword-collision posts from being out-voted into
   * the queue by recency/engagement (validated on a noisy live batch: it
   * removed an off-topic post the blend had surfaced at relevance 18). The
   * scalar relevanceFloor (default 0 = off) is the fallback for candidates
   * lacking a class.
   */
  gate: {
    mode: "drop_off_topic" as "off" | "drop_off_topic" | "drop_off_topic_and_adjacent",
    relevanceFloor: 0,
  },
  /** Engagement normalization scope. "batch" (default) = today's behavior
   *  (min-max across the merged X+LinkedIn batch); "per_platform" normalizes
   *  within each platform so cross-platform magnitude differences don't skew. */
  engagementNormalization: "batch" as "batch" | "per_platform",
  /** Weight of the X-only views (impressions) tiebreaker, added on top of the
   *  blend for surviving X candidates that expose views. IDENTITY DEFAULT 0 =
   *  no effect. Keep small (≤0.15); it should only reorder, never out-vote
   *  relevance. LinkedIn / no-views candidates are never penalized. */
  tiebreakViewsWeight: 0,
  /** How many top candidates to draft comments for and surface for review. */
  topN: 15,
  /** How far back to search, per platform. Kept tight (≤1 week) to surface
   *  conversations that are still active. harvestapi also allows "24h"/"1h". */
  search: {
    // The X query language is fixed to lang:en inside buildQueries (extract);
    // only sinceDays is read here.
    x: { sinceDays: 7 },
    linkedin: { postedLimit: "week" as const, sortBy: "relevance" as const },
  },

  judge: {
    /** Model alias passed to `claude -p --model`. */
    model: process.env.JUDGE_MODEL ?? "sonnet",
    timeoutMs: Number(process.env.JUDGE_TIMEOUT_MS ?? 180_000),
  },
} as const;

export type Config = typeof config;
