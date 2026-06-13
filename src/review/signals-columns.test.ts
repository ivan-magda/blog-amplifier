import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { parse } from "csv-parse/sync";

import { appendToReviewQueue } from "./queue.js";
import type { ScoredCandidate } from "../types.js";

function tmp(): string {
  return path.join(os.tmpdir(), `ba-sig-${process.pid}-${Math.random().toString(36).slice(2)}.csv`);
}

function scored(over: Partial<ScoredCandidate>): ScoredCandidate {
  return {
    platform: "x",
    url: "https://x.com/1",
    author: "a",
    text: "t",
    likes: 0,
    replies: 0,
    reposts: 0,
    createdAt: "2026-06-12T00:00:00Z",
    relevance: 80,
    rationale: "",
    engagementScore: 0,
    recencyScore: 1,
    score: 0.6,
    ...over,
  };
}

test("appendToReviewQueue surfaces views, links_out, asks_question derived from the candidate", async () => {
  const file = tmp();
  try {
    const row = scored({
      platform: "x",
      views: 4200,
      text: "What changed? read https://a.dev and https://b.dev",
    });
    await appendToReviewQueue([row], { runId: "r", subjectId: "s" }, { file });
    const recs = parse(await fs.readFile(file, "utf8"), { columns: true }) as Record<string, string>[];
    const rec = recs[0];
    assert.ok(rec);
    assert.equal(rec.views, "4200");
    assert.equal(rec.links_out, "2", "counts the two outbound links");
    assert.equal(rec.asks_question, "true", "post contains a question mark");
    // The human-edit columns must remain present and blank.
    assert.equal(rec.decision, "");
    assert.equal(rec.final_comment, "");
  } finally {
    await fs.rm(file, { force: true });
  }
});

test("views is blank and signals are false for a candidate without views/links/question (e.g. LinkedIn)", async () => {
  const file = tmp();
  try {
    const row = scored({ platform: "linkedin", url: "https://lnkd.in/1", text: "no question here and no links" });
    await appendToReviewQueue([row], { runId: "r", subjectId: "s" }, { file });
    const recs = parse(await fs.readFile(file, "utf8"), { columns: true }) as Record<string, string>[];
    const rec = recs[0];
    assert.ok(rec);
    assert.equal(rec.views, "", "no views for LinkedIn");
    assert.equal(rec.links_out, "0");
    assert.equal(rec.asks_question, "false");
  } finally {
    await fs.rm(file, { force: true });
  }
});
