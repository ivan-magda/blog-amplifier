/**
 * Deterministic scoring signals (PRD §8).
 *
 *   engagement = normalize( log1p(likes + 2·replies + reposts) )  // min-max across batch
 *   recency    = exp( -ageDays / halfLife )                        // halfLife = 7d
 *
 * Replies are weighted double: an active thread is worth more than a popular-
 * but-dead one.
 */

/** Clamp `n` into the inclusive range [lo, hi]. */
function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Raw engagement signal for a single candidate. Compressed with `log1p` so a
 * handful of viral posts don't dominate; replies count double because an active
 * back-and-forth is a better conversation to join than a one-off like magnet.
 */
export function engagementRaw(c: {
  likes: number;
  replies: number;
  reposts: number;
}): number {
  return Math.log1p(c.likes + 2 * c.replies + c.reposts);
}

/**
 * Min-max scale `values` into 0..1, preserving length and order. When every
 * value is identical (including the empty- or single-element cases) there is no
 * spread to normalize against, so every entry maps to 0.
 */
export function minMaxNormalize(values: number[]): number[] {
  if (values.length === 0) return [];
  let min = values[0] as number;
  let max = values[0] as number;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min;
  if (range === 0) return values.map(() => 0);
  return values.map((v) => (v - min) / range);
}

/**
 * Exponential recency decay in [0, 1]. A post created `halfLifeDays` ago scores
 * ~0.5; one created now scores ~1. Unparseable timestamps score 0; future
 * timestamps are treated as age 0 (score ~1).
 */
export function recencyScore(
  createdAt: string,
  halfLifeDays: number,
  now: Date = new Date(),
): number {
  const parsed = Date.parse(createdAt);
  if (Number.isNaN(parsed)) return 0;
  const ageMs = now.getTime() - parsed;
  const ageDays = Math.max(0, ageMs / 86_400_000);
  return clamp(Math.exp(-ageDays / halfLifeDays), 0, 1);
}
