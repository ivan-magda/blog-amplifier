import path from "node:path";
import fs from "node:fs/promises";
import matter from "gray-matter";
import type { Subject } from "../types.js";
import { buildQueries } from "./index.js";

/**
 * Distinctive multi-word product/feature phrases worth pulling out of a title
 * verbatim. Matched case-insensitively but emitted in canonical casing so the
 * resulting search queries quote them cleanly. These are the proper nouns that
 * make a search precise — generic title words add noise, these do not.
 */
const DISTINCTIVE_TITLE_PHRASES = [
  "Foundation Models",
  "Private Cloud Compute",
  "Dynamic Profiles",
  "Apple Intelligence",
  "LanguageModelSession",
];

/**
 * Build a `Subject` from an AstroPaper blog post's frontmatter.
 *
 * `id` comes from `slug` (or the filename); `keywords` is the post's `tags`
 * plus up to three distinctive multi-word phrases lifted from the title, so the
 * generated queries lead with precise product names rather than bare tags.
 */
export async function fromBlogPost(filePath: string): Promise<Subject> {
  const raw = await fs.readFile(filePath, "utf8");
  const { data } = matter(raw);

  const fm = data as {
    slug?: unknown;
    title?: unknown;
    description?: unknown;
    tags?: unknown;
  };

  const base = path.basename(filePath).replace(/\.md$/i, "");
  const id = asString(fm.slug) || base;
  const title = asString(fm.title);
  const description = asString(fm.description);
  const tags = asStringArray(fm.tags);

  // Lead with the distinctive title phrases so they win the query's top slots
  // (and their canonical casing wins de-duplication over slug-style tags).
  const titlePhrases = distinctivePhrasesFromTitle(title).slice(0, 3);
  const keywords = dedupe([...titlePhrases, ...tags]);

  return {
    id,
    type: "blog",
    url: `https://ivanmagda.dev/posts/${id}/`,
    title,
    description,
    keywords,
    queries: buildQueries(keywords, tags),
  };
}

/** Pick known distinctive multi-word phrases that actually appear in `title`. */
function distinctivePhrasesFromTitle(title: string): string[] {
  const haystack = title.toLowerCase();
  return DISTINCTIVE_TITLE_PHRASES.filter((phrase) =>
    haystack.includes(phrase.toLowerCase()),
  );
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string").map((v) => v.trim());
}

/** De-duplicate case-insensitively while preserving first-seen order/casing. */
function dedupe(values: string[]): string[] {
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
