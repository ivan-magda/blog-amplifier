/**
 * Hybrid ranking (PRD §8). Blends judge relevance with deterministic engagement
 * and recency signals, drops anything below `minScore`, and keeps the `topN`.
 *
 *   score = w.relevance·(relevance/100) + w.engagement·eng + w.recency·rec
 */
import { config } from "../config.js";
import type { Candidate, ScoredCandidate, RelevanceResult } from "../types.js";
import { engagementRaw, minMaxNormalize, recencyScore } from "./signals.js";

/**
 * Rank a batch of candidates by the blended score. `relevance` results are
 * matched back to candidates by their array `index`; any candidate without a
 * relevance verdict is treated as relevance 0 / empty rationale. Engagement is
 * min-max normalized across this batch, so scores are only meaningful within a
 * single run. The returned `draft` is left undefined — drafting happens later,
 * over the surfaced top-N only.
 */
export function rankCandidates(
  candidates: Candidate[],
  relevance: RelevanceResult[],
  opts?: { now?: Date },
): ScoredCandidate[] {
  const relByIndex = new Map<number, RelevanceResult>();
  for (const r of relevance) relByIndex.set(r.index, r);

  const engagementScores = minMaxNormalize(candidates.map((c) => engagementRaw(c)));

  const scored: ScoredCandidate[] = candidates.map((c, i) => {
    const rel = relByIndex.get(i);
    const relevanceValue = rel?.relevance ?? 0;
    const rationale = rel?.rationale ?? "";
    const engagementScore = engagementScores[i] ?? 0;
    const recency = recencyScore(c.createdAt, config.recencyHalfLifeDays, opts?.now);

    const score =
      config.weights.relevance * (relevanceValue / 100) +
      config.weights.engagement * engagementScore +
      config.weights.recency * recency;

    return {
      ...c,
      relevance: relevanceValue,
      rationale,
      engagementScore,
      recencyScore: recency,
      score,
    };
  });

  return scored
    .filter((s) => s.score >= config.minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, config.topN);
}
