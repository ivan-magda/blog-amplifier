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
