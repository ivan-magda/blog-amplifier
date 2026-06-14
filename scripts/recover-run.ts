/**
 * Recover a candidates batch from an Apify run whose status was not SUCCEEDED
 * (e.g. ABORTED at a partial count) — discover.ts deliberately refuses such runs,
 * but the data is already fetched + billed and sits in the run's dataset for a
 * few days. Pull it, normalize with the SAME mapping as src/discover/twitter.ts,
 * apply the ledger/owner filters, and write a normal candidates file so `judge`
 * can score it without a re-scrape.
 *
 *   tsx scripts/recover-run.ts <runId> <subjectId>
 */
import fs from "node:fs/promises";
import path from "node:path";
import { ApifyClient } from "apify-client";
import { config } from "../src/config.js";
import { num, obj, str } from "../src/discover/normalize.js";
import { dedupeByUrl, dropOwnerAuthors } from "../src/cli-helpers.js";
import { loadActionedUrls } from "../src/log/ledger.js";
import { loadSubject } from "../src/extract/index.js";
import type { Candidate, CandidateBatch } from "../src/types.js";

function stamp(): string {
  const iso = new Date().toISOString().replace(/[:.]/g, "-");
  return `${iso}-${Math.random().toString(36).slice(2, 6)}`;
}

async function main() {
  const [runId, subjectId] = process.argv.slice(2);
  if (!runId || !subjectId) {
    throw new Error("usage: tsx scripts/recover-run.ts <runId> <subjectId>");
  }
  const token = process.env.APIFY_TOKEN;
  if (!token)
    throw new Error("APIFY_TOKEN is not set (export it or add to .env).");

  const client = new ApifyClient({ token });
  const run = await client.run(runId).get();
  if (!run) throw new Error(`No Apify run found for id ${runId}`);
  console.log(
    `run ${runId}: status=${run.status}, dataset=${run.defaultDatasetId}`,
  );
  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  console.log(
    `fetched ${items.length} raw item(s) from the aborted run's dataset`,
  );

  // Mapping copied verbatim from src/discover/twitter.ts so recovered rows are
  // byte-identical to a real scrape.
  const found: Candidate[] = [];
  for (const it of items as Record<string, unknown>[]) {
    const author = obj(it.author);
    const text = str(it.text) ?? str(it.full_text);
    const url = str(it.url) ?? str(it.twitterUrl);
    if (!url || !text) continue;

    const authorName =
      str(author?.userName) ?? str(author?.username) ?? str(it.username) ?? "";
    const authorFollowers = author ? num(author.followers) : undefined;
    const views = it.viewCount != null ? num(it.viewCount) : undefined;

    found.push({
      platform: "x",
      url,
      author: authorName,
      ...(authorFollowers !== undefined ? { authorFollowers } : {}),
      text,
      likes: num(it.likeCount ?? it.favoriteCount),
      replies: num(it.replyCount),
      reposts: num(it.retweetCount),
      ...(views !== undefined ? { views } : {}),
      createdAt: str(it.createdAt) ?? "",
    });
  }

  const subject = await loadSubject(subjectId);
  const actioned = await loadActionedUrls();
  const deduped = dedupeByUrl(found, actioned);
  const kept = dropOwnerAuthors(deduped, subject.ownerHandles);
  const ownerDropped = deduped.length - kept.length;

  const batch: CandidateBatch = {
    subjectId,
    runAt: new Date().toISOString(),
    candidates: kept,
  };
  const file = path.join(
    config.paths.candidates,
    `${subjectId}-${stamp()}.candidates.json`,
  );
  await fs.writeFile(file, JSON.stringify(batch, null, 2) + "\n");
  console.log(
    `recovered ${found.length} mapped, kept ${kept.length} after ledger dedup` +
      (ownerDropped > 0 ? ` (+${ownerDropped} owner post(s) excluded)` : "") +
      ` → ${file}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
