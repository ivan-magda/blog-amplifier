/** Pure, testable helpers used by the CLI orchestration in cli.ts. */

/**
 * Pick the candidates filename for a `--run <id|latest>` argument from a list
 * of directory entries. Returns the basename (caller joins the dir) or null.
 *
 * For a concrete id, only files named `<id>-<ISO timestamp>.candidates.json`
 * match — the segment after `<id>-` must look like an ISO date-time
 * (`YYYY-MM-DDT…`), so `--run wwdc26-notes` cannot match
 * `wwdc26-notes-deep-dive-…` and a sibling id ending in `-2024` cannot be
 * mistaken for a timestamp. Newest (lexicographically last, i.e. latest ISO
 * stamp) wins.
 *
 * `latest` returns the newest file overall; a concrete id returns ONLY that
 * id's newest file, or null if there is none — it never falls back to a
 * different subject's file (that would silently judge the wrong batch).
 */
export function selectCandidatesFile(files: string[], run: string): string | null {
  const all = files.filter((f) => f.endsWith(".candidates.json")).sort();

  if (run === "latest") return all.at(-1) ?? null;

  const prefix = `${run}-`;
  const matches = all.filter(
    (f) => f.startsWith(prefix) && /^\d{4}-\d{2}-\d{2}T/.test(f.slice(prefix.length)),
  );
  return matches.at(-1) ?? null;
}

/**
 * De-duplicate items by `url`, preserving first-seen order and skipping any url
 * already present in `exclude` (e.g. the action ledger). `exclude` is not
 * mutated.
 */
export function dedupeByUrl<T extends { url: string }>(
  items: T[],
  exclude: Set<string> = new Set(),
): T[] {
  const seen = new Set<string>(exclude);
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    out.push(item);
  }
  return out;
}

/** Collapse a handle/author to a single alphanumeric key: lowercase, drop every
 *  non-letter/digit, so "@magda_ivan", "ivan-magda", and "Ivan Magda" all become
 *  the same key. */
function normalizeHandle(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Split into lowercase alphanumeric tokens: "Ivan Magda | iOS @ Acme" ->
 *  ["ivan","magda","ios","acme"]. Used for subset matching so a display name
 *  carrying a title/pronoun suffix still matches the owner. */
function tokenize(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * Drop candidates authored by the subject owner (you don't promote a post by
 * replying to yourself). A candidate is the owner when, for any ownerHandle,
 * either (a) its normalized form equals the author's — catches "Ivan Magda" vs
 * the slug "ivanmagda" and the X handle "magda_ivan"; or (b) every token of the
 * handle appears in the author's tokens — catches a decorated LinkedIn display
 * name like "Ivan Magda | iOS @ Acme" that exact-match would miss. An empty
 * author never matches an owner (the scrapers default author to ""), and the
 * whole filter is a no-op when `ownerHandles` is empty. `items` is not mutated.
 */
export function dropOwnerAuthors<T extends { author: string }>(
  items: T[],
  ownerHandles: string[] = [],
): T[] {
  const owners = ownerHandles
    .map((h) => ({ norm: normalizeHandle(h), tokens: tokenize(h) }))
    .filter((o) => o.norm);
  if (owners.length === 0) return items;
  return items.filter((c) => {
    const authorNorm = normalizeHandle(c.author ?? "");
    if (!authorNorm) return true; // no usable author => not the owner, keep it
    const authorTokens = new Set(tokenize(c.author ?? ""));
    const isOwner = owners.some(
      (o) =>
        o.norm === authorNorm ||
        (o.tokens.length > 0 && o.tokens.every((t) => authorTokens.has(t))),
    );
    return !isOwner;
  });
}
