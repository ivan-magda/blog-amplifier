import { config } from "../config.js";
import type { Candidate, Subject } from "../types.js";
import { runActor } from "./apify.js";

/** Coerce an unknown value to a finite number, defaulting to 0. */
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Coerce an unknown value to a string, or undefined if absent. */
function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : v == null ? undefined : String(v);
}

/** Pick the first nested record under a key, if any (e.g. `it.author`). */
function obj(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : undefined;
}

/** YYYY-MM-DD for `n` days ago, in UTC. */
function sinceDate(daysAgo: number): string {
  const d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

/**
 * Discover recent X/Twitter posts matching the subject's query via the
 * configured X actor (default: xquik). Date filtering is applied through a
 * `since:` operator appended to the search term — the verified path that honors
 * date filters and is supported by both xquik and apidojo.
 */
export async function discoverTwitter(subject: Subject): Promise<Candidate[]> {
  const since = sinceDate(config.search.x.sinceDays);
  const input: Record<string, unknown> = {
    searchTerms: [`${subject.queries.x} since:${since}`],
    maxItems: config.actors.x.maxItems,
  };

  const items = await runActor(config.actors.x.id, input, {
    maxItems: config.actors.x.maxItems,
  });

  const candidates: Candidate[] = [];
  for (const it of items) {
    const author = obj(it.author);
    const text = str(it.text) ?? str(it.full_text);
    const url = str(it.url) ?? str(it.twitterUrl);
    if (!url || !text) continue;

    const authorName =
      str(author?.userName) ?? str(author?.username) ?? str(it.username) ?? "";
    const authorFollowers = author ? num(author.followers) : undefined;
    const views = it.viewCount != null ? num(it.viewCount) : undefined;

    candidates.push({
      platform: "x",
      url,
      author: authorName,
      ...(authorFollowers !== undefined ? { authorFollowers } : {}),
      text,
      likes: num(it.likeCount ?? it.favoriteCount),
      replies: num(it.replyCount),
      reposts: num(it.retweetCount),
      ...(views !== undefined ? { views } : {}),
      createdAt: str(it.createdAt) ?? new Date().toISOString(),
    });
  }

  return candidates;
}
