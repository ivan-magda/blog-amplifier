import { ApifyClient } from "apify-client";

/**
 * Run an Apify actor to completion and return its default-dataset items.
 *
 * `actor(id).call(input)` starts the run AND blocks until it finishes (the
 * SDK polls under the hood), so by the time it resolves the dataset is ready.
 * Items are an unknown shape — callers normalize defensively.
 */
export async function runActor(
  actorId: string,
  input: Record<string, unknown>,
  opts?: { maxItems?: number },
): Promise<Record<string, unknown>[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    throw new Error(
      "APIFY_TOKEN is not set — export it or add it to .env before running discovery.",
    );
  }

  const client = new ApifyClient({ token });
  const run = await client.actor(actorId).call(input);
  const { items } = await client
    .dataset(run.defaultDatasetId)
    .listItems(opts?.maxItems ? { limit: opts.maxItems } : {});

  return items as Record<string, unknown>[];
}
