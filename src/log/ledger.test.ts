import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { appendLedger, loadActionedUrls } from "./ledger.js";
import type { LedgerEntry } from "../types.js";

function tmpFile(): string {
  return path.join(
    os.tmpdir(),
    `blog-amplifier-ledger-${process.pid}-${Math.random().toString(36).slice(2)}.jsonl`,
  );
}

function entry(url: string, comment = "nice point"): LedgerEntry {
  return {
    ts: "2026-06-13T00:00:00.000Z",
    subjectId: "wwdc26-notes",
    platform: "x",
    url,
    comment,
    status: "posted",
  };
}

test("loadActionedUrls returns empty set when file is missing", async () => {
  const file = tmpFile();
  const urls = await loadActionedUrls({ file });
  assert.equal(urls.size, 0);
});

test("appendLedger dedups overlapping URLs and union is returned", async () => {
  const file = tmpFile();
  try {
    const first = await appendLedger(
      [entry("https://x.com/a/1"), entry("https://x.com/a/2")],
      { file },
    );
    assert.equal(first, 2);

    // Second batch overlaps on /1; only /3 is new.
    const second = await appendLedger(
      [entry("https://x.com/a/1"), entry("https://x.com/a/3")],
      { file },
    );
    assert.equal(second, 1);

    const urls = await loadActionedUrls({ file });
    assert.deepEqual(
      [...urls].sort(),
      ["https://x.com/a/1", "https://x.com/a/2", "https://x.com/a/3"],
    );

    // Sanity: the file holds exactly 3 JSON lines.
    const raw = await fs.readFile(file, "utf8");
    const lines = raw.split("\n").filter((l) => l.trim() !== "");
    assert.equal(lines.length, 3);
  } finally {
    await fs.rm(file, { force: true });
  }
});

test("appendLedger dedups within a single batch", async () => {
  const file = tmpFile();
  try {
    const count = await appendLedger(
      [entry("https://x.com/b/1"), entry("https://x.com/b/1")],
      { file },
    );
    assert.equal(count, 1);
    const urls = await loadActionedUrls({ file });
    assert.equal(urls.size, 1);
  } finally {
    await fs.rm(file, { force: true });
  }
});
