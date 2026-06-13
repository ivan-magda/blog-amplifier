import type { Candidate, Platform, Subject } from "../types.js";
import { discoverLinkedIn } from "./linkedin.js";
import { discoverTwitter } from "./twitter.js";

/**
 * Discover candidates for a subject across the requested platforms and
 * concatenate the results. Unknown platforms are ignored.
 */
export async function discover(
  subject: Subject,
  platforms: Platform[],
): Promise<Candidate[]> {
  const out: Candidate[] = [];
  const failures: string[] = [];

  // Isolate each platform: a failure on one (e.g. a transient Apify error on
  // LinkedIn) must NOT discard another platform's already-fetched, already-paid
  // results. Only throw if EVERY requested platform failed.
  for (const platform of platforms) {
    try {
      if (platform === "x") {
        out.push(...(await discoverTwitter(subject)));
      } else if (platform === "linkedin") {
        out.push(...(await discoverLinkedIn(subject)));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push(`${platform}: ${msg}`);
      console.error(`discover: ${platform} discovery failed — ${msg}`);
    }
  }

  if (platforms.length > 0 && failures.length === platforms.length) {
    throw new Error(`All requested discovery platform(s) failed:\n${failures.join("\n")}`);
  }
  return out;
}
