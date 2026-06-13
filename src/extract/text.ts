/** Small text helpers shared by the blog and GitHub subject extractors. */

/** Coerce an unknown frontmatter/JSON value to a trimmed string ("" if absent). */
export function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Coerce an unknown value to an array of trimmed strings (non-strings dropped). */
export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string").map((v) => v.trim());
}

/** De-duplicate case-insensitively while preserving first-seen order/casing. */
export function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}
