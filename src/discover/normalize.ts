/**
 * Shared coercion helpers for normalizing the unknown-shaped items that Apify
 * actors return into our `Candidate` model. One home, one set of tests — both
 * platform discoverers import these.
 */

/**
 * Coerce an unknown engagement value to a non-negative finite number.
 *
 * Handles the formats real actors emit: bare numbers, numeric strings,
 * grouping separators (`"1,234"` → 1234), and abbreviations (`"1.2K"` → 1200,
 * `"3.4M"` → 3_400_000). Anything unparseable, non-finite, or negative → 0.
 */
export function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? Math.max(0, v) : 0;
  if (typeof v !== "string") return 0;

  const s = v.trim().replace(/,/g, "");
  const m = /^(-?\d+(?:\.\d+)?)\s*([kmb])?$/i.exec(s);
  if (m && m[1] !== undefined) {
    let n = Number(m[1]);
    const suffix = m[2]?.toLowerCase();
    if (suffix === "k") n *= 1e3;
    else if (suffix === "m") n *= 1e6;
    else if (suffix === "b") n *= 1e9;
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }

  const n = Number(s);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/** Coerce an unknown value to a string, or undefined if absent. */
export function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : v == null ? undefined : String(v);
}

/** Pick the first nested record under a key, if any (e.g. `it.author`). */
export function obj(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : undefined;
}

/** YYYY-MM-DD for `n` days ago, in UTC. */
export function sinceDate(daysAgo: number): string {
  const d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}
