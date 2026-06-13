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
  for (const platform of platforms) {
    if (platform === "x") {
      out.push(...(await discoverTwitter(subject)));
    } else if (platform === "linkedin") {
      out.push(...(await discoverLinkedIn(subject)));
    }
  }
  return out;
}
