import { config } from "../config.js";
import type { Candidate, Subject } from "../types.js";
import { runActor } from "./apify.js";
import { num, obj, sinceDate, str } from "./normalize.js";

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
      // No usable timestamp -> leave empty so recencyScore treats it as unknown
      // (score 0) rather than rewarding missing metadata with a "brand new" boost.
      createdAt: str(it.createdAt) ?? "",
    });
  }

  return candidates;
}
