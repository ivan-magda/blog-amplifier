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

/**
 * Generic words that add noise rather than precision to a search query. Shared
 * by both extractors (the GitHub miner and the blog distinctive-phrase lift).
 */
export const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "for", "in", "on", "with", "by",
  "is", "are", "be", "this", "that", "it", "as", "at", "from", "into", "your",
  "you", "we", "our", "my", "i", "me", "notes", "note", "repo", "repository",
  "project", "code", "guide", "intro", "introduction", "overview", "about",
  "readme", "docs", "doc", "documentation", "example", "examples", "sample",
  "samples", "demo", "getting", "started", "usage", "install", "installation",
  "setup", "table", "contents", "license", "contributing", "features", "feature",
  "how", "what", "why", "when", "use", "using", "list", "summary",
  "content", "copyright", "folder", "folders", "file", "files", "video", "videos",
  "image", "images", "metadata", "snippet", "snippets", "section", "sections",
  "new", "plus", "via", "etc", "more",
]);

/**
 * Lift distinctive phrases out of free text by ORTHOGRAPHY alone — never by a
 * hardcoded topic list. Catches three shapes that tend to be proper
 * product/feature/API names: quoted/backtick spans, multi-word Title-Case runs,
 * and CamelCase or ALLCAPS tokens (e.g. `LanguageModelSession`, `WWDC`). Drops
 * stopword-only matches, de-duplicates, and caps the count. The output feeds
 * the hand-editable `keywords`, so a misfire is a quick edit, not a silent loss.
 */
export function distinctivePhrases(text: string, cap = 3): string[] {
  if (!text) return [];
  const found: string[] = [];

  // 1. Quoted / backtick spans (the author flagged these as names themselves).
  for (const m of text.matchAll(/["'`“”]([^"'`“”\n]{2,60})["'`“”]/g)) {
    const s = m[1]?.trim();
    if (s) found.push(s);
  }
  // 2. Multi-word Title-Case runs ("Foundation Models", "Private Cloud Compute").
  for (const m of text.matchAll(/\b[A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+)+\b/g)) {
    found.push(m[0]);
  }
  // 3. CamelCase tokens (LanguageModelSession) or ALLCAPS tokens (WWDC, API, LLM).
  for (const m of text.matchAll(/\b(?:[A-Za-z]*[a-z][A-Z][A-Za-z0-9]*|[A-Z0-9]{2,})\b/g)) {
    found.push(m[0]);
  }

  const meaningful = found.filter((p) =>
    p.split(/\s+/).some((w) => !STOPWORDS.has(w.toLowerCase())),
  );
  return dedupe(meaningful).slice(0, cap);
}
