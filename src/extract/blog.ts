import path from "node:path";
import fs from "node:fs/promises";
import matter from "gray-matter";
import type { Subject } from "../types.js";
import { buildQueries } from "./index.js";
import { asString, asStringArray, dedupe } from "./text.js";

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

