import path from "node:path";
import fs from "node:fs/promises";
import matter from "gray-matter";
import type { Subject } from "../types.js";
import { buildQueries } from "./index.js";
import { asString, asStringArray, dedupe, distinctivePhrases } from "./text.js";

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

  // Lead with distinctive phrases lifted from the title by orthography (proper
  // names / CamelCase / quoted spans) so they win the query's top slots. This
  // is a generic heuristic — real precision comes from the per-subject query
  // and the hand-authored focus/notSubject, so a weak lift is a quick edit.
  const titlePhrases = distinctivePhrases(title);
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

