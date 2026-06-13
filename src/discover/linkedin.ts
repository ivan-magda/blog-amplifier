import { config } from "../config.js";
import type { Candidate, Subject } from "../types.js";
import { runActor } from "./apify.js";
import { num, obj, str } from "./normalize.js";

/**
 * Discover recent LinkedIn posts matching the subject's query via the
 * HarvestAPI Post Search actor. No cookies/account required (read-only).
 */
export async function discoverLinkedIn(subject: Subject): Promise<Candidate[]> {
  const input: Record<string, unknown> = {
    searchQueries: [subject.queries.linkedin],
    postedLimit: config.search.linkedin.postedLimit,
    sortBy: config.search.linkedin.sortBy,
    maxPosts: config.actors.linkedin.maxItems,
  };

  const items = await runActor(config.actors.linkedin.id, input, {
    maxItems: config.actors.linkedin.maxItems,
  });

  const candidates: Candidate[] = [];
  for (const it of items) {
    const author = obj(it.author);
    const eng = obj(it.engagement); // harvestapi nests counts under `engagement`
    const posted = obj(it.postedAt); // `postedAt` is an object: { date, timestamp, ... }

    const text = str(it.content) ?? str(it.text);
    // harvestapi's post URL is `linkedinUrl`; keep older/alt keys as fallbacks.
    const url =
      str(it.linkedinUrl) ??
      str(it.url) ??
      str(it.postUrl) ??
      str(it.link) ??
      str(it.shareLinkedinUrl);
    if (!url || !text) continue;

    const authorName = str(author?.name) ?? str(it.authorName) ?? "";
    const postedAtStr = typeof it.postedAt === "string" ? it.postedAt : undefined;

    candidates.push({
      platform: "linkedin",
      url,
      author: authorName,
      text,
      likes: num(eng?.likes ?? it.reactionsCount ?? it.likes),
      replies: num(eng?.comments ?? it.commentsCount),
      reposts: num(eng?.shares ?? it.reposts),
      // No usable timestamp -> leave empty so recencyScore treats it as unknown
      // (score 0) rather than rewarding missing metadata with a "brand new" boost.
      createdAt:
        str(posted?.date) ?? postedAtStr ?? str(it.date) ?? str(it.createdAt) ?? "",
    });
  }

  return candidates;
}
