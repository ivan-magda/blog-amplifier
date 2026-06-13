import type { Subject, Candidate, RelevanceResult, DraftResult } from "../types.js";
import { ClaudeCliJudge } from "./claude-cli.js";

/**
 * The judge seam (PRD §4, §7). Two phases over the same candidate batch:
 * `score()` rates topic relevance for every candidate, `draft()` writes a
 * comment for the (post-blend) top-N. The only v1 implementation shells out to
 * the local `claude -p` CLI; Phase 2 backends (embeddings, ollama) can slot in
 * behind this interface without touching discover/score/review.
 */
export interface Judge {
  score(subject: Subject, candidates: Candidate[]): Promise<RelevanceResult[]>;
  draft(subject: Subject, candidates: Candidate[]): Promise<DraftResult[]>;
}

/** Factory for the active judge backend (v1: local `claude -p`). */
export function getJudge(): Judge {
  return new ClaudeCliJudge();
}
