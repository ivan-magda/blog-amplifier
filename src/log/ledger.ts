import fs from "node:fs/promises";
import path from "node:path";

import { config } from "../config.js";
import type { LedgerEntry } from "../types.js";

/**
 * Read the append-only action ledger and return the set of URLs already
 * actioned. Used both for `record` idempotency and to filter already-engaged
 * posts out of fresh candidate batches at discovery time.
 *
 * Missing file → empty set. Each non-empty line is a JSON-encoded
 * {@link LedgerEntry}; we collect their `url` fields.
 */
export async function loadActionedUrls(opts?: { file?: string }): Promise<Set<string>> {
  const file = opts?.file ?? config.paths.ledger;
  const urls = new Set<string>();

  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return urls;
    throw err;
  }

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    const entry = JSON.parse(trimmed) as LedgerEntry;
    if (entry.url) urls.add(entry.url);
  }

  return urls;
}

/**
 * Append ledger entries, skipping any whose `url` is already recorded (so
 * re-running `record` never double-records). Ensures the parent directory
 * exists. Returns the number of NEW entries actually appended.
 */
export async function appendLedger(
  entries: LedgerEntry[],
  opts?: { file?: string },
): Promise<number> {
  const file = opts?.file ?? config.paths.ledger;
  const existing = await loadActionedUrls({ file });

  const fresh: LedgerEntry[] = [];
  for (const entry of entries) {
    if (existing.has(entry.url)) continue;
    // Guard against duplicate URLs within this same batch.
    existing.add(entry.url);
    fresh.push(entry);
  }

  if (fresh.length === 0) return 0;

  await fs.mkdir(path.dirname(file), { recursive: true });
  const payload = fresh.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
  await fs.appendFile(file, payload, "utf8");

  return fresh.length;
}
