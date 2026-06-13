/**
 * Hybrid ranking (PRD §8). Blends judge relevance with deterministic engagement
 * and recency signals, drops anything below `minScore`, and keeps the `topN`.
 *
 *   score = w.relevance·(relevance/100) + w.engagement·eng + w.recency·rec
 */
import { config } from "../config.js";
import type { Candidate, ScoredCandidate, RelevanceResult } from "../types.js";
import { engagementRaw, minMaxNormalize, recencyScore } from "./signals.js";

/** Per-call overrides for the scoring knobs; each falls back to `config`. */
export interface RankOptions {
  now?: Date;
  /** Relevance gate mode (see config.gate). */
  gateMode?: "off" | "drop_off_topic" | "drop_off_topic_and_adjacent";
  /** Scalar relevance floor; gates candidates lacking a topicClass. */
  relevanceFloor?: number;
  /** Engagement normalization scope. */
  engagementNormalization?: "batch" | "per_platform";
  /** Weight of the X-only views tiebreaker (0 = off). */
  tiebreakViewsWeight?: number;
}

/**
 * Rank a batch of candidates by the blended score. `relevance` results are
 * matched back to candidates by their array `index`; any candidate without a
 * relevance verdict is treated as relevance 0 / empty rationale. Engagement is
 * min-max normalized (batch-wide by default, optionally per-platform), so
 * scores are only meaningful within a single run. A relevance gate (off by
 * default) can drop keyword-collision posts the judge marked off_topic/adjacent
 * before the blend, and a small X-only views tiebreaker (weight 0 by default)
 * can reorder surviving X candidates. With identity defaults this is the
 * original blend. The returned `draft` is left undefined — drafting happens
 * later, over the surfaced top-N only.
 */
export function rankCandidates(
  candidates: Candidate[],
  relevance: RelevanceResult[],
  opts: RankOptions = {},
): ScoredCandidate[] {
  const gateMode = opts.gateMode ?? config.gate.mode;
  const relevanceFloor = opts.relevanceFloor ?? config.gate.relevanceFloor;
  const normalization = opts.engagementNormalization ?? config.engagementNormalization;
  const viewsWeight = opts.tiebreakViewsWeight ?? config.tiebreakViewsWeight;

  const relByIndex = new Map<number, RelevanceResult>();
  for (const r of relevance) relByIndex.set(r.index, r);

  const engagementScores = normalizeEngagement(candidates, normalization);

  const scored: ScoredCandidate[] = candidates.map((c, i) => {
    const rel = relByIndex.get(i);
    const relevanceValue = rel?.relevance ?? 0;
    const rationale = rel?.rationale ?? "";
    const engagementScore = engagementScores[i] ?? 0;
    const recency = recencyScore(c.createdAt, config.recencyHalfLifeDays, opts.now);

    const score =
      config.weights.relevance * (relevanceValue / 100) +
      config.weights.engagement * engagementScore +
      config.weights.recency * recency;

    return {
      ...c,
      relevance: relevanceValue,
      rationale,
      ...(rel?.topicClass ? { topicClass: rel.topicClass } : {}),
      engagementScore,
      recencyScore: recency,
      score,
    };
  });

  const survivors = scored.filter(
    (s) => !isGated(s, gateMode, relevanceFloor) && s.score >= config.minScore,
  );

  applyViewsTiebreaker(survivors, viewsWeight);

  return survivors.sort((a, b) => b.score - a.score).slice(0, config.topN);
}

/** Whether the relevance gate drops this candidate. Identity at mode "off" + floor 0. */
function isGated(
  s: ScoredCandidate,
  mode: "off" | "drop_off_topic" | "drop_off_topic_and_adjacent",
  relevanceFloor: number,
): boolean {
  if (mode !== "off" && s.topicClass) {
    if (s.topicClass === "off_topic") return true;
    if (mode === "drop_off_topic_and_adjacent" && s.topicClass === "adjacent") return true;
  }
  // Scalar fallback (also the only check for candidates lacking a topicClass).
  return s.relevance < relevanceFloor;
}

/** Min-max engagement, either across the whole batch or within each platform. */
function normalizeEngagement(
  candidates: Candidate[],
  mode: "batch" | "per_platform",
): number[] {
  if (mode !== "per_platform") {
    return minMaxNormalize(candidates.map((c) => engagementRaw(c)));
  }
  const out = new Array<number>(candidates.length).fill(0);
  const byPlatform = new Map<string, number[]>();
  candidates.forEach((c, i) => {
    const idxs = byPlatform.get(c.platform) ?? [];
    idxs.push(i);
    byPlatform.set(c.platform, idxs);
  });
  for (const idxs of byPlatform.values()) {
    const norm = minMaxNormalize(idxs.map((i) => engagementRaw(candidates[i] as Candidate)));
    idxs.forEach((i, k) => {
      out[i] = norm[k] ?? 0;
    });
  }
  return out;
}

/**
 * Add a small views-based bump to surviving X candidates that expose views,
 * normalized among themselves. Mutates `score` in place. LinkedIn and
 * no-views candidates are untouched (never penalized). No-op when weight is 0.
 */
function applyViewsTiebreaker(survivors: ScoredCandidate[], weight: number): void {
  if (weight <= 0) return;
  const eligible = survivors.filter((s) => s.platform === "x" && typeof s.views === "number");
  if (eligible.length === 0) return;
  const norm = minMaxNormalize(eligible.map((s) => Math.log1p(s.views as number)));
  eligible.forEach((s, k) => {
    s.score += weight * (norm[k] ?? 0);
  });
}
