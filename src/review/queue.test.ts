import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { appendToReviewQueue, readApprovedRows } from "./queue.js";
import type { ScoredCandidate } from "../types.js";

function tmpFile(): string {
  return path.join(
    os.tmpdir(),
    `blog-amplifier-queue-${process.pid}-${Math.random().toString(36).slice(2)}.csv`,
  );
}

function scored(overrides: Partial<ScoredCandidate> = {}): ScoredCandidate {
  return {
    platform: "x",
    url: "https://x.com/a/1",
    author: "alice",
    authorFollowers: 1234,
    text: "Talking about WWDC26 Foundation Models",
    likes: 10,
    replies: 4,
    reposts: 2,
    createdAt: "2026-06-12T10:00:00.000Z",
    relevance: 87.654,
    rationale: "on topic",
    engagementScore: 0.6789,
    recencyScore: 0.9123,
    score: 0.7456,
    draft: "Great take — the year-two API design is the real story.",
    ...overrides,
  };
}

test("appendToReviewQueue writes header + row when file is new", async () => {
  const file = tmpFile();
  try {
    await appendToReviewQueue([scored()], { runId: "run-1", subjectId: "wwdc26-notes" }, { file });

    const raw = await fs.readFile(file, "utf8");
    const lines = raw.split("\n").filter((l) => l.trim() !== "");
    assert.equal(lines.length, 2, "header + one data row");
    assert.ok(
      lines[0]?.startsWith(
        "run_id,subject_id,platform,score,relevance,engagement,recency,author,followers,created_at,url,post_text,draft_comment,decision,final_comment",
      ),
      "header has columns in exact order",
    );
    // Values rounded to 3 dp.
    assert.match(lines[1] ?? "", /0\.746/);
    assert.match(lines[1] ?? "", /87\.654/);
  } finally {
    await fs.rm(file, { force: true });
  }
});

test("readApprovedRows keeps approved rows and falls back to draft_comment", async () => {
  const file = tmpFile();
  try {
    await appendToReviewQueue([scored()], { runId: "run-1", subjectId: "wwdc26-notes" }, { file });

    // Hand-write a second row: approved, blank final_comment → use draft_comment.
    const dataRow =
      [
        "run-1", // run_id
        "wwdc26-notes", // subject_id
        "linkedin", // platform
        "0.812", // score
        "90", // relevance
        "0.5", // engagement
        "0.7", // recency
        "bob", // author
        "999", // followers
        "2026-06-11T00:00:00.000Z", // created_at
        "https://www.linkedin.com/posts/bob-2", // url
        "post body", // post_text
        "draft fallback comment", // draft_comment
        "approve", // decision
        "", // final_comment (blank)
      ].join(",") + "\n";
    await fs.appendFile(file, dataRow, "utf8");

    const approved = await readApprovedRows({ file });
    assert.equal(approved.length, 1, "only the approved row");
    const row = approved[0];
    assert.ok(row);
    assert.equal(row.platform, "linkedin");
    assert.equal(row.url, "https://www.linkedin.com/posts/bob-2");
    assert.equal(row.subjectId, "wwdc26-notes");
    assert.equal(row.comment, "draft fallback comment", "falls back to draft_comment");
  } finally {
    await fs.rm(file, { force: true });
  }
});

test("readApprovedRows prefers final_comment when present and skips pending/reject", async () => {
  const file = tmpFile();
  try {
    const header =
      "run_id,subject_id,platform,score,relevance,engagement,recency,author,followers,created_at,url,post_text,draft_comment,decision,final_comment\n";
    const approveWithFinal =
      "run-1,s,x,0.8,90,0.5,0.7,a,1,2026-06-11T00:00:00.000Z,https://x.com/1,body,draft,approve,edited final\n";
    const pending =
      "run-1,s,x,0.8,90,0.5,0.7,b,1,2026-06-11T00:00:00.000Z,https://x.com/2,body,draft,,\n";
    const reject =
      "run-1,s,x,0.8,90,0.5,0.7,c,1,2026-06-11T00:00:00.000Z,https://x.com/3,body,draft,reject,\n";
    await fs.writeFile(file, header + approveWithFinal + pending + reject, "utf8");

    const approved = await readApprovedRows({ file });
    assert.equal(approved.length, 1);
    assert.equal(approved[0]?.comment, "edited final");
    assert.equal(approved[0]?.url, "https://x.com/1");
  } finally {
    await fs.rm(file, { force: true });
  }
});

test("readApprovedRows returns [] when file is missing", async () => {
  const approved = await readApprovedRows({ file: tmpFile() });
  assert.deepEqual(approved, []);
});
