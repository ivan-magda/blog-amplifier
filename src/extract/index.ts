import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import type { Subject, Platform } from "../types.js";

export { fromBlogPost } from "./blog.js";
export { fromGitHubRepo } from "./github.js";

/** Load a previously-saved subject by id from `subjects/<id>.json`. */
export async function loadSubject(id: string): Promise<Subject> {
  const file = path.join(config.paths.subjects, `${id}.json`);
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw) as Subject;
}

/** List all saved subject ids. */
export async function listSubjects(): Promise<string[]> {
  const entries = await fs.readdir(config.paths.subjects).catch(() => []);
  return entries
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

/** Persist a subject to `subjects/<id>.json`. */
export async function saveSubject(subject: Subject): Promise<string> {
  await fs.mkdir(config.paths.subjects, { recursive: true });
  const file = path.join(config.paths.subjects, `${subject.id}.json`);
  await fs.writeFile(file, JSON.stringify(subject, null, 2) + "\n");
  return file;
}

/**
 * Build a starting search query per platform from keywords. Heuristic and
 * meant to be hand-tuned afterwards in the subject JSON.
 *
 * `keywords` and `context` are merged into one normalized, de-duplicated pool.
 * Normalization is important: slug-style tags like `foundation-models` are
 * turned into the phrase `foundation models` — on X a hyphen is the exclusion
 * operator, so `foundation-models` would otherwise search `foundation AND NOT
 * models`. Possessives and stray quotes are stripped for the same reason.
 *
 * - X: OR-group of the top ~5 terms (multi-word terms quoted) + `lang:en`.
 * - LinkedIn: space-joined terms, capped at LinkedIn's 85-char search limit.
 */
export function buildQueries(keywords: string[], context: string[] = []): Record<Platform, string> {
  const terms = dedupeTerms([...keywords, ...context]);

  const orGroup = terms.slice(0, 5).map(quoteIfMultiword);
  const x = orGroup.length ? `(${orGroup.join(" OR ")}) lang:en` : "lang:en";

  let linkedin = "";
  for (const term of terms) {
    const next = linkedin ? `${linkedin} ${term}` : term;
    if (next.length > 85) break;
    linkedin = next;
  }
  if (!linkedin) linkedin = terms.slice(0, 3).join(" ").slice(0, 85);

  return { x, linkedin };
}

/** Normalize a raw keyword into a clean search term (see buildQueries). */
function normalizeTerm(raw: string): string {
  return raw
    .trim()
    .replace(/^["']+|["']+$/g, "") // strip surrounding quotes
    .replace(/['’]s\b/gi, "") // strip possessive 's
    .replace(/['’]/g, "") // strip stray apostrophes
    .replace(/[_-]+/g, " ") // slug separators -> spaces (avoids X's `-` exclusion)
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalize, drop empties, and de-duplicate case-insensitively (first wins). */
function dedupeTerms(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    const term = normalizeTerm(r);
    if (!term) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(term);
  }
  return out;
}

function quoteIfMultiword(term: string): string {
  return /\s/.test(term) ? `"${term}"` : term;
}
