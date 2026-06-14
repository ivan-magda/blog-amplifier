/** Core data model shared across every pipeline stage. */

export type Platform = "x" | "linkedin";
export type SubjectType = "blog" | "github";

export const PLATFORMS: Platform[] = ["x", "linkedin"];

/**
 * A thing you want to promote — a blog post or a GitHub repo. Produced by the
 * extractors (`src/extract/`), persisted as `subjects/<id>.json`, and hand-
 * editable. Everything downstream is subject-type-agnostic.
 */
export interface Subject {
  id: string;
  type: SubjectType;
  url: string;
  title: string;
  description: string;
  /** Distinctive terms used for keyword/BM25 boosting and query building. */
  keywords: string[];
  /** Ready-to-run search query per platform (editable). */
  queries: Record<Platform, string>;
  /**
   * Optional per-subject disambiguation (hand-editable). When set, the judge
   * uses these to separate the true subject from keyword-collision noise; when
   * absent, scoring and prompts behave exactly as before. Topic specificity
   * lives here in DATA — it is never hardcoded in code.
   *
   * `focus`: 1–2 sentences on what THIS subject specifically is and who the
   * ideal post author/audience is. `notSubject`: free-text phrases naming
   * broader/adjacent topics that share keywords but are NOT this subject (read
   * by the judge as guidance, never string-matched in scoring code).
   */
  focus?: string;
  notSubject?: string[];
  /**
   * Handles/names of the subject owner to exclude from discovery — you don't promote a post by replying to your own.
   */
  ownerHandles?: string[];
  /** Provenance for auto-generated disambiguation, so a human knows to verify it. */
  enrichment?: { source: "manual" | "auto"; model?: string; at?: string };
}

/** Generic relevance class the judge assigns when a subject defines disambiguation. */
export type TopicClass = "on_topic" | "adjacent" | "off_topic";

/** A single discovered post, normalized across platforms. */
export interface Candidate {
  platform: Platform;
  url: string;
  author: string;
  authorFollowers?: number;
  text: string;
  likes: number;
  replies: number;
  /** Retweets on X, reshares on LinkedIn. */
  reposts: number;
  /** Impressions — only X (xquik) exposes this; undefined elsewhere. */
  views?: number;
  /** ISO 8601 timestamp. */
  createdAt: string;
}

/** Candidate after relevance judging + deterministic signal scoring. */
export interface ScoredCandidate extends Candidate {
  /** 0–100 topic relevance from the judge. */
  relevance: number;
  /** One-line judge rationale for the relevance score. */
  rationale: string;
  /** Generic topical class from the judge (absent => treated as on_topic). */
  topicClass?: TopicClass;
  /** 0–1 normalized engagement signal. */
  engagementScore: number;
  /** 0–1 recency decay signal. */
  recencyScore: number;
  /** Final blended rank, 0–1. */
  score: number;
  /** Judge-drafted comment (only populated for the top-N that get drafted). */
  draft?: string;
}

/** One run's worth of candidates plus provenance. */
export interface CandidateBatch {
  subjectId: string;
  runAt: string;
  candidates: Candidate[];
}

export interface ScoredBatch {
  subjectId: string;
  runAt: string;
  scored: ScoredCandidate[];
}

/**
 * Per-candidate relevance verdict from the judge. `index` is the position in
 * the candidate array passed to the judge (so results can be mapped back).
 */
export interface RelevanceResult {
  index: number;
  /** 0–100 topic relevance. */
  relevance: number;
  rationale: string;
  /**
   * Generic topical class, present only when the subject defined disambiguation
   * (focus/notSubject) and the judge emitted it. Absent => treated as on_topic
   * downstream, so scalar-only judges (Phase-2 embeddings/ollama) stay valid.
   */
  topicClass?: TopicClass;
}

/** Per-candidate drafted comment from the judge. */
export interface DraftResult {
  index: number;
  comment: string;
}

/** A line in the append-only action ledger (`data/actions.log.jsonl`). */
export interface LedgerEntry {
  ts: string;
  subjectId: string;
  platform: Platform;
  url: string;
  comment: string;
  status: "posted";
}
